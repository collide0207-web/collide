# Collide — Frontend

Collaborative in-browser IDE + whiteboard. Multiple people open the same room via a
link and work together in real time. This is the **frontend**, and it runs with
**no backend**: code editing already syncs live across browser tabs via `y-webrtc`.

---

## Quick start

```bash
# 1. Clone
git clone git@github.com:collide0207-web/collide.git
cd collide

# 2. Install dependencies
npm install

# 3. Start the dev server
npm run dev
```

Then open the URL printed in the terminal (usually **http://localhost:5173**).

> Using HTTPS instead of SSH? Clone with:
> `git clone https://github.com/collide0207-web/collide.git`

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| **Node.js** | **18 or newer** (20+ recommended) | Check with `node -v`. Get it from [nodejs.org](https://nodejs.org) or via `nvm`. |
| **npm** | 9 or newer | Ships with Node. Check with `npm -v`. |
| A modern browser | Chrome / Edge / Firefox / Safari | Needed for camera preview + live sync. |

That's it — no database, no backend, no API keys required to run the frontend.

---

## Try the collaboration (the whole point)

1. Run `npm run dev` and open the app.
2. Click **Sign in & create a room** — you'll land in a room at a URL like
   `http://localhost:5173/room/r_xxx`.
3. **Copy that full room URL and paste it into a second browser tab** (or another
   browser window).
4. Type in the **code editor** in one tab — it appears live in the other. 🎉

Other things to try:
- **Run** a snippet: type `console.log("hello")` and click **▶ Run** (client-side
  JS preview for now).
- **Terminal** tab: a placeholder shell (no real backend process yet).
- **Call**: click **Call → Start camera** to see your own webcam (local only).
- **Roles**: use the `simulate role` dropdown — switch to **viewer** to see
  read-only mode; as **owner**, open **Share** to manage roles/links.

---

## Available scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Start the Vite dev server with hot reload |
| `npm run build` | Type-check (`tsc -b`) and build to `dist/` |
| `npm run preview` | Serve the production build locally to test it |

---

## Project structure

```
collide/
├─ index.html            # app entry
├─ src/
│  ├─ main.tsx           # React + router bootstrap
│  ├─ auth/              # mock login screen
│  ├─ rooms/             # room page, share dialog
│  ├─ editor/            # Monaco code editor (Yjs-bound)
│  ├─ board/             # tldraw whiteboard + keyboard focus isolation
│  ├─ run/               # Run button, Output panel, Terminal tab
│  ├─ video/             # video call panel (local preview)
│  ├─ collab/            # Yjs document + realtime provider
│  ├─ api/               # mock API layer = the backend contract
│  └─ store/             # session state (zustand)
└─ vite.config.ts
```

---

## Tech stack

- **React + TypeScript + Vite**
- **Monaco** (code editor) + **Yjs** / **y-monaco** / **y-webrtc** (real-time sync)
- **tldraw** (whiteboard)
- **xterm.js** (terminal UI)
- **zustand** (state)

---

## What works now
- Live multi-tab code editing with shared cursors (Monaco + Yjs).
- tldraw whiteboard (persists locally per room; live board collab is the next step).
- Mock auth + room/member/role API (`src/api/`) — defines the backend contract.
- Role-aware UI (owner / editor / viewer) with read-only mode and a Share dialog.
- Run button + Output panel (client-side JS preview).
- Terminal tab (xterm.js placeholder shell).
- Video call panel (real local camera preview).

## Not real yet — by design (lands with the backend)
These are laid out in the UI with clean swap-in seams:

| Feature | File | Becomes |
|---------|------|---------|
| Run / execution | `src/run/runner.ts` | `POST /execute` → E2B/Judge0 sandbox |
| Terminal | `src/run/TerminalTab.tsx` | WebSocket → sandbox PTY |
| Video | `src/video/VideoPanel.tsx` | LiveKit (token from backend) |
| API / auth / roles | `src/api/` | `httpApi` → Spring Boot control plane |
| Realtime transport | `src/collab/yjs.ts` | Hocuspocus / y-websocket provider |

> Auth, persistence, and **role enforcement** are UI-only in this scaffold. Viewers
> are only *visually* read-only — real enforcement happens server-side later.

---

## Troubleshooting

- **Port 5173 in use** → Vite picks the next free port; check the terminal for the
  actual URL, or run `npm run dev -- --port 3000`.
- **Live sync not working across tabs** → make sure you copied the **full room URL**
  (including `/room/r_xxx`) into the second tab, and both tabs are the same origin.
- **Camera preview blocked** → the browser needs camera permission; allow it when
  prompted. On some browsers this requires `http://localhost` (works) or HTTPS.
- **`npm install` fails** → confirm `node -v` is 18+; delete `node_modules` and
  `package-lock.json` and retry.
