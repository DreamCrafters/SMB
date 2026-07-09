/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SMB_APP_ENV?: "test" | "production";
  readonly VITE_SMB_REMOTE_API_URL?: string;
}
