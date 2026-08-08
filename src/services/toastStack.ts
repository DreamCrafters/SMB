export type AppToastState = "visible" | "exiting";

export type AppToast = {
  id: number;
  title: string;
  message: string;
  state: AppToastState;
};

export function shouldToastAutoDismiss(title: string) {
  return title === "Добро пожаловать";
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
