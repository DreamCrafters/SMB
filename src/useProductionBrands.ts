import { useEffect, useState } from "react";
import { requestProductionBrands } from "./services/productionBrands";
import { readShortUserMessage } from "./services/userFacingMessages";

export type ProductionBrandLoadState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };

export function useProductionBrands({
  refreshVersion = 0,
}: {
  refreshVersion?: number;
} = {}) {
  const [labels, setLabels] = useState<string[]>([]);
  const [loadState, setLoadState] = useState<ProductionBrandLoadState>({
    status: "loading",
  });

  useEffect(() => {
    const controller = new AbortController();
    setLoadState({ status: "loading" });

    requestProductionBrands({ signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;

      if (result.status === "ready") {
        setLabels(result.labels);
        setLoadState({ status: "ready" });
        return;
      }

      setLoadState({
        status: "error",
        message: readShortUserMessage(
          result.message,
          "Не удалось загрузить марки.",
        ),
      });
    });

    return () => controller.abort();
  }, [refreshVersion]);

  return { labels, loadState };
}

export function normalizeProductBrandKey(value: string) {
  return value.trim().replace(/\s+/gu, " ").toLocaleLowerCase("ru-RU");
}
