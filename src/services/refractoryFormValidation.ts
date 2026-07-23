import type { RefractoryFieldErrorDetail } from "./refractoryReports";

export type RefractoryFormFieldError = {
  input: HTMLInputElement | HTMLSelectElement;
  message: string;
};

const defaultMaximum = 1_000_000_000;

export function validateRefractoryForm(
  form: HTMLFormElement,
): RefractoryFormFieldError[] {
  clearRefractoryFormErrors(form);
  const errors: RefractoryFormFieldError[] = Array.from(
    form.querySelectorAll<HTMLInputElement>("input[data-refractory-number]"),
  ).flatMap(validateNumberInput);

  for (const bank of form.querySelectorAll<HTMLElement>(
    ".bank-measurement-card[data-bank-number]",
  )) {
    const inputs = Array.from(
      bank.querySelectorAll<HTMLInputElement>("input[data-refractory-number]"),
    );
    if (inputs.length > 0 && inputs.every((input) => input.value.trim() === "")) {
      const bankLabel = bank.dataset.bankNumber === "1"
        ? "I"
        : bank.dataset.bankNumber === "2" ? "II" : "III";
      errors.push({
        input: inputs[0]!,
        message: `Банка ${bankLabel}: добавьте хотя бы один замер.`,
      });
    }
  }

  for (const brandInput of form.querySelectorAll<
    HTMLInputElement | HTMLSelectElement
  >(
    "input[data-refractory-row-brand], select[data-refractory-row-brand]",
  )) {
    const row = brandInput.closest("tr");
    const hasRowData = Array.from(
      row?.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
        "input, select",
      ) ?? [],
    ).some(
      (input) => input !== brandInput && input.value.trim().length > 0,
    );

    if (hasRowData && brandInput.value.trim().length === 0) {
      errors.push({
        input: brandInput,
        message: `${readInputLabel(brandInput)}: укажите марку изделия.`,
      });
    }
  }

  for (const quantityInput of form.querySelectorAll<HTMLInputElement>(
    "input[data-refractory-row-quantity]",
  )) {
    const brandInput = quantityInput.closest("tr")?.querySelector<
      HTMLInputElement | HTMLSelectElement
    >("input[data-refractory-row-brand], select[data-refractory-row-brand]");

    if (
      (brandInput?.value.trim().length ?? 0) > 0 &&
      quantityInput.value.trim().length === 0
    ) {
      errors.push({
        input: quantityInput,
        message: `${readInputLabel(quantityInput)}: укажите выпуск в тоннах.`,
      });
    }
  }

  for (const table of form.querySelectorAll<HTMLTableElement>(
    "table[data-refractory-unique-brands]",
  )) {
    const brandKeys = new Set<string>();
    for (const brandInput of table.querySelectorAll<
      HTMLInputElement | HTMLSelectElement
    >("input[data-refractory-row-brand], select[data-refractory-row-brand]")) {
      const brandKey = brandInput.value
        .trim()
        .replace(/\s+/gu, " ")
        .toLocaleLowerCase("ru-RU");
      if (brandKey.length === 0) continue;
      if (brandKeys.has(brandKey)) {
        errors.push({
          input: brandInput,
          message: `${readInputLabel(brandInput)}: марка уже выбрана в этой таблице.`,
        });
        continue;
      }
      brandKeys.add(brandKey);
    }
  }

  for (const error of errors) {
    error.input.setAttribute("aria-invalid", "true");
  }

  return errors;
}

export function formatRefractoryFormErrors(
  errors: readonly { message: string }[],
) {
  if (errors.length === 0) return "";

  return `Проверьте выделенные поля.\n${errors
    .map((error) => error.message)
    .join("\n")}`;
}

export function clearRefractoryFieldError(control: RefractoryFormControl) {
  control.removeAttribute("aria-invalid");
}

export function markRefractoryServerFieldErrors(
  form: HTMLFormElement,
  details: readonly RefractoryFieldErrorDetail[],
) {
  const marked = details.flatMap((detail) => {
    const control = findControlByFieldPath(form, detail.fieldPath);
    if (control === undefined) return [];
    control.setAttribute("aria-invalid", "true");
    return [control];
  });

  return Array.from(new Set(marked));
}

function clearRefractoryFormErrors(form: HTMLFormElement) {
  for (const control of form.querySelectorAll<RefractoryFormControl>(
    'input[aria-invalid="true"], textarea[aria-invalid="true"], select[aria-invalid="true"]',
  )) {
    clearRefractoryFieldError(control);
  }
}

function validateNumberInput(input: HTMLInputElement) {
  const text = input.value.trim().replace(",", ".");
  if (text.length === 0) return [];

  const integer = input.dataset.refractoryNumber === "integer";
  const max = readMaximum(input.dataset.refractoryMax);
  const matchesFormat = integer
    ? /^\d+$/u.test(text)
    : /^\d+(?:\.\d*)?$/u.test(text);
  const value = Number(text);

  if (!matchesFormat || !Number.isFinite(value)) {
    return [{ input, message: buildNumberFormatMessage(input, integer) }];
  }
  if (value < 0 || value > max) {
    return [{ input, message: buildNumberRangeMessage(input, integer, max) }];
  }
  if (!integer && readDecimalPlaces(text) > 3) {
    return [{ input, message: buildDecimalPrecisionMessage(input) }];
  }

  return [];
}

function readMaximum(value: string | undefined) {
  if (value === undefined) return defaultMaximum;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : defaultMaximum;
}

function buildNumberRangeMessage(
  input: HTMLInputElement,
  integer: boolean,
  max: number,
) {
  const valueKind = integer ? "целое число" : "число";
  const range = `${valueKind} от 0 до ${formatLimit(max)}`;

  return `${readInputLabel(input)}: укажите ${range}.`;
}

function buildNumberFormatMessage(input: HTMLInputElement, integer: boolean) {
  return integer
    ? `${readInputLabel(input)}: укажите целое число без знаков после запятой.`
    : `${readInputLabel(input)}: введите число цифрами.`;
}

function buildDecimalPrecisionMessage(input: HTMLInputElement) {
  return `${readInputLabel(input)}: укажите не более трёх знаков после запятой.`;
}

function readInputLabel(input: HTMLInputElement | HTMLSelectElement) {
  return input.dataset.refractoryLabel ?? input.getAttribute("aria-label") ??
    "Поле";
}

type RefractoryFormControl =
  | HTMLInputElement
  | HTMLTextAreaElement
  | HTMLSelectElement;

function findControlByFieldPath(
  form: HTMLFormElement,
  fieldPath: string,
) {
  const dynamicMatch = /^(firing|unformed)\.(\d+)\.(.+)$/u.exec(fieldPath);
  if (dynamicMatch?.[1] !== undefined && dynamicMatch[2] !== undefined) {
    return findDynamicRowControl(
      form,
      dynamicMatch[1] === "firing" ? "firing" : "unformed",
      Number(dynamicMatch[2]),
      dynamicMatch[3] ?? "",
    );
  }

  return readFormControls(form).find((control) => control.name === fieldPath);
}

function findDynamicRowControl(
  form: HTMLFormElement,
  prefix: "firing" | "unformed",
  submittedRowIndex: number,
  field: string,
) {
  const rows = Array.from(form.querySelectorAll("tr")).filter((row) =>
    Array.from(
      row.querySelectorAll<RefractoryFormControl>("input, textarea, select"),
    ).some((control) => control.name.startsWith(`${prefix}.`))
  );
  const filledRows = rows.filter((row) =>
    Array.from(
      row.querySelectorAll<RefractoryFormControl>("input, textarea, select"),
    ).some((control) => control.value.trim().length > 0)
  );
  return Array.from(
    filledRows[submittedRowIndex]?.querySelectorAll<RefractoryFormControl>(
      "input, textarea, select",
    ) ?? [],
  ).find((control) => control.name.endsWith(`.${field}`));
}

function readFormControls(form: HTMLFormElement) {
  return Array.from(
    form.querySelectorAll<RefractoryFormControl>("input, textarea, select"),
  );
}

function formatLimit(value: number) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/gu, " ");
}

function readDecimalPlaces(value: string) {
  return value.split(".")[1]?.length ?? 0;
}
