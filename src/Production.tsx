import { RefractoryWagonCatalog } from "./RefractoryWagonCatalog";
import type { ShowToast } from "./services/toastStack";

/**
 * Задача 145: раздел `Производство` для руководства — только просмотр.
 * Каталог вагонов тот же, что у огнеупорного цеха, но без регистрации
 * вагона: capability раздела открывает на сервере лишь чтение каталога.
 */
export function ProductionWorkspace({
  onShowToast,
}: {
  onShowToast: ShowToast;
}) {
  return (
    <main className="workspace laboratory-workspace">
      <header className="laboratory-heading">
        <div>
          <span className="eyebrow">Просмотр для руководства</span>
          <h1>Производство</h1>
        </div>
      </header>

      <section className="laboratory-history" aria-label="Вагоны огнеупорного цеха">
        <div className="laboratory-history-heading">
          <div>
            <span className="eyebrow">Огнеупорный цех</span>
            <h2>Каталог вагонов</h2>
          </div>
        </div>
        <RefractoryWagonCatalog onShowToast={onShowToast} readOnly />
      </section>
    </main>
  );
}
