export type SmbClientAppEnv = "test" | "production";

export function readClientAppEnv(): SmbClientAppEnv {
  const viteEnv = import.meta.env as ImportMetaEnv | undefined;
  const value = viteEnv?.VITE_SMB_APP_ENV?.trim().toLowerCase();

  return value === "production" ? "production" : "test";
}

export function isProductionAppEnv() {
  return readClientAppEnv() === "production";
}
