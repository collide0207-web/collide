/**
 * Thin client for the collab server's WebRTC signaling relay (`/rtc/<roomId>`).
 *
 * It carries only the small JSON control frames for a mesh call — SDP offer/answer,
 * ICE candidates, and mic/cam state. Media itself flows peer-to-peer over
 * RTCPeerConnection and never touches this socket. Auto-reconnects with backoff,
 * mirroring the resilience of the Yjs provider in `collab/yjs.ts`.
 *
 * LATER: swap the whole call layer to a LiveKit SFU by replacing useCall — this
 * signaling channel and the mesh peer connections go away together.
 */

// e.g. VITE_SIGNAL_URL=ws://localhost:4000/rtc  (base; roomId is appended)
const SIGNAL_URL = (import.meta.env.VITE_SIGNAL_URL as string) || 'ws://localhost:4000/rtc'

/** Public info about a peer in the room, as broadcast by the server. */
export interface PeerInfo {
  sessionId: string
  userId: string
  name: string
  role: string
}

/** Frames the server sends down to a client. */
export type ServerFrame =
  | { type: 'peers'; peers: PeerInfo[] }
  | { type: 'peer-join'; peer: PeerInfo }
  | { type: 'peer-leave'; sessionId: string }
  | { type: 'offer'; from: string; data: RTCSessionDescriptionInit }
  | { type: 'answer'; from: string; data: RTCSessionDescriptionInit }
  | { type: 'ice'; from: string; data: RTCIceCandidateInit }
  | { type: 'media-state'; from: string; micOn: boolean; camOn: boolean; sharing: boolean }

/** Frames a client sends up to the server (relayed to `to`, or broadcast). */
export type ClientFrame =
  | { type: 'offer' | 'answer'; to: string; data: RTCSessionDescriptionInit }
  | { type: 'ice'; to: string; data: RTCIceCandidateInit }
  | { type: 'media-state'; micOn: boolean; camOn: boolean; sharing: boolean }

export type CallStatus = 'connecting' | 'connected' | 'disconnected'

export class CallSignaling {
  private ws: WebSocket | null = null
  private closed = false
  private backoff = 1000

  constructor(
    private roomId: string,
    private onFrame: (f: ServerFrame) => void,
    private onStatus: (s: CallStatus) => void,
    private token?: string,
    private role?: string,
  ) {
    this.connect()
  }

  private connect() {
    if (this.closed) return
    this.onStatus('connecting')
    const params = new URLSearchParams()
    if (this.token) params.set('token', this.token)
    if (this.role) params.set('role', this.role)
    const q = params.toString() ? `?${params.toString()}` : ''
    const ws = new WebSocket(`${SIGNAL_URL}/${encodeURIComponent(this.roomId)}${q}`)
    this.ws = ws

    ws.onopen = () => {
      this.backoff = 1000
      this.onStatus('connected')
    }
    ws.onmessage = (ev) => {
      try {
        this.onFrame(JSON.parse(ev.data as string) as ServerFrame)
      } catch {
        /* ignore malformed frame */
      }
    }
    ws.onclose = () => {
      this.onStatus('disconnected')
      if (this.closed) return
      // reconnect with capped exponential backoff + jitter (thundering-herd safe)
      const delay = Math.min(this.backoff, 15000) + Math.random() * 500
      this.backoff *= 2
      setTimeout(() => this.connect(), delay)
    }
    ws.onerror = () => ws.close()
  }

  send(frame: ClientFrame) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(frame))
  }

  close() {
    this.closed = true
    this.ws?.close()
    this.ws = null
  }
}

/** Fetch ICE servers (STUN now, TURN later) from the collab server. */
export async function fetchIceServers(): Promise<RTCIceServer[]> {
  try {
    const base = SIGNAL_URL.replace(/^ws/, 'http').replace(/\/rtc$/, '')
    const res = await fetch(`${base}/rtc/ice`)
    const json = (await res.json()) as { iceServers: RTCIceServer[] }
    return json.iceServers ?? []
  } catch {
    // Fallback so calls still work if the endpoint is unreachable.
    return [{ urls: 'stun:stun.l.google.com:19302' }]
  }
}
