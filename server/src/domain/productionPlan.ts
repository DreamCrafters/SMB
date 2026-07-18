export const productionCategories = [
  "forming",
  "sorting",
  "unformed",
  "chamotte",
] as const;

export type ProductionCategory = (typeof productionCategories)[number];

export const productionCategoryLabels: Record<ProductionCategory, string> = {
  forming: "Формовка",
  sorting: "Сортировка",
  unformed: "Неформованная продукция, контейнеры",
  chamotte: "Цех обжига шамота",
};

export type ProductionCategoryPlans = Record<ProductionCategory, number>;

export type ProductionCategoryScheduleInput = {
  monthlyPlan: number;
  workingDates: string[];
};

export type ProductionCategoryScheduleInputs = Record<
  ProductionCategory,
  ProductionCategoryScheduleInput
>;

export type ProductionCategoryDailyPlan = {
  date: string;
  value: number;
};

export type ProductionCategorySchedule = {
  monthlyPlan: number;
  workingDayCount: number;
  dailyPlans: ProductionCategoryDailyPlan[];
};

export type ProductionCategorySchedules = Record<
  ProductionCategory,
  ProductionCategorySchedule
>;

export type ProductionPlan = {
  month: string;
  schedules: ProductionCategorySchedules;
};

export type ProductionPlanDatePresets = {
  allDates: string[];
  weekdayDates: string[];
};

export type BuildProductionPlanResult =
  | { ok: true; plan: ProductionPlan }
  | { ok: false; errors: string[] };

export function buildProductionPlanDatePresets(
  month: string,
): ProductionPlanDatePresets {
  const parsedMonth = parseMonth(month);

  if (parsedMonth === undefined) {
    return { allDates: [], weekdayDates: [] };
  }

  const allDates: string[] = [];
  const weekdayDates: string[] = [];
  const dayCount = new Date(
    Date.UTC(parsedMonth.year, parsedMonth.monthIndex + 1, 0),
  ).getUTCDate();

  for (let day = 1; day <= dayCount; day += 1) {
    const date = new Date(Date.UTC(parsedMonth.year, parsedMonth.monthIndex, day));
    const formattedDate = formatDate(
      parsedMonth.year,
      parsedMonth.monthIndex,
      day,
    );

    allDates.push(formattedDate);

    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) {
      weekdayDates.push(formattedDate);
    }
  }

  return { allDates, weekdayDates };
}

export function buildProductionPlan(input: {
  month: string;
  schedules: ProductionCategoryScheduleInputs;
}): BuildProductionPlanResult {
  if (parseMonth(input.month) === undefined) {
    return { ok: false, errors: ["Укажите месяц в формате ГГГГ-ММ."] };
  }

  const schedules = {} as ProductionCategorySchedules;

  for (const category of productionCategories) {
    const inputSchedule = input.schedules?.[category];
    const monthlyPlan = inputSchedule?.monthlyPlan;

    if (!Number.isSafeInteger(monthlyPlan) || monthlyPlan <= 0) {
      return {
        ok: false,
        errors: [
          `Укажите целый положительный месячный план для категории «${productionCategoryLabels[category]}».`,
        ],
      };
    }

    const workingDates = inputSchedule.workingDates;

    if (workingDates.length === 0) {
      return {
        ok: false,
        errors: [
          `Выберите хотя бы один рабочий день для категории «${productionCategoryLabels[category]}».`,
        ],
      };
    }

    if (new Set(workingDates).size !== workingDates.length) {
      return {
        ok: false,
        errors: [
          `Рабочие дни категории «${productionCategoryLabels[category]}» не должны повторяться.`,
        ],
      };
    }

    if (
      workingDates.length > 31 ||
      workingDates.some(
        (date) => !isCalendarDate(date) || date.slice(0, 7) !== input.month,
      )
    ) {
      return {
        ok: false,
        errors: [
          `Все рабочие дни категории «${productionCategoryLabels[category]}» должны относиться к выбранному месяцу.`,
        ],
      };
    }

    const orderedDates = [...workingDates].sort();
    const regularPlan = Math.ceil(monthlyPlan / orderedDates.length);
    const finalPlan = monthlyPlan - regularPlan * (orderedDates.length - 1);

    if (finalPlan < 0) {
      return {
        ok: false,
        errors: [
          `Месячный план категории «${productionCategoryLabels[category]}» слишком мал для выбранного количества рабочих дней.`,
        ],
      };
    }

    schedules[category] = {
      monthlyPlan,
      workingDayCount: orderedDates.length,
      dailyPlans: orderedDates.map((date, index) => ({
        date,
        value: index === orderedDates.length - 1 ? finalPlan : regularPlan,
      })),
    };
  }

  return {
    ok: true,
    plan: {
      month: input.month,
      schedules,
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
