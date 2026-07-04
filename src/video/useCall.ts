import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CallSignaling,
  fetchIceServers,
  type CallStatus,
  type PeerInfo,
  type ServerFrame,
} from './signaling'

/**
 * The single seam for the video call. Owns the local camera/mic/screen media and a
 * full mesh of RTCPeerConnections (one per remote peer), driven by the collab
 * server's signaling relay. Everything WebRTC lives here, so swapping to a LiveKit
 * SFU later replaces only this file — the tile components stay the same.
 *
 * Negotiation uses the WebRTC "perfect negotiation" pattern (polite/impolite decided
 * by comparing sessionIds) so simultaneous offers never deadlock.
 *
 * Cam/mic toggles flip `track.enabled` (no renegotiation) and broadcast a
 * media-state frame so remote tiles reflect mute/camera status. Screen share swaps
 * the outbound video track via replaceTrack (also no renegotiation).
 */

export interface RemoteParticipant {
  sessionId: string
  userId: string
  name: string
  role: string
  stream: MediaStream | null
  micOn: boolean
  camOn: boolean
  sharing: boolean
}

interface PeerState {
  info: PeerInfo
  pc: RTCPeerConnection
  polite: boolean
  makingOffer: boolean
  ignoreOffer: boolean
  audioSender: RTCRtpSender | null
  videoSender: RTCRtpSender | null
  stream: MediaStream
  micOn: boolean
  camOn: boolean
  sharing: boolean
}

export interface UseCall {
  status: CallStatus
  participants: RemoteParticipant[]
  localStream: MediaStream | null
  screenStream: MediaStream | null
  camOn: boolean
  micOn: boolean
  sharing: boolean
  toggleCam: () => Promise<void>
  toggleMic: () => Promise<void>
  toggleScreenShare: () => Promise<void>
  mediaError: string | null
}

export function useCall(roomId: string, token?: string, enabled = true, role?: string): UseCall {
  const [status, setStatus] = useState<CallStatus>('connecting')
  const [participants, setParticipants] = useState<RemoteParticipant[]>([])
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null)
  const [camOn, setCamOn] = useState(false)
  const [micOn, setMicOn] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [mediaError, setMediaError] = useState<string | null>(null)

  // Mutable call machinery kept in refs (not state) so re-renders don't churn it.
  const sigRef = useRef<CallSignaling | null>(null)
  const iceRef = useRef<RTCIceServer[]>([{ urls: 'stun:stun.l.google.com:19302' }])
  const peersRef = useRef<Map<string, PeerState>>(new Map())
  const localRef = useRef<MediaStream | null>(null)
  const camTrackRef = useRef<MediaStreamTrack | null>(null)
  const micTrackRef = useRef<MediaStreamTrack | null>(null)
  const screenTrackRef = useRef<MediaStreamTrack | null>(null)
  // Live view of local toggle state for code paths outside React (peer setup).
  const flagsRef = useRef({ micOn: false, camOn: false, sharing: false })

  /** Recompute the React participant list from the peer map (triggers re-render). */
  const syncParticipants = useCallback(() => {
    setParticipants(
      [...peersRef.current.values()].map((p) => ({
        sessionId: p.info.sessionId,
        userId: p.info.userId,
        name: p.info.name,
        role: p.info.role,
        stream: p.stream,
        micOn: p.micOn,
        camOn: p.camOn,
        sharing: p.sharing,
      })),
    )
  }, [])

  const broadcastMediaState = useCallback(() => {
    sigRef.current?.send({ type: 'media-state', ...flagsRef.current })
  }, [])

  /** Add or replace an outbound track on a peer (replaceTrack avoids renegotiation). */
  const publishTrack = useCallback((ps: PeerState, kind: 'audio' | 'video', track: MediaStreamTrack | null) => {
    const ref = kind === 'audio' ? 'audioSender' : 'videoSender'
    const existing = ps[ref]
    if (existing) {
      void existing.replaceTrack(track)
    } else if (track) {
      ps[ref] = ps.pc.addTrack(track, ps.stream) // triggers negotiationneeded once
    }
  }, [])

  /** Push whatever we're currently sending to a single (usually new) peer. */
  const publishAllTo = useCallback(
    (ps: PeerState) => {
      if (micTrackRef.current) publishTrack(ps, 'audio', micTrackRef.current)
      const outboundVideo = flagsRef.current.sharing ? screenTrackRef.current : camTrackRef.current
      if (outboundVideo) publishTrack(ps, 'video', outboundVideo)
    },
    [publishTrack],
  )

  const createPeer = useCallback(
    (info: PeerInfo, mySessionId: string): PeerState => {
      const pc = new RTCPeerConnection({ iceServers: iceRef.current })
      // Deterministic, opposite on each side: exactly one peer is "polite".
      const polite = mySessionId > info.sessionId
      const ps: PeerState = {
        info,
        pc,
        polite,
        makingOffer: false,
        ignoreOffer: false,
        audioSender: null,
        videoSender: null,
        stream: new MediaStream(),
        micOn: false,
        camOn: false,
        sharing: false,
      }

      pc.onnegotiationneeded = async () => {
        try {
          ps.makingOffer = true
          await pc.setLocalDescription()
          sigRef.current?.send({ type: 'offer', to: info.sessionId, data: pc.localDescription! })
        } catch {
          /* transient — will renegotiate again */
        } finally {
          ps.makingOffer = false
        }
      }
      pc.onicecandidate = ({ candidate }) => {
        if (candidate) sigRef.current?.send({ type: 'ice', to: info.sessionId, data: candidate.toJSON() })
      }
      pc.ontrack = ({ track, streams }) => {
        ps.stream = streams[0] ?? ps.stream
        // Remote may drop a track (e.g. stop screen with no camera) — reflect it.
        track.onended = () => syncParticipants()
        syncParticipants()
      }
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') pc.restartIce()
      }

      peersRef.current.set(info.sessionId, ps)
      publishAllTo(ps)
      return ps
    },
    [publishAllTo, syncParticipants],
  )

  const dropPeer = useCallback(
    (sessionId: string) => {
      const ps = peersRef.current.get(sessionId)
      if (!ps) return
      ps.pc.onnegotiationneeded = null
      ps.pc.onicecandidate = null
      ps.pc.ontrack = null
      ps.pc.close()
      peersRef.current.delete(sessionId)
      syncParticipants()
    },
    [syncParticipants],
  )

  // ---- lifecycle: connect signaling, wire frame handling, tear everything down ----
  useEffect(() => {
    if (!enabled) return
    let disposed = false
    let mySessionId = '' // learned lazily; we compare against it for politeness

    const handleFrame = async (f: ServerFrame) => {
      if (disposed) return
      switch (f.type) {
        case 'peers':
          // We are the newcomer: open a connection to everyone already here.
          for (const info of f.peers) if (!peersRef.current.has(info.sessionId)) createPeer(info, mySessionId)
          syncParticipants()
          break
        case 'peer-join':
          if (!peersRef.current.has(f.peer.sessionId)) createPeer(f.peer, mySessionId)
          syncParticipants()
          break
        case 'peer-leave':
          dropPeer(f.sessionId)
          break
        case 'offer':
        case 'answer':
        case 'ice':
          await handleNegotiation(f)
          break
        case 'media-state': {
          const ps = peersRef.current.get(f.from)
          if (ps) {
            ps.micOn = f.micOn
            ps.camOn = f.camOn
            ps.sharing = f.sharing
            syncParticipants()
          }
          break
        }
      }
    }

    const handleNegotiation = async (f: Extract<ServerFrame, { type: 'offer' | 'answer' | 'ice' }>) => {
      const ps = peersRef.current.get(f.from)
      if (!ps) return
      const { pc } = ps
      try {
        if (f.type === 'ice') {
          try {
            await pc.addIceCandidate(f.data)
          } catch {
            if (!ps.ignoreOffer) throw new Error('ice')
          }
          return
        }
        const description = f.data
        const offerCollision =
          description.type === 'offer' && (ps.makingOffer || pc.signalingState !== 'stable')
        ps.ignoreOffer = !ps.polite && offerCollision
        if (ps.ignoreOffer) return

        await pc.setRemoteDescription(description)
        if (description.type === 'offer') {
          await pc.setLocalDescription()
          sigRef.current?.send({ type: 'answer', to: f.from, data: pc.localDescription! })
        }
      } catch {
        /* negotiation hiccup — perfect negotiation recovers on the next event */
      }
    }

    ;(async () => {
      iceRef.current = await fetchIceServers()
      if (disposed) return
      // Peers exchange sessionIds via SDP; but for politeness we just need a stable
      // local id. Use a random one — comparison only needs to be consistent.
      mySessionId = crypto.randomUUID()
      sigRef.current = new CallSignaling(roomId, (f) => void handleFrame(f), setStatus, token, role)
    })()

    return () => {
      disposed = true
      sigRef.current?.close()
      sigRef.current = null
      peersRef.current.forEach((ps) => ps.pc.close())
      peersRef.current.clear()
      localRef.current?.getTracks().forEach((t) => t.stop())
      localRef.current = null
      camTrackRef.current = null
      micTrackRef.current = null
      screenTrackRef.current?.stop()
      screenTrackRef.current = null
      flagsRef.current = { micOn: false, camOn: false, sharing: false }
      setLocalStream(null)
      setScreenStream(null)
      setParticipants([])
      setCamOn(false)
      setMicOn(false)
      setSharing(false)
    }
  }, [roomId, token, enabled, role, createPeer, dropPeer, syncParticipants])

  /** Acquire camera+mic once (tracks start disabled), publish to all peers. */
  const ensureLocalMedia = useCallback(async (): Promise<MediaStream> => {
    if (localRef.current) return localRef.current
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    stream.getTracks().forEach((t) => (t.enabled = false)) // start muted/paused
    localRef.current = stream
    camTrackRef.current = stream.getVideoTracks()[0] ?? null
    micTrackRef.current = stream.getAudioTracks()[0] ?? null
    setLocalStream(stream)
    // publish audio, and video unless a screen share currently owns the video slot
    peersRef.current.forEach((ps) => {
      if (micTrackRef.current) publishTrack(ps, 'audio', micTrackRef.current)
      if (!flagsRef.current.sharing && camTrackRef.current) publishTrack(ps, 'video', camTrackRef.current)
    })
    return stream
  }, [publishTrack])

  const toggleCam = useCallback(async () => {
    try {
      await ensureLocalMedia()
      const next = !flagsRef.current.camOn
      if (camTrackRef.current) camTrackRef.current.enabled = next
      flagsRef.current.camOn = next
      setCamOn(next)
      setMediaError(null)
      broadcastMediaState()
    } catch {
      setMediaError('Camera/mic blocked')
    }
  }, [ensureLocalMedia, broadcastMediaState])

  const toggleMic = useCallback(async () => {
    try {
      await ensureLocalMedia()
      const next = !flagsRef.current.micOn
      if (micTrackRef.current) micTrackRef.current.enabled = next
      flagsRef.current.micOn = next
      setMicOn(next)
      setMediaError(null)
      broadcastMediaState()
    } catch {
      setMediaError('Camera/mic blocked')
    }
  }, [ensureLocalMedia, broadcastMediaState])

  const stopScreenShare = useCallback(() => {
    screenTrackRef.current?.stop()
    screenTrackRef.current = null
    setScreenStream(null)
    flagsRef.current.sharing = false
    setSharing(false)
    // hand the video slot back to the camera (or nothing if camera is off/absent)
    const cam = flagsRef.current.camOn ? camTrackRef.current : null
    peersRef.current.forEach((ps) => publishTrack(ps, 'video', cam))
    broadcastMediaState()
  }, [publishTrack, broadcastMediaState])

  const startScreenShare = useCallback(async () => {
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true })
      const track = display.getVideoTracks()[0]
      if (!track) return
      screenTrackRef.current = track
      setScreenStream(display)
      track.onended = () => stopScreenShare() // OS "Stop sharing" button
      flagsRef.current.sharing = true
      setSharing(true)
      peersRef.current.forEach((ps) => publishTrack(ps, 'video', track))
      broadcastMediaState()
    } catch {
      /* user cancelled the picker */
    }
  }, [publishTrack, broadcastMediaState, stopScreenShare])

  const toggleScreenShare = useCallback(async () => {
    if (flagsRef.current.sharing) stopScreenShare()
    else await startScreenShare()
  }, [startScreenShare, stopScreenShare])

  return {
    status,
    participants,
    localStream,
    screenStream,
    camOn,
    micOn,
    sharing,
    toggleCam,
    toggleMic,
    toggleScreenShare,
    mediaError,
  }
}
