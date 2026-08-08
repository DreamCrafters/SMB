import type { NotificationTone } from "../contracts/notifications.js";

export type AppToastState = "visible" | "exiting";
export type ShowToast = (
  title: string,
  message: string,
  tone: NotificationTone,
) => void;

export type AppToast = {
  id: number;
  title: string;
  message: string;
  tone: NotificationTone;
  state: AppToastState;
};

export function shouldToastAutoDismiss(tone: NotificationTone) {
  return tone === "success";
}

export function prependToast(
  currentToasts: readonly AppToast[],
  toast: AppToast,
) {
  return [toast, ...currentToasts];
}

export function markToastExiting(
  currentToasts: readonly AppToast[],
  toastId: number,
) {
  return currentToasts.map((toast) =>
    toast.id === toastId ? { ...toast, state: "exiting" as const } : toast,
  );
}

export function removeToast(
  currentToasts: readonly AppToast[],
  toastId: number,
) {
  return currentToasts.filter((toast) => toast.id !== toastId);
}
