/** Сервер принимает не больше 30 соисполнителей (`readDirectorAssignmentInput`). */
const maxCoExecutors = 30;

export type CoExecutorOption = { id: string; name: string; detail?: string };

/**
 * Выбор соисполнителей тем же списком сотрудников, что и ответственного:
 * выбранный в списке добавляется, у каждого выбранного есть кнопка «Убрать».
 */
export function CoExecutorPicker({ options, value, excludedId, disabled = false, onChange, className = "", labelClassName }: {
  options: CoExecutorOption[];
  value: string[];
  /** Ответственный не может быть соисполнителем. */
  excludedId?: string;
  disabled?: boolean;
  onChange: (ids: string[]) => void;
  className?: string;
  labelClassName?: string;
}) {
  const selected = value.flatMap(id => options.filter(option => option.id === id));
  const available = options.filter(option => option.id !== excludedId && !value.includes(option.id));
  const isFull = value.length >= maxCoExecutors;
  return <div className={`co-executor-picker ${className}`.trim()}>
    <label className={labelClassName}>
      <span>Соисполнители{value.length ? `: ${value.length}` : " (необязательно)"}</span>
      <select value="" disabled={disabled || isFull || available.length === 0} onChange={event => { const id = event.currentTarget.value; if (id) onChange([...value, id]); }}>
        <option value="">{isFull ? `Выбрано максимум: ${maxCoExecutors}` : available.length ? "Добавить соисполнителя" : "Некого добавить"}</option>
        {available.map(option => <option key={option.id} value={option.id}>{option.detail ? `${option.name} — ${option.detail}` : option.name}</option>)}
      </select>
    </label>
    {selected.length > 0 && <ul aria-label="Выбранные соисполнители">
      {selected.map(option => <li key={option.id}>
        <span>{option.name}{option.detail && <small>{option.detail}</small>}</span>
        <button type="button" disabled={disabled} aria-label={`Убрать соисполнителя ${option.name}`} onClick={() => onChange(value.filter(id => id !== option.id))}>Убрать</button>
      </li>)}
    </ul>}
  </div>;
}
