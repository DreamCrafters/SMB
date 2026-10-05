import { useEffect, useId, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { LoadingIndicator } from "./LoadingIndicator";
import {
  isNotificationEmailInput,
  requestOwnNotificationEmail,
  updateOwnNotificationEmail,
} from "./services/notificationSettings";
import type { ShowToast } from "./services/toastStack";
import { readShortUserMessage } from "./services/userFacingMessages";

type DialogState =
  | { status: "closed" }
  | { status: "loading" }
  | {
      status: "ready";
      savedEmail?: string;
      email: string;
      isSaving: boolean;
      message: string;
    }
  | { status: "error"; message: string };

/**
 * Задача 130: любой аккаунт из общей панели навигации указывает или
 * исправляет Email, на который приходят рассылки. Адрес хранит и проверяет
 * сервер; включение каналов по типам сообщений остаётся во вкладке `Настройки`.
 */
export function NotificationEmailButton({
  onOpen,
  onShowToast,
}: {
  onOpen: () => void;
  onShowToast: ShowToast;
}) {
  const [state, setState] = useState<DialogState>({ status: "closed" });
  const titleId = useId();
  const inputId = useId();
  const isOpen = state.status !== "closed";

  useEffect(() => {
    if (state.status !== "loading") return;
    const controller = new AbortController();
    requestOwnNotificationEmail({ signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      setState(result.status === "ready"
        ? {
            status: "ready",
            ...(result.email === undefined ? {} : { savedEmail: result.email }),
            email: result.email ?? "",
            isSaving: false,
            message: "",
          }
        : {
            status: "error",
            message: readShortUserMessage(
              result.message,
              "Не удалось загрузить е-мейл.",
            ),
          });
    });
    return () => controller.abort();
  }, [state.status]);

  const isSaving = state.status === "ready" && state.isSaving;

  function close() {
    if (isSaving) return;
    setState({ status: "closed" });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.status !== "ready" || state.isSaving) return;
    const email = state.email.trim();
    if (!isNotificationEmailInput(email)) {
      setState({
        ...state,
        message: "Введите корректный е-мейл, например name@example.com.",
      });
      return;
    }

    setState({ ...state, isSaving: true, message: "" });
    const result = await updateOwnNotificationEmail(email);
    if (result.status === "error") {
      setState((current) => current.status === "ready"
        ? {
            ...current,
            isSaving: false,
            message: readShortUserMessage(
              result.message,
              "Не удалось сохранить е-мейл.",
            ),
          }
        : current);
      return;
    }

    setState({ status: "closed" });
    onShowToast(
      "Е-мейл сохранён",
      `Рассылки будут приходить на ${result.email ?? email}.`,
      "success",
    );
  }

  return (
    <>
      <button
        className="rail-logout-button rail-notification-email-button"
        type="button"
        onClick={() => {
          onOpen();
          setState({ status: "loading" });
        }}
      >
        Добавить/изменить е-мейл для рассылки
      </button>
      {isOpen
        ? createPortal(
            <div
              className="admin-db-modal-backdrop"
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) close();
              }}
            >
              <section
                aria-labelledby={titleId}
                aria-modal="true"
                className="admin-db-editor admin-db-clear-dialog notification-email-dialog"
                role="dialog"
              >
                <div className="admin-db-clear-copy">
                  <span>Рассылки</span>
                  <strong id={titleId}>Е-мейл для рассылки</strong>
                  {state.status === "ready"
                    ? (
                        <p>
                          {state.savedEmail === undefined
                            ? "Укажите е-мейл, на который будут приходить сообщения рассылки."
                            : "Сообщения рассылки приходят на этот адрес. Его можно исправить."}
                        </p>
                      )
                    : null}
                </div>
                {state.status === "loading"
                  ? <LoadingIndicator label="Загружаем е-мейл…" variant="inline" />
                  : null}
                {state.status === "error"
                  ? (
                      <>
                        <p className="form-message is-error" role="alert">
                          {state.message}
                        </p>
                        <div className="admin-db-actions">
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={close}
                          >
                            Закрыть
                          </button>
                        </div>
                      </>
                    )
                  : null}
                {state.status === "ready"
                  ? (
                      <form noValidate onSubmit={submit}>
                        <label className="admin-db-editor-field" htmlFor={inputId}>
                          <span>Е-мейл</span>
                          <input
                            autoComplete="email"
                            autoFocus
                            disabled={state.isSaving}
                            id={inputId}
                            inputMode="email"
                            maxLength={320}
                            placeholder="name@example.com"
                            type="email"
                            value={state.email}
                            onChange={(event) => {
                              const email = event.currentTarget.value;
                              setState((current) => current.status === "ready"
                                ? { ...current, email, message: "" }
                                : current);
                            }}
                          />
                        </label>
                        {state.message === ""
                          ? null
                          : (
                              <p className="form-message is-error" role="alert">
                                {state.message}
                              </p>
                            )}
                        <div className="admin-db-actions">
                          <button
                            className="secondary-button"
                            disabled={state.isSaving}
                            type="button"
                            onClick={close}
                          >
                            Отмена
                          </button>
                          <button
                            className="primary-button"
                            disabled={state.isSaving}
                            type="submit"
                          >
                            {state.isSaving
                              ? <LoadingIndicator label="Отправляем…" variant="button" />
                              : "Отправить"}
                          </button>
                        </div>
                      </form>
                    )
                  : null}
              </section>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
