/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_COLLAB_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
