/**
 * Задача 131: the top of every creation tab (board, director, collegium): one
 * create button above the register with statuses.
 */
export function AssignmentCreateOverview({ canCreate, count, text, onCreate }: {
  canCreate: boolean;
  count: number;
  text: string;
  onCreate: () => void;
}) {
  return (
    <section
      className="board-assignment-create-overview"
      aria-label="Постановка поручений"
    >
      <div>
        <span>Постановка поручений</span>
        <h2>Создать новое поручение</h2>
        <p>{canCreate ? text : "Создание поручений недоступно. Реестр открыт для просмотра."}</p>
        {canCreate ? (
          <button className="primary-button" type="button" onClick={onCreate}>
            Добавить поручение
          </button>
        ) : null}
      </div>
      <div className="board-assignment-create-count">
        <strong>{count}</strong>
        <span>показано в реестре</span>
      </div>
    </section>
  );
}
