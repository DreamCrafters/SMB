export type SmbClientAppEnv = "test" | "production";

export function readClientAppEnv(): SmbClientAppEnv {
  const viteEnv = import.meta.env as ImportMetaEnv | undefined;
  const value = viteEnv?.VITE_SMB_APP_ENV?.trim().toLowerCase();

  return value === "production" ? "production" : "test";
}

export function isProductionAppEnv() {
  return readClientAppEnv() === "production";
}

/** Each deployment serves one organization; its product name comes from the build env. */
export const defaultClientProductName = "НМОУ Вектор";
const maxClientProductNameLength = 60;

export function resolveClientProductName(value: string | undefined) {
  const name = value?.trim() ?? "";
  return name.length > 0 && name.length <= maxClientProductNameLength ? name : defaultClientProductName;
}

export function readClientProductName() {
  const viteEnv = import.meta.env as ImportMetaEnv | undefined;
  return resolveClientProductName(viteEnv?.VITE_SMB_PRODUCT_NAME);
}

export function resolveClientSiteTitle(appEnv: SmbClientAppEnv) {
  return appEnv === "production" ? "Вектор" : "Вектор Тест";
}

export function readClientSiteTitle() {
  return resolveClientSiteTitle(readClientAppEnv());
}
