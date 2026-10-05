import { useId, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { LoadingIndicator } from "./LoadingIndicator";
import {
  isNotificationEmailInput,
  updateOwnNotificationEmail,
} from "./services/notificationSettings";
import type { ShowToast } from "./services/toastStack";
import { readShortUserMessage } from "./services/userFacingMessages";

type DialogState =
  | { status: "closed" }
  | { status: "open"; email: string; isSaving: boolean; message: string };

/**
 * Задача 130: во вкладке `Настройки` пользователь сам указывает или
 * исправляет Email, на который приходят рассылки. Адрес хранит и проверяет
 * сервер; текущее значение приходит из уже загруженных настроек вкладки.
 */
export function NotificationEmailButton({
  email,
  onSaved,
  onShowToast,
}: {
  email: string | undefined;
  onSaved: (email: string) => void;
  onShowToast: ShowToast;
}) {
  const [state, setState] = useState<DialogState>({ status: "closed" });
  const titleId = useId();
  const inputId = useId();
  const isSaving = state.status === "open" && state.isSaving;

  function close() {
    if (isSaving) return;
    setState({ status: "closed" });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.status !== "open" || state.isSaving) return;
    const nextEmail = state.email.trim();
    if (!isNotificationEmailInput(nextEmail)) {
      setState({
        ...state,
        message: "Введите корректный е-мейл, например name@example.com.",
      });
      return;
    }

    setState({ ...state, isSaving: true, message: "" });
    const result = await updateOwnNotificationEmail(nextEmail);
    if (result.status === "error") {
      setState((current) => current.status === "open"
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

    const savedEmail = result.email;
    setState({ status: "closed" });
    onSaved(savedEmail);
    onShowToast(
      "Е-мейл сохранён",
      `Рассылки будут приходить на ${savedEmail}.`,
      "success",
    );
  }

  return (
    <>
      <button
        className="secondary-button notification-email-button"
        type="button"
        onClick={() => {
          setState({
            status: "open",
            email: email ?? "",
            isSaving: false,
            message: "",
          });
        }}
      >
        Добавить/изменить е-мейл для рассылки
      </button>
      {state.status === "open"
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
                  <p>
                    {email === undefined
                      ? "Укажите е-мейл, на который будут приходить сообщения рассылки."
                      : "Сообщения рассылки приходят на этот адрес. Его можно исправить."}
                  </p>
                </div>
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
                        const nextEmail = event.currentTarget.value;
                        setState((current) => current.status === "open"
                          ? { ...current, email: nextEmail, message: "" }
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
              </section>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
