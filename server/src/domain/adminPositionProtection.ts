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
