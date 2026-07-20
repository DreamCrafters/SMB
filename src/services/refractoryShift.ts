import type { RefractoryShiftNumber } from "../contracts/refractoryReports.js";

export function readRefractoryShiftContext(now = new Date()): {
  reportDate: string;
  shiftNumber: RefractoryShiftNumber;
} {
  const shiftNumber: RefractoryShiftNumber =
    now.getHours() >= 8 && now.getHours() < 20 ? 1 : 2;
  const shiftDate = new Date(now.getTime());

  if (now.getHours() < 8) {
    shiftDate.setDate(shiftDate.getDate() - 1);
  }

  const year = shiftDate.getFullYear();
  const month = String(shiftDate.getMonth() + 1).padStart(2, "0");
  const day = String(shiftDate.getDate()).padStart(2, "0");

  return {
    reportDate: `${year}-${month}-${day}`,
    shiftNumber,
  };
}
