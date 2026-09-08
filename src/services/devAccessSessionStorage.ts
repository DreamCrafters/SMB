const DEV_ACCESS_SESSION_STORAGE_KEY = "smb.devAccessSessionId";
const DEV_ACCESS_SESSION_HEADER = "X-SMB-Dev-Session";
const ACCOUNT_PREVIEW_STORAGE_KEY = "smb.accountPreviewTarget";
const ACCOUNT_PREVIEW_HEADER = "X-SMB-Account-Preview";

/**
 * Заголовки собираются здесь для всех запросов, поэтому адрес предпросмотра
 * тоже живёт тут: иначе его пришлось бы прокидывать в каждый из трёх десятков
 * сервисов. Сам доступ к предпросмотру проверяет сервер — в заголовке лежит
 * только адрес цели, а не права.
 */
export function buildDevAccessHeaders(headers: Record<string, string>) {
  const sessionId = readStoredDevAccessSessionId();
  const previewTarget = readStoredAccountPreviewTarget();

  return {
    ...headers,
    ...(sessionId === undefined
      ? {}
      : { [DEV_ACCESS_SESSION_HEADER]: sessionId }),
    ...(previewTarget === undefined
      ? {}
      : { [ACCOUNT_PREVIEW_HEADER]: previewTarget }),
  };
}

export function storeAccountPreviewTarget(target: string) {
  const storage = readSessionStorage();

  try {
    storage?.setItem(ACCOUNT_PREVIEW_STORAGE_KEY, target);
  } catch {
    // Без хранилища предпросмотр останется в правах самого админа.
  }
}

export function clearStoredAccountPreviewTarget() {
  const storage = readSessionStorage();

  try {
    storage?.removeItem(ACCOUNT_PREVIEW_STORAGE_KEY);
  } catch {
    // Ignore unavailable storage.
  }
}

export function readStoredAccountPreviewTarget() {
  const storage = readSessionStorage();

  try {
    const value = storage?.getItem(ACCOUNT_PREVIEW_STORAGE_KEY)?.trim();

    return value && value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

export function storeDevAccessSessionId(sessionId: string | undefined) {
  if (sessionId === undefined || sessionId.trim().length === 0) {
    return;
  }

  const storage = readSessionStorage();

  try {
    storage?.setItem(DEV_ACCESS_SESSION_STORAGE_KEY, sessionId.trim());
  } catch {
    // Dev auth can still fall back to the HttpOnly cookie on same-site setups.
  }
}

export function clearStoredDevAccessSessionId() {
  const storage = readSessionStorage();

  try {
    storage?.removeItem(DEV_ACCESS_SESSION_STORAGE_KEY);
  } catch {
    // Ignore unavailable storage; the server clears its cookie separately.
  }
}

function readStoredDevAccessSessionId() {
  const storage = readSessionStorage();

  try {
    const value = storage?.getItem(DEV_ACCESS_SESSION_STORAGE_KEY)?.trim();

    return value && value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

function readSessionStorage() {
  return typeof window === "undefined" ? undefined : window.sessionStorage;
}
