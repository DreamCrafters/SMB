import type { AccountType } from "../contracts/accounts.js";

const MOSCOW_UTC_OFFSET_HOURS = 3;
const DISPATCHER_LOGOUT_HOUR = 7;
const DISPATCHER_LOGOUT_MINUTE = 45;

export function getNextMoscowDispatcherLogoutAt(now = new Date()) {
  const moscowNow = new Date(
    now.getTime() + MOSCOW_UTC_OFFSET_HOURS * 60 * 60 * 1000,
  );
  const logoutAt = new Date(
    Date.UTC(
      moscowNow.getUTCFullYear(),
      moscowNow.getUTCMonth(),
      moscowNow.getUTCDate(),
      DISPATCHER_LOGOUT_HOUR - MOSCOW_UTC_OFFSET_HOURS,
      DISPATCHER_LOGOUT_MINUTE,
    ),
  );

  if (logoutAt.getTime() <= now.getTime()) {
    logoutAt.setUTCDate(logoutAt.getUTCDate() + 1);
  }

  return logoutAt;
}

export function readDispatcherAutoLogoutAt(
  profile: {
    accountType: AccountType;
    activeAccess: { expiresAt?: string };
  },
  now = new Date(),
) {
  if (profile.accountType !== "dispatcher") {
    return undefined;
  }

  const scheduledLogoutAt = getNextMoscowDispatcherLogoutAt(now);
  const serverExpiryTimestamp = Date.parse(
    profile.activeAccess.expiresAt ?? "",
  );

  if (
    Number.isFinite(serverExpiryTimestamp) &&
    serverExpiryTimestamp < scheduledLogoutAt.getTime()
  ) {
    return new Date(serverExpiryTimestamp);
  }

  return scheduledLogoutAt;
}
