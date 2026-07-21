import { useEffect, useState } from "react";
import {
  createProductionBrand,
  requestProductionBrands,
} from "./services/productionBrands";
import { readShortUserMessage } from "./services/userFacingMessages";

export type ProductBrandCreateOutcome = {
  label?: string;
  message?: string;
};

export type ProductBrandCreator = (
  label: string,
) => Promise<ProductBrandCreateOutcome>;

export type ProductionBrandLoadState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };

export function useProductionBrands({
  creationDisabled = false,
  refreshVersion = 0,
}: {
  creationDisabled?: boolean;
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
  }, [creationDisabled, refreshVersion]);

  const createBrand: ProductBrandCreator = async (label) => {
    if (creationDisabled) {
      return { message: "В режиме просмотра добавление отключено." };
    }

    const result = await createProductionBrand({ label });

    if (result.status === "error") {
      return {
        message: readShortUserMessage(
          result.message,
          "Не удалось сохранить марку.",
        ),
      };
    }

    setLabels((current) => [
      ...current.filter(
        (item) => normalizeProductBrandKey(item) !==
          normalizeProductBrandKey(result.label),
      ),
      result.label,
    ].sort((left, right) => left.localeCompare(right, "ru-RU")));

    return { label: result.label };
  };

  return { labels, loadState, createBrand };
}

export function normalizeProductBrandKey(value: string) {
  return value.trim().replace(/\s+/gu, " ").toLocaleLowerCase("ru-RU");
}
