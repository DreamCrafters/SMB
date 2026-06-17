import { dashboardData, type PaymentRecord, type PaymentTone } from "./content";

type SignalTone = "success" | "attention" | "danger" | "neutral";

type AnalysisFinding = {
  label: string;
  value: string;
  detail: string;
  tone: SignalTone;
};

type AnalysisAction = {
  title: string;
  detail: string;
  tone: SignalTone;
};

type AnalysisResult = {
  status: string;
  headline: string;
  lead: string;
  paymentTotal: number;
  paymentRecordsTotal: number;
  committedExpenses: number;
  periodProgress: number;
  expectedIncomeByDate: number;
  expectedExpensesByDate: number;
  incomeProgress: number;
  expenseProgress: number;
  incomePace: number;
  expensePace: number;
  incomePaceGap: number;
  expensePaceGap: number;
  paymentCoverage: number;
  maxPaymentRecord: number;
  maxCashPosition: number;
  maxIncomeChannel: number;
  sortedPaymentRecords: PaymentRecord[];
  overLimitRecords: PaymentRecord[];
  largestPayment: PaymentRecord;
  largestCategory: (typeof dashboardData.paymentCategories)[number];
  categoryGradient: string;
  findings: AnalysisFinding[];
  actions: AnalysisAction[];
};

const moneyFormatter = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 0,
  style: "currency",
  currency: "RUB",
});

const compactMoneyFormatter = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 1,
  notation: "compact",
  compactDisplay: "short",
  style: "currency",
  currency: "RUB",
});

const preciseMoneyFormatter = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  style: "currency",
  currency: "RUB",
});

const percentFormatter = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 1,
  style: "percent",
});

function formatMoney(value: number) {
  return moneyFormatter.format(value);
}

function formatCompactMoney(value: number) {
  return compactMoneyFormatter.format(value);
}

function formatPreciseMoney(value: number) {
  return preciseMoneyFormatter.format(value);
}

function formatSignedMoney(value: number) {
  return `${value > 0 ? "+" : ""}${formatMoney(value)}`;
}

function formatPercent(value: number) {
  return percentFormatter.format(value);
}

function ratio(value: number, base: number) {
  return base > 0 ? value / base : 0;
}

function clampRatio(value: number) {
  return Math.max(0, Math.min(1, value));
}

function barWidth(value: number, max: number) {
  if (max <= 0 || value <= 0) {
    return 0;
  }

  return Math.max(4, Math.min(100, (value / max) * 100));
}

function buildCategoryGradient(paymentTotal: number) {
  const toneColors = {
    green: "#2f6f55",
    blue: "#356a80",
    amber: "#9a681d",
    red: "#9b4435",
    neutral: "#5e6770",
  } satisfies Record<PaymentTone, string>;

  let cursor = 0;
  const segments = dashboardData.paymentCategories.map((category) => {
    const start = cursor;
    const size = ratio(category.amount, paymentTotal) * 100;
    cursor += size;

    return `${toneColors[category.tone]} ${start}% ${cursor}%`;
  });

  return `conic-gradient(${segments.join(", ")})`;
}

function limitState(record: PaymentRecord) {
  if (record.remainingLimit < 0) {
    return { label: "перерасход", className: "danger" as const };
  }

  if (record.remainingLimit < record.currentPayment) {
    return { label: "узкий лимит", className: "warning" as const };
  }

  return { label: "в лимите", className: "ok" as const };
}

function buildAnalysis(): AnalysisResult {
  const paymentTotal = dashboardData.expenses.currentPayments;
  const paymentRecordsTotal = dashboardData.paymentRecords.reduce(
    (sum, record) => sum + record.currentPayment,
    0,
  );
  const periodProgress = ratio(
    dashboardData.reportPeriod.elapsedDays,
    dashboardData.reportPeriod.totalDays,
  );
  const expectedIncomeByDate =
    dashboardData.income.monthlyPlan * periodProgress;
  const expectedExpensesByDate =
    dashboardData.expenses.monthlyPlan * periodProgress;
  const committedExpenses =
    dashboardData.expenses.cumulativeFact + dashboardData.expenses.currentPayments;
  const incomeProgress = ratio(
    dashboardData.income.cumulativeFact,
    dashboardData.income.monthlyPlan,
  );
  const expenseProgress = ratio(
    committedExpenses,
    dashboardData.expenses.monthlyPlan,
  );
  const incomePace = ratio(
    dashboardData.income.cumulativeFact,
    expectedIncomeByDate,
  );
  const expensePace = ratio(committedExpenses, expectedExpensesByDate);
  const incomePaceGap =
    dashboardData.income.cumulativeFact - expectedIncomeByDate;
  const expensePaceGap = committedExpenses - expectedExpensesByDate;
  const paymentCoverage = ratio(
    dashboardData.operations.endOfDayReserve,
    paymentTotal,
  );
  const sortedPaymentRecords = [...dashboardData.paymentRecords].sort(
    (a, b) => b.currentPayment - a.currentPayment,
  );
  const sortedCategories = [...dashboardData.paymentCategories].sort(
    (a, b) => b.amount - a.amount,
  );
  const overLimitRecords = dashboardData.paymentRecords.filter(
    (record) => record.remainingLimit < 0,
  );
  const headline =
    incomePace >= 0.98
      ? "Факт периода идет в темпе месячного плана"
      : "Факт 1–16 июня ниже темпа плана месяца";
  const status =
    incomePace < 0.7
      ? "Отставание по приходу"
      : incomePace < 0.98
        ? "Ниже темпа"
        : overLimitRecords.length > 0
          ? "В темпе, есть лимит"
          : "В темпе";
  const lead = [
    `Алгоритм разделил факт за ${dashboardData.reportPeriod.factLabel}`,
    `и план на ${dashboardData.reportPeriod.planLabel}.`,
    `На ${dashboardData.reportPeriod.elapsedDays} из ${dashboardData.reportPeriod.totalDays} дней`,
    `ожидаемый темп поступлений равен ${formatMoney(expectedIncomeByDate)},`,
    `факт составляет ${formatMoney(dashboardData.income.cumulativeFact)}.`,
    `Текущая платежная ведомость покрыта резервом на ${formatPercent(paymentCoverage)}.`,
  ].join(" ");

  return {
    status,
    headline,
    lead,
    paymentTotal,
    paymentRecordsTotal,
    committedExpenses,
    periodProgress,
    expectedIncomeByDate,
    expectedExpensesByDate,
    incomeProgress,
    expenseProgress,
    incomePace,
    expensePace,
    incomePaceGap,
    expensePaceGap,
    paymentCoverage,
    maxPaymentRecord: Math.max(
      ...dashboardData.paymentRecords.map((record) => record.currentPayment),
    ),
    maxCashPosition: Math.max(
      ...dashboardData.cash.positions.map((position) => position.amount),
    ),
    maxIncomeChannel: Math.max(
      ...dashboardData.income.channels.map((channel) => channel.cumulativeFact),
    ),
    sortedPaymentRecords,
    overLimitRecords,
    largestPayment: sortedPaymentRecords[0] ?? dashboardData.paymentRecords[0],
    largestCategory: sortedCategories[0] ?? dashboardData.paymentCategories[0],
    categoryGradient: buildCategoryGradient(paymentTotal),
    findings: [
      {
        label: "Темп поступлений",
        value: formatPercent(incomePace),
        detail:
          incomePace >= 1
            ? `Факт ${formatMoney(
                dashboardData.income.cumulativeFact,
              )} не ниже расчетного темпа на ${dashboardData.reportPeriod.factLabel}.`
            : `До темпа ${dashboardData.reportPeriod.elapsedDays}/${dashboardData.reportPeriod.totalDays} не хватает ${formatMoney(
                Math.abs(incomePaceGap),
              )}.`,
        tone: incomePace >= 0.98 ? "success" : incomePace >= 0.75 ? "attention" : "danger",
      },
      {
        label: "Темп расходов",
        value: formatPercent(expensePace),
        detail:
          expensePace <= 1
            ? `Расходы 1–16 июня с текущим распределением ниже расчетного темпа на ${formatMoney(
                Math.abs(expensePaceGap),
              )}.`
            : `Расходы выше расчетного темпа на ${formatMoney(expensePaceGap)}.`,
        tone: expensePace <= 1 ? "success" : "attention",
      },
      {
        label: "Ликвидность ведомости",
        value: formatPercent(paymentCoverage),
        detail:
          paymentCoverage >= 1
            ? "Резерв после распределения выше суммы текущих платежей."
            : "Резерв ниже суммы текущих платежей, нужен контроль кассового разрыва.",
        tone: paymentCoverage >= 1 ? "success" : "attention",
      },
      {
        label: "Лимиты",
        value: `${overLimitRecords.length}`,
        detail:
          overLimitRecords.length > 0
            ? `Обнаружен перерасход по строке: ${overLimitRecords[0].label}.`
            : "Платежные строки распределения не выходят за лимиты.",
        tone: overLimitRecords.length > 0 ? "attention" : "success",
      },
    ],
    actions: [
      {
        title: "Разобрать отставание поступлений от темпа",
        detail: `Факт ниже ожидаемого уровня на ${formatMoney(
          Math.abs(incomePaceGap),
        )}; нужен прогноз добора до ${dashboardData.reportPeriod.planLabel}.`,
        tone: incomePace >= 0.98 ? "success" : "danger",
      },
      {
        title: "Сохранить расходный темп месяца",
        detail: `Расходы занимают ${formatPercent(
          expenseProgress,
        )} месячного плана при пройденных ${formatPercent(periodProgress)} месяца.`,
        tone: "success",
      },
      {
        title:
          overLimitRecords.length > 0
            ? "Проверить локальный перерасход"
            : "Сохранить текущий контроль лимитов",
        detail:
          overLimitRecords.length > 0
            ? `${overLimitRecords[0].group}: ${formatMoney(
                overLimitRecords[0].remainingLimit,
              )}.`
            : "Критичных отклонений по строкам текущих платежей не найдено.",
        tone: overLimitRecords.length > 0 ? "attention" : "success",
      },
    ],
  };
}

function App() {
  const analysis = buildAnalysis();

  return (
    <main className="dashboard">
      <header className="executive-hero">
        <section className="hero-narrative">
          <p className="eyebrow">
            Итог анализа данных · {dashboardData.reportDate}
          </p>
          <h1>{analysis.headline}</h1>
          <p className="lead">{analysis.lead}</p>

          <div className="hero-outcome" aria-label="Ключевой результат анализа">
            <span>Отклонение поступлений от темпа</span>
            <strong>
              {formatSignedMoney(analysis.incomePaceGap)}
            </strong>
            <p>
              Факт за {dashboardData.reportPeriod.factLabel}:{" "}
              {formatMoney(dashboardData.income.cumulativeFact)}. Расчетный темп
              на эту дату: {formatMoney(analysis.expectedIncomeByDate)}.
            </p>
          </div>

          <div className="hero-proof-grid">
            <div>
              <span>Прошло месяца</span>
              <strong>{formatPercent(analysis.periodProgress)}</strong>
            </div>
            <div>
              <span>Факт поступлений</span>
              <strong>{formatPercent(analysis.incomeProgress)}</strong>
            </div>
            <div>
              <span>Расходы к плану</span>
              <strong>{formatPercent(analysis.expenseProgress)}</strong>
            </div>
          </div>
        </section>

        <aside className="hero-command-panel" aria-label="Сводка анализа">
          <div className="command-header">
            <span>Сигнал модели</span>
            <strong>{analysis.status}</strong>
          </div>

          <GaugeChart
            label="Темп поступлений"
            note={`Факт против ${dashboardData.reportPeriod.planLabel}`}
            tone="red"
            value={analysis.incomePace}
          />

          <div className="mini-gauge-grid">
            <GaugeChart
              label="Расходный темп"
              note={formatMoney(analysis.committedExpenses)}
              tone="blue"
              value={clampRatio(analysis.expensePace)}
            />
            <GaugeChart
              label="Покрытие платежей"
              note={formatMoney(dashboardData.operations.endOfDayReserve)}
              tone="amber"
              value={clampRatio(analysis.paymentCoverage / 1.5)}
            />
          </div>

          <div className="source-summary compact" aria-label="Источник данных">
            <span>Источник данных</span>
            <strong>{dashboardData.sourceFile}</strong>
            <p>
              Факт: {dashboardData.reportPeriod.factLabel}. План:{" "}
              {dashboardData.reportPeriod.planLabel}. Обработано:{" "}
              {dashboardData.paymentRecords.length} платежных строк;{" "}
              {dashboardData.reportPeriod.distributionLabel}.
            </p>
          </div>
        </aside>
      </header>

      <section className="analysis-strip" aria-label="Параметры обработки">
        <ProcessingStat
          label="Дней в факте"
          value={`${dashboardData.reportPeriod.elapsedDays}`}
          note={dashboardData.reportPeriod.factLabel}
        />
        <ProcessingStat
          label="Дней в плане"
          value={`${dashboardData.reportPeriod.totalDays}`}
          note={dashboardData.reportPeriod.planLabel}
        />
        <ProcessingStat
          label="Темп прихода"
          value={formatPercent(analysis.incomePace)}
          note="к ожидаемому уровню"
        />
        <ProcessingStat
          label="Найдено рисков"
          value={`${analysis.overLimitRecords.length}`}
          note="выход за лимит"
        />
      </section>

      <section className="executive-visuals" aria-label="Визуальная аналитика">
        <article className="visual-panel pace-panel">
          <div className="visual-heading">
            <div>
              <p className="eyebrow">Темп к плану месяца</p>
              <h2>Факт сравнен с планом до 30 июня</h2>
            </div>
            <strong>{formatPercent(analysis.periodProgress)} периода</strong>
          </div>

          <PlanPaceChart analysis={analysis} />
        </article>

        <article className="visual-panel">
          <div className="visual-heading">
            <div>
              <p className="eyebrow">Автогруппировка распределения</p>
              <h2>{analysis.largestCategory.label} лидирует</h2>
            </div>
            <strong>{formatMoney(analysis.paymentTotal)}</strong>
          </div>

          <div className="donut-layout">
            <div
              aria-label="Круговая диаграмма текущих платежей"
              className="donut-chart"
              role="img"
              style={{ background: analysis.categoryGradient }}
            >
              <div>
                <strong>{formatMoney(analysis.paymentTotal)}</strong>
                <span>распределение</span>
              </div>
            </div>

            <ul className="donut-legend">
              {dashboardData.paymentCategories.map((category) => (
                <li key={`legend-${category.label}`}>
                  <span className={`tone-dot tone-${category.tone}`} />
                  <span>{category.label}</span>
                  <strong>
                    {formatPercent(category.amount / analysis.paymentTotal)}
                  </strong>
                </li>
              ))}
            </ul>
          </div>
        </article>

        <article className="visual-panel">
          <div className="visual-heading">
            <div>
              <p className="eyebrow">Определены драйверы распределения</p>
              <h2>{analysis.sortedPaymentRecords.length} строк ранжированы</h2>
            </div>
            <strong>
              {formatCompactMoney(analysis.largestPayment.currentPayment)}
            </strong>
          </div>

          <TopPaymentChart
            maxPaymentRecord={analysis.maxPaymentRecord}
            records={analysis.sortedPaymentRecords.slice(0, 5)}
          />
        </article>
      </section>

      <section className="summary-grid" aria-label="Ключевые рассчитанные показатели">
        <MetricCard
          accent="green"
          label="Поступления 1–16 июня"
          value={formatMoney(dashboardData.income.cumulativeFact)}
          note={`${formatPercent(
            analysis.incomeProgress,
          )} месячного плана; ${formatPercent(analysis.incomePace)} от темпа.`}
        />
        <MetricCard
          accent="blue"
          label="Расходы 1–16 + распределение"
          value={formatMoney(analysis.committedExpenses)}
          note={`${formatPercent(
            analysis.expenseProgress,
          )} месячного плана; ${formatPercent(analysis.expensePace)} от темпа.`}
        />
        <MetricCard
          accent="amber"
          label="Платежи распределения"
          value={formatMoney(analysis.paymentTotal)}
          note={`${dashboardData.reportPeriod.distributionLabel}; сумма строк: ${formatMoney(
            analysis.paymentRecordsTotal,
          )}.`}
        />
        <MetricCard
          accent="red"
          label="Резерв после распределения"
          value={formatMoney(dashboardData.operations.endOfDayReserve)}
          note={`Покрытие платежей: ${formatPercent(
            analysis.paymentCoverage,
          )}.`}
        />
      </section>

      <section className="analysis-board" aria-label="Результаты анализа">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Что нашла модель</p>
              <h2>Выводы по данным</h2>
            </div>
            <strong>{analysis.status}</strong>
          </div>
          <ul className="insight-list">
            {analysis.findings.map((finding) => (
              <li className={`signal-${finding.tone}`} key={finding.label}>
                <div>
                  <span>{finding.label}</span>
                  <strong>{finding.value}</strong>
                </div>
                <p>{finding.detail}</p>
              </li>
            ))}
          </ul>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Следующие действия</p>
              <h2>Сформировано автоматически</h2>
            </div>
            <strong>{analysis.actions.length} шага</strong>
          </div>
          <ol className="action-list">
            {analysis.actions.map((action) => (
              <li className={`signal-${action.tone}`} key={action.title}>
                <strong>{action.title}</strong>
                <p>{action.detail}</p>
              </li>
            ))}
          </ol>
        </article>
      </section>

      <section className="detail-grid" aria-label="Проверочная детализация">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Сверка источников</p>
              <h2>Поступления 1–16 июня по каналам</h2>
            </div>
            <strong>{formatMoney(dashboardData.income.cumulativeFact)}</strong>
          </div>
          <ul className="channel-list">
            {dashboardData.income.channels.map((channel) => (
              <li key={channel.label}>
                <div>
                  <span>
                    {channel.label} · код {channel.code}
                  </span>
                  <strong>{formatPreciseMoney(channel.cumulativeFact)}</strong>
                </div>
                <div className="bar-track" aria-hidden="true">
                  <span
                    style={{
                      width: `${barWidth(
                        channel.cumulativeFact,
                        analysis.maxIncomeChannel,
                      )}%`,
                    }}
                  />
                </div>
                <small>
                  В распределении: {formatPreciseMoney(channel.currentDay)}
                </small>
              </li>
            ))}
          </ul>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Денежная позиция</p>
              <h2>Где лежат средства</h2>
            </div>
            <strong>{formatMoney(dashboardData.cash.total)}</strong>
          </div>
          <ul className="cash-list">
            {dashboardData.cash.positions.map((position) => (
              <li key={position.label}>
                <div>
                  <span>{position.label}</span>
                  <strong>{formatPreciseMoney(position.amount)}</strong>
                </div>
                <div className="bar-track" aria-hidden="true">
                  <span
                    style={{
                      width: `${barWidth(position.amount, analysis.maxCashPosition)}%`,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </article>

        <article className="panel span-2">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Контроль лимитов</p>
              <h2>Ранжированные платежи распределения</h2>
            </div>
            <strong>{formatMoney(analysis.paymentTotal)}</strong>
          </div>
          <div className="table-wrap">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th scope="col">Строка</th>
                  <th scope="col">Группа</th>
                  <th scope="col">Статья</th>
                  <th scope="col">Платеж</th>
                  <th scope="col">Остаток</th>
                  <th scope="col">Статус</th>
                </tr>
              </thead>
              <tbody>
                {analysis.sortedPaymentRecords.map((record) => {
                  const state = limitState(record);

                  return (
                    <tr key={`${record.row}-${record.code}`}>
                      <td>{record.row}</td>
                      <td>{record.group}</td>
                      <td>
                        <span className={`tone-dot tone-${record.tone}`} />
                        {record.label}
                      </td>
                      <td>{formatMoney(record.currentPayment)}</td>
                      <td>{formatMoney(record.remainingLimit)}</td>
                      <td>
                        <span className={`status-pill ${state.className}`}>
                          {state.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </main>
  );
}

type MetricCardProps = {
  accent: "green" | "blue" | "amber" | "red";
  label: string;
  value: string;
  note: string;
};

function MetricCard({ accent, label, note, value }: MetricCardProps) {
  return (
    <article className={`metric-card accent-${accent}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{note}</p>
    </article>
  );
}

type ProcessingStatProps = {
  label: string;
  note: string;
  value: string;
};

function ProcessingStat({ label, note, value }: ProcessingStatProps) {
  return (
    <article className="processing-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{note}</p>
    </article>
  );
}

type GaugeChartProps = {
  label: string;
  note: string;
  tone: PaymentTone;
  value: number;
};

function GaugeChart({ label, note, tone, value }: GaugeChartProps) {
  const percent = Math.round(clampRatio(value) * 100);

  return (
    <div className={`gauge-card tone-${tone}`}>
      <div
        aria-label={`${label}: ${percent}%`}
        className="gauge-ring"
        role="img"
        style={{
          background: `conic-gradient(var(--tone-color) ${percent}%, var(--surface-muted) 0)`,
        }}
      >
        <div>
          <strong>{percent}%</strong>
        </div>
      </div>
      <div>
        <strong>{label}</strong>
        <span>{note}</span>
      </div>
    </div>
  );
}

type PlanPaceChartProps = {
  analysis: AnalysisResult;
};

function PlanPaceChart({ analysis }: PlanPaceChartProps) {
  const periodMarker = clampRatio(analysis.periodProgress) * 100;
  const rows = [
    {
      label: "Поступления",
      fact: dashboardData.income.cumulativeFact,
      expected: analysis.expectedIncomeByDate,
      plan: dashboardData.income.monthlyPlan,
      pace: analysis.incomePace,
      note:
        analysis.incomePaceGap >= 0
          ? `Факт выше темпа на ${formatMoney(analysis.incomePaceGap)}.`
          : `Факт ниже темпа на ${formatMoney(Math.abs(analysis.incomePaceGap))}.`,
      tone:
        analysis.incomePace >= 0.98
          ? "green"
          : analysis.incomePace >= 0.75
            ? "amber"
            : "red",
    },
    {
      label: "Расходы",
      fact: analysis.committedExpenses,
      expected: analysis.expectedExpensesByDate,
      plan: dashboardData.expenses.monthlyPlan,
      pace: analysis.expensePace,
      note:
        analysis.expensePace <= 1
          ? `Расходы ниже темпа на ${formatMoney(
              Math.abs(analysis.expensePaceGap),
            )}.`
          : `Расходы выше темпа на ${formatMoney(analysis.expensePaceGap)}.`,
      tone: analysis.expensePace <= 1 ? "green" : "amber",
    },
  ] satisfies Array<{
    label: string;
    fact: number;
    expected: number;
    plan: number;
    pace: number;
    note: string;
    tone: PaymentTone;
  }>;

  return (
    <div className="pace-chart">
      {rows.map((row) => (
        <article className={`pace-row tone-${row.tone}`} key={row.label}>
          <div className="pace-row-head">
            <div>
              <span>{row.label}</span>
              <strong>{formatMoney(row.fact)}</strong>
            </div>
            <b>{formatPercent(row.pace)} от темпа</b>
          </div>
          <div
            aria-label={`${row.label}: факт ${formatMoney(
              row.fact,
            )}, ожидаемый темп ${formatMoney(row.expected)}, план ${formatMoney(
              row.plan,
            )}`}
            className="pace-track"
            role="img"
          >
            <span
              className="pace-expected"
              style={{ width: `${periodMarker}%` }}
            />
            <span
              className="pace-fact"
              style={{ width: `${clampRatio(ratio(row.fact, row.plan)) * 100}%` }}
            />
            <i style={{ left: `${periodMarker}%` }} />
          </div>
          <div className="pace-values">
            <span>Темп: {formatCompactMoney(row.expected)}</span>
            <span>План: {formatCompactMoney(row.plan)}</span>
          </div>
          <p>{row.note}</p>
        </article>
      ))}
    </div>
  );
}

type TopPaymentChartProps = {
  maxPaymentRecord: number;
  records: readonly PaymentRecord[];
};

function TopPaymentChart({ maxPaymentRecord, records }: TopPaymentChartProps) {
  return (
    <ul className="top-payment-chart">
      {records.map((record) => {
        const state = limitState(record);

        return (
          <li className={`tone-${record.tone}`} key={`chart-${record.row}`}>
            <div>
              <span>{record.group}</span>
              <strong>{record.label}</strong>
            </div>
            <b>{formatCompactMoney(record.currentPayment)}</b>
            <div className="bar-track" aria-hidden="true">
              <span
                style={{
                  width: `${barWidth(record.currentPayment, maxPaymentRecord)}%`,
                }}
              />
            </div>
            <small className={state.className}>{state.label}</small>
          </li>
        );
      })}
    </ul>
  );
}

export default App;
