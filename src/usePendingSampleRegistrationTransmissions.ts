import { useEffect, useState } from "react";
import type {
  LaboratorySampleRegistrationPendingTransmissionFilters,
  LaboratorySampleRegistrationTransmissionOption,
  LaboratorySampleRegistrationTransmissionTarget,
} from "./contracts";
import { requestLaboratorySampleRegistrationPendingTransmissions } from "./services/laboratorySampleRegistrationJournal";

export type PendingSampleRegistrationTransmissionsState =
  | {
      status: "loading";
      options: LaboratorySampleRegistrationTransmissionOption[];
    }
  | {
      status: "ready";
      options: LaboratorySampleRegistrationTransmissionOption[];
    }
  | {
      status: "error";
      message: string;
      options: LaboratorySampleRegistrationTransmissionOption[];
    };

/**
 * Задача 132: пробы, помеченные в `Регистрации проб` для целевого журнала и
 * ещё не использованные в нём. Один источник питает и пикер формы, и строки
 * «Ожидает заполнения» в истории журнала; фильтрует список только backend.
 */
export function usePendingSampleRegistrationTransmissions(
  target: LaboratorySampleRegistrationTransmissionTarget,
  filters: LaboratorySampleRegistrationPendingTransmissionFilters,
  refreshKey: number,
): PendingSampleRegistrationTransmissionsState {
  const [state, setState] = useState<
    PendingSampleRegistrationTransmissionsState
  >({ status: "loading", options: [] });
  const { dateFrom, dateTo, query, nameQuery } = filters;

  useEffect(() => {
    const controller = new AbortController();
    setState((current) => ({ status: "loading", options: current.options }));
    requestLaboratorySampleRegistrationPendingTransmissions(
      target,
      {
        ...(dateFrom === undefined ? {} : { dateFrom }),
        ...(dateTo === undefined ? {} : { dateTo }),
        ...(query === undefined ? {} : { query }),
        ...(nameQuery === undefined ? {} : { nameQuery }),
      },
      { signal: controller.signal },
    ).then((result) => {
      if (controller.signal.aborted) return;
      setState((current) => result.status === "ready"
        ? { status: "ready", options: result.options }
        : {
            status: "error",
            message: "Не удалось загрузить пробы, переданные из Регистрации проб.",
            options: current.options,
          });
    });
    return () => controller.abort();
  }, [target, dateFrom, dateTo, query, nameQuery, refreshKey]);

  return state;
}
