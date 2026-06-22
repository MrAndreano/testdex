/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BASE_PATH?: string;
  readonly VITE_SITE_URL?: string;
  readonly VITE_TON_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
