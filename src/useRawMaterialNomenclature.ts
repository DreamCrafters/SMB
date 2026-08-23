import { useEffect, useState } from "react";
import { requestRawMaterialNomenclature } from "./services/rawMaterialNomenclature";
import { readShortUserMessage } from "./services/userFacingMessages";

export type RawMaterialNomenclatureLoadState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };

/**
 * Доработка задачи 95: наименования сырья для выпадающих списков журналов.
 * Тот же приём, что и `useProductionBrands`, но список server-owned свой —
 * `Номенклатура → Сырьё`.
 */
export function useRawMaterialNomenclature({
  refreshVersion = 0,
}: {
  refreshVersion?: number;
} = {}) {
  const [labels, setLabels] = useState<string[]>([]);
  const [loadState, setLoadState] = useState<RawMaterialNomenclatureLoadState>({
    status: "loading",
  });

  useEffect(() => {
    const controller = new AbortController();
    setLoadState({ status: "loading" });

    requestRawMaterialNomenclature({}, { signal: controller.signal }).then(
      (result) => {
        if (controller.signal.aborted) return;

        if (result.status === "ready") {
          setLabels(result.records.map((record) => record.name));
          setLoadState({ status: "ready" });
          return;
        }

        setLoadState({
          status: "error",
          message: readShortUserMessage(
            result.message,
            "Не удалось загрузить номенклатуру сырья.",
          ),
        });
      },
    );

    return () => controller.abort();
  }, [refreshVersion]);

  return { labels, loadState };
}
