import { useEffect, useState } from "react";
import type { RefractoryWagonRecord } from "./contracts/refractoryWagons";
import { LoadingIndicator } from "./LoadingIndicator";
import { requestRefractoryWagons } from "./services/refractoryWagons";
import { readShortUserMessage } from "./services/userFacingMessages";

/**
 * Каталог показывает физический парк вагонов: сколько раз вагон заходил в печь
 * и что решил последний осмотр. Оба показателя считает сервер.
 */
export function RefractoryWagonCatalog({
  isAdminPreviewMode,
}: {
  isAdminPreviewMode: boolean;
}) {
  const [wagons, setWagons] = useState<RefractoryWagonRecord[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    isAdminPreviewMode ? "ready" : "loading",
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (isAdminPreviewMode) return;
    const controller = new AbortController();
    setLoadState("loading");
    requestRefractoryWagons({ signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      if (result.status === "ready") {
        setWagons(result.wagons);
        setLoadState("ready");
        return;
      }
      setLoadState("error");
      setMessage(
        readShortUserMessage(result.message, "Не удалось загрузить каталог вагонов."),
      );
    });
    return () => controller.abort();
  }, [isAdminPreviewMode]);

  const sortedWagons = [...wagons].sort((first, second) =>
    first.number.localeCompare(second.number, "ru", { numeric: true })
  );

  return (
    <section className="refractory-wagon-catalog" aria-label="Каталог вагонов">
      {isAdminPreviewMode ? (
        <p className="form-status form-status-local">
          В режиме предпросмотра каталог вагонов не загружается.
        </p>
      ) : loadState === "loading" ? (
        <LoadingIndicator label="Загружаем каталог вагонов…" variant="panel" />
      ) : loadState === "error" ? (
        <p className="form-status form-status-error">{message}</p>
      ) : sortedWagons.length === 0 ? (
        <p className="laboratory-empty-note">В каталоге пока нет вагонов.</p>
      ) : (
        <div className="refractory-table-wrap">
          <table className="refractory-input-table refractory-wagon-catalog-table">
            <thead>
              <tr>
                <th>Номер вагона</th>
                <th>Счётчик обжига</th>
                <th>Текущее состояние</th>
              </tr>
            </thead>
            <tbody>
              {sortedWagons.map((wagon) => (
                <tr key={wagon.id}>
                  <td>{wagon.number}</td>
                  <td>{wagon.firingDates.length}</td>
                  <td>{wagon.postFiringCondition ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
