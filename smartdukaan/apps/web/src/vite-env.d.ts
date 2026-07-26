/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Absolute API origin for packaged/native builds (no trailing slash). */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
