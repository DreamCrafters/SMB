export class ProtectedAccountMutationError extends Error {
  constructor() {
    super(
      "Защищённую учётную запись может изменить только исходный аккаунт admin.",
    );
    this.name = "ProtectedAccountMutationError";
  }
}

export class CanonicalAdminMutationRequiredError extends Error {
  constructor() {
    super("Действие доступно только исходному аккаунту admin.");
    this.name = "CanonicalAdminMutationRequiredError";
  }
}

export function isCanonicalAdminLogin(login: string) {
  return login.trim().toLocaleLowerCase("en-US") === "admin";
}

export function assertProtectedAccountMutationAllowed({
  isProtected,
  allowProtected,
}: {
  isProtected: boolean;
  allowProtected: boolean;
}) {
  if (isProtected && !allowProtected) {
    throw new ProtectedAccountMutationError();
  }
}
