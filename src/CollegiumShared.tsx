import { useEffect, useMemo, useState } from "react";
import {
  collegiumAttachmentLimits,
  type CollegiumAttachment,
  type CollegiumPerson,
} from "./contracts/collegiumInitiatives";
import type { CollegiumAttachmentsApi } from "./services/collegiumInitiatives";
import type { ShowToast } from "./services/toastStack";
import { readShortUserMessage } from "./services/userFacingMessages";

/** Общие части интерфейса «Инициатив Коллегии»: инициативы и заседания. */

export type LoadState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; message: string };

/** Загрузка server-owned данных с отменой устаревшего запроса. */
export function useServerData<T>(
  load: ((signal: AbortSignal) => Promise<T>) | undefined,
  fallbackMessage: string,
  version: number,
) {
  const [state, setState] = useState<LoadState<T>>({ status: "loading" });
  useEffect(() => {
    if (load === undefined) return;
    const controller = new AbortController();
    load(controller.signal).then(
      (data) => setState({ status: "ready", data }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          message: readShortUserMessage(error instanceof Error ? error.message : "", fallbackMessage),
        });
      },
    );
    return () => controller.abort();
    // `load` is recreated per render; `version` identifies the data to load.
  }, [version, fallbackMessage]);
  return state;
}

export function usePeopleIndex(people: CollegiumPerson[]) {
  return useMemo(() => {
    const names = new Map(people.map((person) => [person.id, person.displayName]));
    return { name: (accountId: string) => names.get(accountId) ?? "" };
  }, [people]);
}


export function AttachmentsSection({
  ownerLabel,
  attachments,
  canAttach,
  api,
  onChanged,
  onShowToast,
}: {
  ownerLabel: string;
  attachments: CollegiumAttachment[];
  canAttach: boolean;
  api: CollegiumAttachmentsApi;
  onChanged: () => void;
  onShowToast: ShowToast;
}) {
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const isFull = attachments.length >= collegiumAttachmentLimits.maxOwnerItems;

  async function run(operation: () => Promise<unknown>, success?: string) {
    setIsSaving(true);
    setMessage("");
    try {
      await operation();
      if (success !== undefined) {
        onShowToast(success, ownerLabel, "success");
        onChanged();
      }
      return true;
    } catch (error) {
      setMessage(readShortUserMessage(
        error instanceof Error ? error.message : "",
        "Не удалось сохранить материал.",
      ));
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="collegium-card-section">
      <h4>Материалы</h4>
      {attachments.length === 0 ? (
        <p className="collegium-empty-note">Материалов пока нет.</p>
      ) : (
        <ul className="collegium-attachments">
          {attachments.map((attachment) => (
            <li key={attachment.id}>
              {attachment.kind === "link" ? (
                <a href={attachment.url} rel="noreferrer noopener" target="_blank">{attachment.label}</a>
              ) : (
                <button
                  className="board-assignment-link"
                  disabled={isSaving}
                  type="button"
                  onClick={() => void run(async () => {
                    const blob = await api.download(attachment.id);
                    saveBlob(blob, attachment.fileName ?? attachment.label);
                  })}
                >
                  {attachment.label}
                </button>
              )}
              <span className="collegium-attachment-meta">
                {[
                  attachment.kind === "link" ? "ссылка" : formatFileSize(attachment.sizeBytes ?? 0),
                  attachment.createdByDisplayName,
                  formatDateTime(attachment.createdAt),
                ].join(" · ")}
              </span>
              {canAttach ? (
                <button
                  className="secondary-button"
                  disabled={isSaving}
                  type="button"
                  onClick={() => void run(
                    () => api.remove(attachment.id),
                    "Материал удалён",
                  )}
                >
                  Удалить
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canAttach ? (
        <div className="collegium-attachment-controls">
          <label className="collegium-field">
            <span>Приложить файл (PDF, DOCX, XLSX, PNG, JPEG до 7 МБ)</span>
            <input
              accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg"
              disabled={isSaving || isFull}
              type="file"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (file === undefined) return;
                if (file.size > collegiumAttachmentLimits.maxFileBytes) {
                  setMessage("Размер одного файла не должен превышать 7 МБ.");
                  return;
                }
                void run(() => api.upload(file), "Файл приложен");
              }}
            />
          </label>
          <form
            className="collegium-field-grid"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              if (linkUrl.trim() === "" || linkLabel.trim() === "") {
                setMessage("Укажите ссылку и подпись.");
                return;
              }
              void run(
                () => api.addLink({ url: linkUrl.trim(), label: linkLabel.trim() }),
                "Ссылка добавлена",
              ).then((saved) => {
                if (saved) {
                  setLinkUrl("");
                  setLinkLabel("");
                }
              });
            }}
          >
            <label className="collegium-field">
              <span>Ссылка (Google Drive, Яндекс Диск и т. п.)</span>
              <input
                disabled={isSaving || isFull}
                inputMode="url"
                maxLength={collegiumAttachmentLimits.maxUrlLength}
                placeholder="https://"
                value={linkUrl}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setLinkUrl(value);
                }}
              />
            </label>
            <label className="collegium-field">
              <span>Подпись ссылки</span>
              <input
                disabled={isSaving || isFull}
                maxLength={collegiumAttachmentLimits.maxLabelLength}
                value={linkLabel}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setLinkLabel(value);
                }}
              />
            </label>
            <div className="collegium-form-actions">
              <button className="secondary-button" disabled={isSaving || isFull} type="submit">
                Добавить ссылку
              </button>
            </div>
          </form>
          {isFull ? (
            <p className="collegium-note">
              {`Приложено максимальное число материалов: ${collegiumAttachmentLimits.maxOwnerItems}.`}
            </p>
          ) : null}
        </div>
      ) : null}
      {message === "" ? null : <p className="form-message is-error" role="alert">{message}</p>}
    </section>
  );
}

export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function formatFileSize(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} МБ`
    : `${Math.max(1, Math.round(bytes / 1024))} КБ`;
}

const amountFormatter = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatAmount(value: string, empty = "—") {
  return value === "" ? empty : `${amountFormatter.format(Number(value))} ₽`;
}


export function formatDate(value: string, empty = "—") {
  if (value === "") return empty;
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
