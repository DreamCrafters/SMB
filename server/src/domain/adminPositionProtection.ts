export class ProtectedPositionMutationError extends Error {
  constructor() {
    super(
      "Должность с правами админа может изменить только исходный аккаунт admin.",
    );
    this.name = "ProtectedPositionMutationError";
  }
}

export class AdministratorPositionProtectionError extends Error {
  constructor() {
    super("Права админа системной должности нельзя отключить.");
    this.name = "AdministratorPositionProtectionError";
  }
}

export class PositionAdminRightsRemovalRequiresNavigationError extends Error {
  constructor() {
    super(
      "Перед отключением прав админа выберите для должности хотя бы одну рабочую вкладку.",
    );
    this.name = "PositionAdminRightsRemovalRequiresNavigationError";
  }
}

export class PositionNavigationRemovalRequiresNavigationError extends Error {
  constructor() {
    super("У должности должна остаться хотя бы одна рабочая вкладка.");
    this.name = "PositionNavigationRemovalRequiresNavigationError";
  }
}

export function assertProtectedPositionMutationAllowed({
  isProtected,
  allowProtected,
}: {
  isProtected: boolean;
  allowProtected: boolean;
}) {
  if (isProtected && !allowProtected) {
    throw new ProtectedPositionMutationError();
  }
}

export function assertAdministratorPositionProtectionAllowed({
  accountType,
  isProtected,
}: {
  accountType: string;
  isProtected: boolean;
}) {
  if (accountType === "admin" && !isProtected) {
    throw new AdministratorPositionProtectionError();
  }
}
