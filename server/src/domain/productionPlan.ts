export type ProductionDailyPlan = {
  date: string;
  value: number;
};

export type ProductionPlan = {
  month: string;
  monthlyPlan: number;
  workingDayCount: number;
  dailyPlans: ProductionDailyPlan[];
};

export type BuildProductionPlanResult =
  | { ok: true; plan: ProductionPlan }
  | { ok: false; errors: string[] };

export function buildSuggestedProductionWorkdays(month: string) {
  const parsedMonth = parseMonth(month);

  if (parsedMonth === undefined) {
    return [];
  }

  const workdays: string[] = [];
  const dayCount = new Date(
    Date.UTC(parsedMonth.year, parsedMonth.monthIndex + 1, 0),
  ).getUTCDate();

  for (let day = 1; day <= dayCount; day += 1) {
    const date = new Date(Date.UTC(parsedMonth.year, parsedMonth.monthIndex, day));
    const weekday = date.getUTCDay();

    if (weekday !== 0 && weekday !== 6) {
      workdays.push(formatDate(parsedMonth.year, parsedMonth.monthIndex, day));
    }
  }

  return workdays;
}

export function buildProductionPlan(input: {
  month: string;
  monthlyPlan: number;
  workingDates: string[];
}): BuildProductionPlanResult {
  if (parseMonth(input.month) === undefined) {
    return { ok: false, errors: ["Укажите месяц в формате ГГГГ-ММ."] };
  }

  if (!Number.isSafeInteger(input.monthlyPlan) || input.monthlyPlan <= 0) {
    return { ok: false, errors: ["Месячный план должен быть целым положительным числом."] };
  }

  if (input.workingDates.length === 0) {
    return { ok: false, errors: ["Выберите хотя бы один рабочий день."] };
  }

  const uniqueDates = new Set(input.workingDates);

  if (uniqueDates.size !== input.workingDates.length) {
    return { ok: false, errors: ["Рабочие дни не должны повторяться."] };
  }

  if (
    input.workingDates.length > 31 ||
    input.workingDates.some(
      (date) => !isCalendarDate(date) || date.slice(0, 7) !== input.month,
    )
  ) {
    return {
      ok: false,
      errors: ["Все рабочие дни должны относиться к выбранному месяцу."],
    };
  }

  const orderedDates = [...input.workingDates].sort();
  const regularDailyPlan = Math.ceil(
    input.monthlyPlan / orderedDates.length,
  );
  const finalDailyPlan =
    input.monthlyPlan - regularDailyPlan * (orderedDates.length - 1);

  if (finalDailyPlan < 0) {
    return {
      ok: false,
      errors: [
        "Месячный план слишком мал для выбранного количества рабочих дней.",
      ],
    };
  }

  return {
    ok: true,
    plan: {
      month: input.month,
      monthlyPlan: input.monthlyPlan,
      workingDayCount: orderedDates.length,
      dailyPlans: orderedDates.map((date, index) => ({
        date,
        value:
          index === orderedDates.length - 1
            ? finalDailyPlan
            : regularDailyPlan,
      })),
    },
  };
}

function parseMonth(value: string) {
  const match = /^(\d{4})-(\d{2})$/u.exec(value);

  if (match === null) {
    return undefined;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);

  if (!Number.isInteger(year) || year < 2000 || year > 2100 || month < 1 || month > 12) {
    return undefined;
  }

  return { year, monthIndex: month - 1 };
}

function isCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);

  if (match === null) {
    return false;
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, monthIndex, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === monthIndex &&
    date.getUTCDate() === day
  );
}

function formatDate(year: number, monthIndex: number, day: number) {
  return `${String(year).padStart(4, "0")}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
