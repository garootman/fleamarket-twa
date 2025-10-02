/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WORKER_URL: string
  readonly VITE_R2_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}