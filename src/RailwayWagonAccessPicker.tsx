import { railwayWagonAccessOptions } from "./content.js";
import {
  readRailwayWagonAccessRoles,
  type RailwayWagonAccess,
} from "./contracts/railwayWagons.js";

export function RailwayWagonAccessPicker({
  value,
  disabled,
  label,
  onChange,
}: {
  value: RailwayWagonAccess;
  disabled: boolean;
  label: string;
  onChange: (value: RailwayWagonAccess) => void;
}) {
  const roles = readRailwayWagonAccessRoles(value);
  return (
    <div className="admin-railway-role-picker" role="group" aria-label={label}>
      <span className="admin-railway-role-picker-title">Роли в разделе</span>
      {railwayWagonAccessOptions.map((option) => (
        <label key={option.id} className="admin-account-protection-control">
          <input
            type="checkbox"
            disabled={disabled}
            checked={option.id === "view"
              ? roles.length === 0
              : roles.includes(option.id)}
            onChange={(event) => {
              const checked = event.currentTarget.checked;
              const role = option.id;
              if (role === "view") {
                onChange("view");
                return;
              }
              const next = checked
                ? [...roles, role]
                : roles.filter((item) => item !== role);
              onChange(next.length === 0 ? "view" : next);
            }}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}
