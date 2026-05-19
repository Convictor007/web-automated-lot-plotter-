/// <reference types="vite/client" />
/// <reference types="google.maps" />

declare module 'proj4/dist/proj4' {
  import proj4 from 'proj4'
  export default proj4
}

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  /** Embedded in client bundle — restrict by HTTP referrer in Google Cloud Console. */
  readonly VITE_GOOGLE_MAPS_API_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

export {}
