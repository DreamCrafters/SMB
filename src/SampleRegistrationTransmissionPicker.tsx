import { useEffect, useState } from "react";
import type {
  LaboratorySampleRegistrationTransmissionOption,
  LaboratorySampleRegistrationTransmissionTarget,
} from "./contracts";
import { requestLaboratorySampleRegistrationPendingTransmissions } from "./services/laboratorySampleRegistrationJournal";

type LoadState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };

/**
 * Задача 64: журнал `Регистрация проб` помечает пробу для трансляции в один из
 * целевых журналов. Для `formed_product_sample` это второй, независимый от
 * задачи 79 путь: журнал кирпича принимает пробу либо отсюда (код пробы и
 * марка приходят предзаполнением), либо через вагонное подтягивание марки и
 * даты формовки из Журнала вагонов — ровно один источник на запись.
 * Этот пикер показывает ещё не использованные помеченные пробы для
 * конкретного целевого журнала и передаёт выбранную наверх для
 * предзаполнения формы; сама трансляция не создаёт запись автоматически.
 */
export function SampleRegistrationTransmissionPicker({
  target,
  disabled = false,
  onSelect,
}: {
  target: LaboratorySampleRegistrationTransmissionTarget;
  disabled?: boolean;
  onSelect: (
    option: LaboratorySampleRegistrationTransmissionOption | undefined,
  ) => void;
}) {
  const [options, setOptions] = useState<
    LaboratorySampleRegistrationTransmissionOption[]
  >([]);
  const [selectedId, setSelectedId] = useState("");
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setLoadState({ status: "loading" });
    setSelectedId("");
    requestLaboratorySampleRegistrationPendingTransmissions(target, {
      signal: controller.signal,
    }).then((result) => {
      if (controller.signal.aborted) return;
      if (result.status === "ready") {
        setOptions(result.options);
        setLoadState({ status: "ready" });
        return;
      }
      setOptions([]);
      setLoadState({
        status: "error",
        message: "Не удалось загрузить пробы для трансляции.",
      });
    });
    return () => controller.abort();
  }, [target]);

  return (
    <label className="sample-registration-transmission-picker">
      <span>Из регистрации проб</span>
      <select
        disabled={disabled || loadState.status !== "ready"}
        value={selectedId}
        onChange={(event) => {
          const value = event.currentTarget.value;
          setSelectedId(value);
          onSelect(options.find((option) => option.id === value));
        }}
      >
        <option value="">
          {loadState.status === "loading"
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
      {loadState.status === "error"
        ? <small className="form-message is-error">{loadState.message}</small>
        : null}
    </label>
  );
}
