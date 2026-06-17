export type CashPosition = {
  label: string;
  amount: number;
};

export type IncomeChannel = {
  label: string;
  code: string;
  cumulativeFact: number;
  currentDay: number;
};

export type PaymentTone = "green" | "blue" | "amber" | "red" | "neutral";

export type PaymentCategory = {
  label: string;
  amount: number;
  note: string;
  tone: PaymentTone;
};

export type PaymentRecord = {
  row: number;
  label: string;
  code: string;
  plan: number;
  cumulativeFact: number;
  currentPayment: number;
  remainingLimit: number;
  group: PaymentCategory["label"];
  tone: PaymentTone;
};

export const dashboardData = {
  reportName: "Распределение денежных средств",
  reportDate: "16 июня 2026",
  incomeDate: "15 июня 2026",
  sourceFile: "Распределение за 16.06.2026г..xlsx",
  reportPeriod: {
    factLabel: "1–16 июня 2026",
    planLabel: "1–30 июня 2026",
    elapsedDays: 16,
    totalDays: 30,
    distributionLabel: "распределение на 16 июня 2026",
  },
  cash: {
    total: 2_650_090.99,
    controlTotal: 3_125_644.89,
    positions: [
      { label: "ВТБ", amount: 303_138.48 },
      { label: "ОСБ", amount: 421_502.81 },
      { label: "Касса", amount: 51_731.09 },
      { label: "Бизнес-карта", amount: 3_718.61 },
      { label: "Депозитные счета ВТБ", amount: 1_870_000 },
    ] satisfies CashPosition[],
  },
  income: {
    monthlyPlan: 83_557_071.38,
    cumulativeFact: 18_943_248.23,
    currentDay: 3_035_278.43,
    gapToPlan: -64_613_823.15,
    salesCurrentDay: 3_034_797.75,
    channels: [
      {
        label: "ОСБ",
        code: "1",
        cumulativeFact: 2_144_134,
        currentDay: 421_283,
      },
      {
        label: "ВТБ",
        code: "2",
        cumulativeFact: 16_264_322.36,
        currentDay: 2_079_203.56,
      },
      {
        label: "Касса",
        code: "5",
        cumulativeFact: 534_791.87,
        currentDay: 534_791.87,
      },
    ] satisfies IncomeChannel[],
  },
  expenses: {
    monthlyPlan: 65_068_835.82,
    cumulativeFact: 15_984_708.63,
    currentPayments: 1_180_330.87,
    remainingLimit: 47_903_796.32,
  },
  operations: {
    endOfDayReserve: 1_469_760.12,
    netCashFlowToday: 1_854_947.56,
    depositTransfer: 1_418_029.03,
    actualCashPayments: 7_000,
    actualCardPayments: 1_175,
    plannedCashPayments: 0,
  },
  paymentCategories: [
    {
      label: "Персонал и налоги",
      amount: 461_627,
      note: "Подоходный налог и кадровые платежи распределения.",
      tone: "red",
    },
    {
      label: "Сырье и материалы",
      amount: 433_120,
      note: "Производственное сырье и предоплаты поставщикам.",
      tone: "blue",
    },
    {
      label: "Ремонт, ГСМ и снабжение",
      amount: 122_484.71,
      note: "Подытог строки материалов, запчастей и ГСМ.",
      tone: "green",
    },
    {
      label: "Логистика и доставка",
      amount: 118_240,
      note: "Железнодорожная доставка и предоставление состава.",
      tone: "amber",
    },
    {
      label: "Административные расходы",
      amount: 44_859.16,
      note: "Связь, обучение и государственные пошлины.",
      tone: "neutral",
    },
  ] satisfies PaymentCategory[],
  paymentRecords: [
    {
      row: 38,
      label:
        "Подоходный налог за период с 23.05.26 по 31.05.26, окончательная оплата",
      code: "14.2",
      plan: 2_180_000,
      cumulativeFact: 200_000,
      currentPayment: 461_627,
      remainingLimit: 1_518_373,
      group: "Персонал и налоги",
      tone: "red",
    },
    {
      row: 108,
      label:
        "Электрокорунд минус 1000, 11 т, предварительная оплата",
      code: "17.4",
      plan: 2_635_200,
      cumulativeFact: 100_000,
      currentPayment: 433_120,
      remainingLimit: 2_102_080,
      group: "Сырье и материалы",
      tone: "blue",
    },
    {
      row: 120,
      label:
        "Возмещение ж/д тарифа по перевозке глины БР-1, частичная оплата долга",
      code: "18",
      plan: 1_025_228.5,
      cumulativeFact: 735_000,
      currentPayment: 67_000,
      remainingLimit: 223_228.5,
      group: "Логистика и доставка",
      tone: "amber",
    },
    {
      row: 130,
      label: 'Предоставление ж/д состава по счету ООО "УССК"',
      code: "18",
      plan: 1_025_228.5,
      cumulativeFact: 802_000,
      currentPayment: 51_240,
      remainingLimit: 171_988.5,
      group: "Логистика и доставка",
      tone: "amber",
    },
    {
      row: 81,
      label: "Услуги связи за май, ПАО Ростелеком",
      code: "22.6",
      plan: 59_223.44,
      cumulativeFact: 0,
      currentPayment: 16_523.16,
      remainingLimit: 42_700.28,
      group: "Административные расходы",
      tone: "neutral",
    },
    {
      row: 140,
      label: "Госпошлина за постановку на учет 12 единиц техники",
      code: "22.21",
      plan: 50_000,
      cumulativeFact: 0,
      currentPayment: 6_336,
      remainingLimit: 43_664,
      group: "Административные расходы",
      tone: "neutral",
    },
    {
      row: 148,
      label: "Госпошлина за обучение генерального директора",
      code: "22.21",
      plan: 50_000,
      cumulativeFact: 0,
      currentPayment: 2_000,
      remainingLimit: 48_000,
      group: "Административные расходы",
      tone: "neutral",
    },
    {
      row: 267,
      label: "Обучение по программе УКЦ Техэксперт",
      code: "22.15",
      plan: 50_000,
      cumulativeFact: 9_500,
      currentPayment: 20_000,
      remainingLimit: 20_500,
      group: "Административные расходы",
      tone: "neutral",
    },
    {
      row: 497,
      label: "Рукавицы, перчатки, мыло, респираторы и краги",
      code: "19.11",
      plan: 74_296.16,
      cumulativeFact: 0,
      currentPayment: 115_527.71,
      remainingLimit: -41_231.55,
      group: "Ремонт, ГСМ и снабжение",
      tone: "green",
    },
    {
      row: 735,
      label: "Ремни для ремонта пресса N5 в ОЦ",
      code: "19.14",
      plan: 460_492.76,
      cumulativeFact: 121_731.2,
      currentPayment: 6_957,
      remainingLimit: 331_804.56,
      group: "Ремонт, ГСМ и снабжение",
      tone: "green",
    },
  ] satisfies PaymentRecord[],
} as const;
