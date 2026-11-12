/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SMB_APP_ENV?: "test" | "production";
  readonly VITE_SMB_REMOTE_API_URL?: string;
  /** Название продукта экземпляра сайта; без него — «НМОУ Вектор». */
  readonly VITE_SMB_PRODUCT_NAME?: string;
}
