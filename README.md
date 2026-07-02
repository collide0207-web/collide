# Collide — Frontend

Frontend-first scaffold for the collaborative IDE + whiteboard. Runs with **no
backend**: code editing syncs live across browser tabs via `y-webrtc`.

## Run

```bash
npm install
npm run dev
```

Open the printed URL. Click **Sign in & create a room**, then **copy the room URL
into a second browser tab** — type in the code editor and watch it sync live.

## What works now
- Monaco code editor bound to a shared Yjs document (live multi-tab editing + cursors).
- tldraw whiteboard (persists locally per room; live collab is the next step).
- Mock auth + room/member/role API (`src/api/`) — the backend contract.
- Role-aware UI: switch `simulate role` to **viewer** to see read-only mode.
- Owner **Share** dialog: generate role links, change member roles, revoke.
- **Run** button + **Output** panel (client-side JS preview placeholder).
- **Terminal** tab (xterm.js, local fake shell placeholder).
- **Call** panel — real local camera preview (getUserMedia) + placeholder remote tile.

## Placeholders waiting on the backend (layout done, logic later)
- `src/run/runner.ts` — swap client-side eval → `POST /execute` (E2B/Judge0 sandbox).
- `src/run/TerminalTab.tsx` — swap fake shell → WebSocket to sandbox PTY.
- `src/video/VideoPanel.tsx` — swap local preview → LiveKit (token from backend).

## Architecture seams (so backend swap is clean later)
- `src/api/` — swap `mockApi` → `httpApi` (Spring Boot) without touching components.
- `src/collab/yjs.ts` — swap `WebrtcProvider` → Hocuspocus/y-websocket provider.

## Not real yet (by design — lands with the backend)
- Auth, persistence, and **role enforcement** are UI-only here. Viewers are only
  visually read-only; real enforcement happens server-side at the sync layer.
