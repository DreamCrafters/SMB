import { assignmentInboxSourceOptions, type AssignmentInboxAccess } from "../server/src/contracts/directorAssignments.js";

/** Registries whose assignments the position receives in «Поручения мне»; none keeps only the controlled registers. */
export function AssignmentInboxSourcePicker({ value, disabled, label, onChange }: {
  value: AssignmentInboxAccess;
  disabled: boolean;
  label: string;
  onChange: (value: AssignmentInboxAccess) => void;
}) {
  const selected = value === "none" ? [] : value;
  return <div className="admin-railway-role-picker" role="group" aria-label={label}>
    <span className="admin-railway-role-picker-title">Получение поручений</span>
    {assignmentInboxSourceOptions.map(option => <label key={option.id} className="admin-account-protection-control">
      <input type="checkbox" checked={selected.includes(option.id)} disabled={disabled}
        onChange={event => {
          const checked = event.currentTarget.checked;
          const next = assignmentInboxSourceOptions.map(item => item.id).filter(id => id === option.id ? checked : selected.includes(id));
          onChange(next.length ? next : "none");
        }} />
      <span>{option.label}</span>
    </label>)}
  </div>;
}
