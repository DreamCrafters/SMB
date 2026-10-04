import type {
  LaboratorySampleRegistrationTransmissionOption,
  LaboratorySampleRegistrationTransmissionTarget,
} from "./contracts";
import { usePendingSampleRegistrationTransmissions } from "./usePendingSampleRegistrationTransmissions";

const unfilteredPendingTransmissions = {};

/**
 * Задача 64: журнал `Регистрация проб` помечает пробу для трансляции в один из
 * целевых журналов. Для `formed_product_sample` это второй, независимый от
 * задачи 79 путь: журнал кирпича принимает пробу либо отсюда (код пробы и
 * марка приходят предзаполнением), либо через вагонное подтягивание марки и
 * даты формовки из Журнала вагонов — ровно один источник на запись.
 * Этот пикер показывает ещё не использованные помеченные пробы для
 * конкретного целевого журнала и передаёт выбранную наверх для
 * предзаполнения формы; сама трансляция не создаёт запись автоматически.
 * Задача 132: выбор управляется формой (`value`), чтобы клик по строке
 * «Ожидает заполнения» в истории выбирал ту же пробу здесь, а `refreshKey`
 * перечитывает список после сохранения, убирая использованную пробу.
 */
export function SampleRegistrationTransmissionPicker({
  target,
  value,
  refreshKey,
  disabled = false,
  onSelect,
}: {
  target: LaboratorySampleRegistrationTransmissionTarget;
  value: string | undefined;
  refreshKey: number;
  disabled?: boolean;
  onSelect: (
    option: LaboratorySampleRegistrationTransmissionOption | undefined,
  ) => void;
}) {
  const pending = usePendingSampleRegistrationTransmissions(
    target,
    unfilteredPendingTransmissions,
    refreshKey,
  );
  const { options } = pending;

  return (
    <label className="sample-registration-transmission-picker">
      <span>Из регистрации проб</span>
      <select
        disabled={disabled || pending.status !== "ready"}
        value={value ?? ""}
        onChange={(event) => {
          const selectedId = event.currentTarget.value;
          onSelect(options.find((option) => option.id === selectedId));
        }}
      >
        <option value="">
          {pending.status === "loading"
            ? "Загружаем список…"
            : options.length === 0
              ? "Нет проб, переданных на этот журнал"
              : "Не выбрано — заполнить вручную"}
        </option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {`${option.laboratorySampleCode} · ${option.sampleName} · ${option.registrationDate}`}
          </option>
        ))}
      </select>
      {pending.status === "error"
        ? <small className="form-message is-error">{pending.message}</small>
        : null}
    </label>
  );
}
