const DEV_ACCESS_SESSION_STORAGE_KEY = "smb.devAccessSessionId";
const DEV_ACCESS_SESSION_HEADER = "X-SMB-Dev-Session";

export function buildDevAccessHeaders(headers: Record<string, string>) {
  const sessionId = readStoredDevAccessSessionId();

  if (sessionId === undefined) {
    return headers;
  }

  return {
    ...headers,
    [DEV_ACCESS_SESSION_HEADER]: sessionId,
  };
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
