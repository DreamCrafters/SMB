import { useId, useState } from "react";
import { LoadingIndicator } from "./LoadingIndicator";
import {
  normalizeProductBrandKey,
  type ProductBrandCreator,
} from "./useProductionBrands";

export function ProductBrandPicker({
  ariaLabel = "Марка",
  dataLabel = ariaLabel,
  defaultValue = "",
  disabled = false,
  id,
  isRefractoryRowBrand = false,
  labels,
  name,
  selectedLabels = [],
  value,
  onChange,
  onInputChange,
}: {
  ariaLabel?: string;
  dataLabel?: string;
  defaultValue?: string;
  disabled?: boolean;
  id?: string;
  isRefractoryRowBrand?: boolean;
  labels: readonly string[];
  name: string;
  selectedLabels?: readonly string[];
  value?: string;
  onChange?: (value: string) => void;
  onInputChange?: (input: HTMLInputElement) => void;
}) {
  const listId = `product-brand-options-${useId().replaceAll(":", "")}`;
  const [internalValue, setInternalValue] = useState(defaultValue);
  const currentValue = value ?? internalValue;
  const selectedKeys = new Set(selectedLabels.map(normalizeProductBrandKey));
  const availableLabels = labels.filter(
    (label) => !selectedKeys.has(normalizeProductBrandKey(label)),
  );

  function changeValue(nextValue: string) {
    if (value === undefined) {
      setInternalValue(nextValue);
    }
    onChange?.(nextValue);
  }

  return (
    <div className="production-brand-picker">
      <div className="production-brand-search-row">
        <input
          aria-label={ariaLabel}
          autoComplete="off"
          data-refractory-label={dataLabel}
          data-refractory-row-brand={isRefractoryRowBrand ? "true" : undefined}
          disabled={disabled}
          id={id}
          list={listId}
          maxLength={120}
          name={name}
          placeholder="Поиск марки"
          type="text"
          value={currentValue}
          onChange={(event) => {
            const nextValue = event.currentTarget.value;
            changeValue(nextValue);
            onInputChange?.(event.currentTarget);
          }}
        />
      </div>
      <datalist id={listId}>
        {availableLabels.map((label) => (
          <option key={normalizeProductBrandKey(label)} value={label} />
        ))}
      </datalist>
    </div>
  );
}

export function ProductBrandCreateControl({
  disabled = false,
  onCreateBrand,
}: {
  disabled?: boolean;
  onCreateBrand: ProductBrandCreator;
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [status, setStatus] = useState("");
  const [hasError, setHasError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  async function saveNewBrand() {
    const normalizedLabel = newLabel.trim().replace(/\s+/gu, " ");

    if (normalizedLabel.length === 0) {
      setHasError(true);
      setStatus("Введите марку.");
      return;
    }

    setIsSaving(true);
    setHasError(false);
    setStatus("Сохраняем…");
    const result = await onCreateBrand(normalizedLabel);
    setIsSaving(false);

    if (result.label === undefined) {
      setHasError(true);
      setStatus(result.message ?? "Не удалось сохранить марку.");
      return;
    }

    setNewLabel("");
    setHasError(false);
    setStatus(`Марка «${result.label}» добавлена.`);
    setIsAdding(false);
  }

  return (
    <div className="production-brand-create-control">
      <button
        aria-label="Добавить новую марку"
        className="secondary-button production-brand-create-open"
        disabled={disabled || isSaving}
        type="button"
        onClick={() => {
          setIsAdding(true);
          setHasError(false);
          setStatus("");
        }}
      >
        + Новая марка
      </button>
      {isAdding ? (
        <div className="production-brand-create">
          <input
            aria-label="Новая марка"
            disabled={disabled || isSaving}
            maxLength={120}
            placeholder="Название марки"
            type="text"
            value={newLabel}
            onChange={(event) => setNewLabel(event.currentTarget.value)}
          />
          <button
            disabled={disabled || isSaving}
            type="button"
            onClick={saveNewBrand}
          >
            {isSaving ? (
              <LoadingIndicator label="Сохраняем…" variant="button" />
            ) : "Сохранить"}
          </button>
          <button
            disabled={disabled || isSaving}
            type="button"
            onClick={() => {
              setIsAdding(false);
              setNewLabel("");
              setHasError(false);
              setStatus("");
            }}
          >
            Отмена
          </button>
        </div>
      ) : null}
      {status ? (
        <span
          className={`production-brand-create-status${hasError ? " is-error" : ""}`}
          role="status"
        >
          {status}
        </span>
      ) : null}
    </div>
  );
}
