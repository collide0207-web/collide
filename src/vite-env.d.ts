/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Collab (Yjs sync) WebSocket base, e.g. ws://localhost:4000/doc */
  readonly VITE_COLLAB_URL?: string
  /** Control-plane REST base, e.g. http://localhost:8080. Unset → use the in-memory mock. */
  readonly VITE_API_URL?: string
  /** Google OAuth2 client id for "Continue with Google". Unset → button hidden. */
  readonly VITE_GOOGLE_CLIENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
