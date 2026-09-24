import { directorAssignmentAccessOptions, type DirectorAssignmentAccess } from "../server/src/contracts/directorAssignments.js";

export function DirectorAssignmentAccessPicker({ value, disabled, label, onChange }: {
  value: DirectorAssignmentAccess;
  disabled: boolean;
  label: string;
  onChange: (value: DirectorAssignmentAccess) => void;
}) {
  const selected = value === "both" ? ["send", "receive"] : value === "none" ? [] : [value];
  return <div className="admin-railway-role-picker" role="group" aria-label={label}>
    <span className="admin-railway-role-picker-title">Режим работы</span>
    {directorAssignmentAccessOptions.map(option => <label key={option.id} className="admin-account-protection-control">
      <input type="checkbox" checked={selected.includes(option.id)} disabled={disabled || (selected.length === 1 && selected.includes(option.id))}
        onChange={event => {
          const next = event.currentTarget.checked ? [...selected, option.id] : selected.filter(item => item !== option.id);
          onChange(next.length === 2 ? "both" : next[0] as DirectorAssignmentAccess);
        }} />
      <span>{option.label}</span>
    </label>)}
  </div>;
}
