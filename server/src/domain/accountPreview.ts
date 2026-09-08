import {
  isAccountNavigationItem,
  type AccountCapability,
  type AccountNavigationItem,
  type AccountPosition,
  type ServerUserProfile,
} from "./auth.js";

/**
 * Админ может смотреть систему от лица должности. Раньше предпросмотр был
 * витриной: права урезались до чтения прямо в браузере, поэтому половина
 * разделов показывала заглушку вместо данных. Теперь цель предпросмотра
 * разрешает сервер — клиент присылает только её адрес, а права берутся из
 * той же должности, что и у настоящего сотрудника.
 *
 * Это не повышение прав: у админа есть `platform.manage_access`, то есть он и
 * так может выдать себе любую вкладку через `Учётные записи`. Предпросмотр лишь
 * избавляет от этого крюка. Личность при этом не подменяется: `userId`,
 * `accountId` и имя остаются админскими, поэтому запись, сделанная в
 * предпросмотре, подписана админом, а не сотрудником.
 */
export const accountPreviewNavigationItem: AccountNavigationItem =
  "admin.account_preview";

export const accountPreviewHeader = "x-smb-account-preview";

export type AccountPreviewTarget =
  | { kind: "position"; positionId: string }
  | { kind: "navigation"; navigationItem: AccountNavigationItem };

export type AccountPreviewAccess = {
  position: AccountPosition;
  positionDisplayName: string;
  navigationItems: AccountNavigationItem[];
  capabilities: AccountCapability[];
};

const positionIdPattern = /^[a-z0-9][a-z0-9_-]{0,119}$/u;

/**
 * Адрес цели: `position:<id>` — доступ конкретной должности, `navigation:<item>`
 * — что видит должность, у которой открыта только эта вкладка.
 */
export function parseAccountPreviewTarget(
  value: string | string[] | undefined,
): AccountPreviewTarget | undefined {
  const raw = (Array.isArray(value) ? value[0] : value)?.trim();

  if (raw === undefined || raw.length === 0 || raw.length > 200) {
    return undefined;
  }

  const separator = raw.indexOf(":");
  if (separator <= 0) {
    return undefined;
  }

  const kind = raw.slice(0, separator);
  const target = raw.slice(separator + 1).trim();

  if (kind === "position") {
    return positionIdPattern.test(target)
      ? { kind: "position", positionId: target }
      : undefined;
  }

  if (kind === "navigation") {
    return isAccountNavigationItem(target)
      ? { kind: "navigation", navigationItem: target }
      : undefined;
  }

  return undefined;
}

export function canPreviewAccounts(profile: ServerUserProfile) {
  return profile.activeAccess.navigationItems.includes(
    accountPreviewNavigationItem,
  );
}

/**
 * Подменяет рабочий контекст доступа, но не личность: подпись под записями и
 * актёр в журнале действий остаются админскими.
 */
export function applyAccountPreviewAccess(
  profile: ServerUserProfile,
  preview: AccountPreviewAccess,
): ServerUserProfile {
  return {
    ...profile,
    activeAccess: {
      ...profile.activeAccess,
      position: preview.position,
      // Пометка видна и в шапке, и в журнале действий: запись, сделанная в
      // предпросмотре, не должна выглядеть работой самого сотрудника.
      positionDisplayName: `${preview.positionDisplayName} (предпросмотр)`,
      navigationItems: [...preview.navigationItems],
      capabilities: [...preview.capabilities],
    },
  };
}
