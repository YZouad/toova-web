/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TRELLIS_GENERATE_URL?: string;
  readonly VITE_AMAZON_AFFILIATE_TAG?: string;
  readonly VITE_GA_MEASUREMENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
