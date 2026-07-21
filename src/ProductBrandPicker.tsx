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
  onCreateBrand,
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
  onCreateBrand?: ProductBrandCreator;
  onInputChange?: (input: HTMLInputElement) => void;
}) {
  const listId = `product-brand-options-${useId().replaceAll(":", "")}`;
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [isAdding, setIsAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [status, setStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);
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

  async function saveNewBrand() {
    if (onCreateBrand === undefined) return;

    const normalizedLabel = newLabel.trim().replace(/\s+/gu, " ");

    if (normalizedLabel.length === 0) {
      setStatus("Введите марку.");
      return;
    }

    setIsSaving(true);
    setStatus("Сохраняем…");
    const result = await onCreateBrand(normalizedLabel);
    setIsSaving(false);

    if (result.label === undefined) {
      setStatus(result.message ?? "Не удалось сохранить марку.");
      return;
    }

    changeValue(result.label);
    setNewLabel("");
    setStatus("");
    setIsAdding(false);
  }

  return (
    <div className="production-brand-picker">
      <div className="production-brand-search-row">
        <input
          aria-label={ariaLabel}
          autoComplete="off"
          data-refractory-label={dataLabel}
          data-refractory-row-brand={isRefractoryRowBrand ? "true" : undefined}
          disabled={disabled || isSaving}
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
        {onCreateBrand === undefined || disabled ? null : (
          <button
            aria-label="Добавить новую марку"
            className="production-brand-create-open"
            disabled={isSaving}
            type="button"
            onClick={() => {
              setIsAdding(true);
              setStatus("");
            }}
          >
            + Новая
          </button>
        )}
      </div>
      <datalist id={listId}>
        {availableLabels.map((label) => (
          <option key={normalizeProductBrandKey(label)} value={label} />
        ))}
      </datalist>
      {isAdding ? (
        <div className="production-brand-create">
          <input
            aria-label="Новая марка"
            disabled={isSaving}
            maxLength={120}
            placeholder="Название марки"
            type="text"
            value={newLabel}
            onChange={(event) => setNewLabel(event.currentTarget.value)}
          />
          <button disabled={isSaving} type="button" onClick={saveNewBrand}>
            {isSaving ? (
              <LoadingIndicator label="Сохраняем…" variant="button" />
            ) : "Сохранить"}
          </button>
          <button
            disabled={isSaving}
            type="button"
            onClick={() => {
              setIsAdding(false);
              setNewLabel("");
              setStatus("");
            }}
          >
            Отмена
          </button>
          {status ? <span role="status">{status}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
