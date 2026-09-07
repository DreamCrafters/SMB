import { useEffect, useId, useState, type KeyboardEvent } from "react";

/**
 * Раскрывающийся список с поиском по серверному справочнику. Станций 11 676, а
 * кодов ЕТСНГ 4 704 — такой список в `datalist` не отдать, поэтому подсказки
 * ищет сервер, а разметка повторяет комбобокс журнала химических анализов.
 */
export function ReferenceSearchPicker<Option>({
  disabled = false,
  emptyLabel,
  formatOption,
  label,
  labelHidden = false,
  onSearch,
  onSelect,
  placeholder,
  value,
}: {
  disabled?: boolean;
  emptyLabel: string;
  formatOption: (option: Option) => string;
  label: string;
  /** В таблице подпись даёт заголовок колонки, поэтому она уходит в aria-label. */
  labelHidden?: boolean;
  onSearch: (query: string, signal: AbortSignal) => Promise<Option[]>;
  onSelect: (option: Option | undefined) => void;
  placeholder?: string;
  value: string;
}) {
  const listboxId = useId();
  const [query, setQuery] = useState(value);
  const [options, setOptions] = useState<Option[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  // Значение приходит и снаружи: после сохранения форма очищается целиком.
  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    const trimmed = query.trim();

    if (!isOpen || trimmed.length === 0) {
      setOptions([]);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      onSearch(trimmed, controller.signal).then((found) => {
        if (controller.signal.aborted) return;
        setOptions(found);
        setActiveIndex(found.length === 0 ? -1 : 0);
      });
    }, 250);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
    // `onSearch` пересоздаётся на каждый рендер родителя, поэтому зависимостью
    // взят только сам запрос — иначе поиск уходил бы на каждый рендер.
  }, [query, isOpen]);

  const isListboxVisible = isOpen && query.trim().length > 0;
  const activeOptionId = activeIndex < 0 || !isListboxVisible
    ? undefined
    : `${listboxId}-option-${activeIndex}`;

  function select(option: Option) {
    setQuery(formatOption(option));
    setIsOpen(false);
    setOptions([]);
    onSelect(option);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setIsOpen(false);
      return;
    }
    if (options.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % options.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + options.length) % options.length);
      return;
    }
    if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      select(options[activeIndex]);
    }
  }

  return (
    <div
      className="reference-search-picker"
      onBlur={(event) => {
        const nextTarget = event.relatedTarget;
        if (nextTarget !== null && event.currentTarget.contains(nextTarget as Node)) {
          return;
        }
        setIsOpen(false);
      }}
    >
      <label>
        {labelHidden ? null : <span>{label}</span>}
        <input
          aria-activedescendant={activeOptionId}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={isListboxVisible}
          aria-label={labelHidden ? label : undefined}
          autoComplete="off"
          disabled={disabled}
          maxLength={160}
          placeholder={placeholder}
          role="combobox"
          value={query}
          onChange={(event) => {
            setQuery(event.currentTarget.value);
            setIsOpen(true);
            // Пока выбор не подтверждён, поле не считается заполненным.
            onSelect(undefined);
          }}
          onFocus={() => {
            if (query.trim() !== "") setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
        />
      </label>
      {isListboxVisible
        ? (
            <div className="reference-search-options" id={listboxId} role="listbox">
              {options.length === 0
                ? <p className="reference-search-empty">{emptyLabel}</p>
                : options.map((option, index) => (
                    <button
                      aria-selected={activeIndex === index}
                      className="reference-search-option"
                      id={`${listboxId}-option-${index}`}
                      key={formatOption(option)}
                      onClick={() => select(option)}
                      onMouseDown={(event) => event.preventDefault()}
                      role="option"
                      tabIndex={-1}
                      type="button"
                    >
                      {formatOption(option)}
                    </button>
                  ))}
            </div>
          )
        : null}
    </div>
  );
}
