/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LICENSE_API_BASE?: string
  readonly VITE_CONTENT_EXTRACT_CLI_HOST?: string
  readonly VITE_CONTENT_EXTRACT_CLI_PORT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
