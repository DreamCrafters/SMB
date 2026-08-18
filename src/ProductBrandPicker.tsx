import { useId, useState } from "react";
import { normalizeProductBrandKey } from "./useProductionBrands";

export function ProductBrandPicker({
  ariaLabel = "Марка",
  dataLabel = ariaLabel,
  defaultValue = "",
  disabled = false,
  id,
  isRefractoryRowBrand = false,
  labels,
  name,
  placeholder = "Поиск марки",
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
  placeholder?: string;
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
          placeholder={placeholder}
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

export function ProductionBrandSourceNote({
  className = "",
}: {
  className?: string;
}) {
  return (
    <p
      className={`production-brand-source-note${className === "" ? "" : ` ${className}`}`}
    >
      Актуальный список ведётся в разделе «Лаборатория → Марки».
    </p>
  );
}
