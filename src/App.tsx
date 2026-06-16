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
  availableAfterPayments: number;
  incomeProgress: number;
  expenseProgress: number;
  paymentCoverage: number;
  incomeToPaymentsRatio: number;
  salesShare: number;
  successScore: number;
  maxPaymentRecord: number;
  maxCategoryAmount: number;
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

function formatCompactSignedMoney(value: number) {
  return `${value > 0 ? "+" : ""}${formatCompactMoney(value)}`;
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

function formatRatio(value: number) {
  return value.toLocaleString("ru-RU", {
    maximumFractionDigits: 1,
  });
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
  const paymentCoverage = ratio(
    dashboardData.operations.endOfDayReserve,
    paymentTotal,
  );
  const incomeToPaymentsRatio = ratio(
    dashboardData.income.currentDay,
    paymentTotal,
  );
  const salesShare = ratio(
    dashboardData.income.salesCurrentDay,
    dashboardData.income.currentDay,
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
  const availableAfterPayments =
    dashboardData.cash.total +
    dashboardData.income.currentDay -
    dashboardData.expenses.currentPayments;
  const successScore =
    (clampRatio(incomeToPaymentsRatio / 3) +
      clampRatio(paymentCoverage / 1.4) +
      clampRatio(salesShare)) /
    3;
  const headline =
    successScore >= 0.85
      ? "Анализ показывает устойчивый финансовый день"
      : "Анализ показывает рабочий день с точками контроля";
  const status =
    successScore >= 0.85
      ? "Устойчиво"
      : overLimitRecords.length > 0
        ? "Есть контроль"
        : "Норма";
  const lead = [
    `Алгоритм сопоставил ${dashboardData.paymentRecords.length} платежных строк,`,
    `${dashboardData.paymentCategories.length} групп расходов и`,
    `${dashboardData.income.channels.length} канала поступлений.`,
    `Итог: приход выше платежей в ${formatRatio(incomeToPaymentsRatio)} раза,`,
    `резерв покрывает ${formatPercent(paymentCoverage)} расходов дня.`,
  ].join(" ");

  return {
    status,
    headline,
    lead,
    paymentTotal,
    paymentRecordsTotal,
    committedExpenses,
    availableAfterPayments,
    incomeProgress,
    expenseProgress,
    paymentCoverage,
    incomeToPaymentsRatio,
    salesShare,
    successScore,
    maxPaymentRecord: Math.max(
      ...dashboardData.paymentRecords.map((record) => record.currentPayment),
    ),
    maxCategoryAmount: Math.max(
      ...dashboardData.paymentCategories.map((category) => category.amount),
    ),
    maxCashPosition: Math.max(
      ...dashboardData.cash.positions.map((position) => position.amount),
    ),
    maxIncomeChannel: Math.max(
      ...dashboardData.income.channels.map((channel) => channel.currentDay),
    ),
    sortedPaymentRecords,
    overLimitRecords,
    largestPayment: sortedPaymentRecords[0] ?? dashboardData.paymentRecords[0],
    largestCategory: sortedCategories[0] ?? dashboardData.paymentCategories[0],
    categoryGradient: buildCategoryGradient(paymentTotal),
    findings: [
      {
        label: "Денежный поток",
        value: formatSignedMoney(dashboardData.operations.netCashFlowToday),
        detail:
          dashboardData.operations.netCashFlowToday > 0
            ? "Поступления дня закрывают текущие платежи и оставляют положительный поток."
            : "Текущие платежи превышают поступления дня.",
        tone: dashboardData.operations.netCashFlowToday > 0 ? "success" : "danger",
      },
      {
        label: "Ликвидность",
        value: formatPercent(paymentCoverage),
        detail:
          paymentCoverage >= 1
            ? "Резерв на конец дня выше суммы текущих платежей."
            : "Резерв ниже суммы текущих платежей, нужен контроль кассового разрыва.",
        tone: paymentCoverage >= 1 ? "success" : "attention",
      },
      {
        label: "Качество прихода",
        value: formatPercent(salesShare),
        detail:
          salesShare >= 0.9
            ? "Основной приход сформирован продажами продукции и услуг."
            : "В приходе заметна доля непрофильных поступлений.",
        tone: salesShare >= 0.9 ? "success" : "attention",
      },
      {
        label: "Лимиты",
        value: `${overLimitRecords.length}`,
        detail:
          overLimitRecords.length > 0
            ? `Обнаружен перерасход по строке: ${overLimitRecords[0].label}.`
            : "Платежные строки дня не выходят за лимиты.",
        tone: overLimitRecords.length > 0 ? "attention" : "success",
      },
    ],
    actions: [
      {
        title: "Утвердить денежную позицию дня",
        detail: `После платежей доступно ${formatMoney(availableAfterPayments)} до депозитной операции.`,
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
      {
        title: "Держать в фокусе крупнейшую группу расходов",
        detail: `${sortedCategories[0].label}: ${formatMoney(
          sortedCategories[0].amount,
        )}, ${formatPercent(ratio(sortedCategories[0].amount, paymentTotal))} платежей дня.`,
        tone: "neutral",
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
            <span>Расчетный чистый денежный поток</span>
            <strong>
              {formatSignedMoney(dashboardData.operations.netCashFlowToday)}
            </strong>
            <p>
              После текущих платежей модель видит{" "}
              {formatMoney(analysis.availableAfterPayments)} доступной денежной
              позиции до перевода на депозит.
            </p>
          </div>

          <div className="hero-proof-grid">
            <div>
              <span>Поступления / платежи</span>
              <strong>{formatRatio(analysis.incomeToPaymentsRatio)}x</strong>
            </div>
            <div>
              <span>Резерв к платежам</span>
              <strong>{formatPercent(analysis.paymentCoverage)}</strong>
            </div>
            <div>
              <span>Доля продаж</span>
              <strong>{formatPercent(analysis.salesShare)}</strong>
            </div>
          </div>
        </section>

        <aside className="hero-command-panel" aria-label="Сводка анализа">
          <div className="command-header">
            <span>Сигнал модели</span>
            <strong>{analysis.status}</strong>
          </div>

          <GaugeChart
            label="Индекс уверенности"
            note="Поток, покрытие и качество прихода"
            tone="green"
            value={analysis.successScore}
          />

          <div className="mini-gauge-grid">
            <GaugeChart
              label="Покрытие платежей"
              note={formatMoney(dashboardData.operations.endOfDayReserve)}
              tone="blue"
              value={clampRatio(analysis.paymentCoverage / 1.5)}
            />
            <GaugeChart
              label="Продажи в приходе"
              note={formatMoney(dashboardData.income.salesCurrentDay)}
              tone="amber"
              value={analysis.salesShare}
            />
          </div>

          <div className="source-summary compact" aria-label="Источник данных">
            <span>Источник данных</span>
            <strong>{dashboardData.sourceFile}</strong>
            <p>
              Обработано: {dashboardData.paymentRecords.length} платежных строк,
              {` ${dashboardData.paymentCategories.length}`} групп расходов,
              {` ${dashboardData.income.channels.length}`} канала поступлений.
            </p>
          </div>
        </aside>
      </header>

      <section className="analysis-strip" aria-label="Параметры обработки">
        <ProcessingStat
          label="Проверено строк"
          value={`${dashboardData.paymentRecords.length}`}
          note="текущие платежи"
        />
        <ProcessingStat
          label="Сгруппировано"
          value={`${dashboardData.paymentCategories.length}`}
          note="направлений расходов"
        />
        <ProcessingStat
          label="Сверено каналов"
          value={`${dashboardData.income.channels.length}`}
          note="поступления дня"
        />
        <ProcessingStat
          label="Найдено рисков"
          value={`${analysis.overLimitRecords.length}`}
          note="выход за лимит"
        />
      </section>

      <section className="executive-visuals" aria-label="Визуальная аналитика">
        <article className="visual-panel cash-flow-panel">
          <div className="visual-heading">
            <div>
              <p className="eyebrow">Расчет движения денег</p>
              <h2>Поток остается положительным</h2>
            </div>
            <strong>
              {formatCompactSignedMoney(dashboardData.operations.netCashFlowToday)}
            </strong>
          </div>

          <WaterfallChart
            paymentTotal={analysis.paymentTotal}
            reserve={dashboardData.operations.endOfDayReserve}
          />
        </article>

        <article className="visual-panel">
          <div className="visual-heading">
            <div>
              <p className="eyebrow">Автогруппировка платежей</p>
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
                <span>день</span>
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
              <p className="eyebrow">Определены драйверы платежей</p>
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
          label="Денежные средства"
          value={formatMoney(dashboardData.cash.total)}
          note="Счета, касса, бизнес-карта и депозитные счета."
        />
        <MetricCard
          accent="blue"
          label="Поступления дня"
          value={formatMoney(dashboardData.income.currentDay)}
          note={`Продажи и услуги: ${formatMoney(
            dashboardData.income.salesCurrentDay,
          )}.`}
        />
        <MetricCard
          accent="amber"
          label="Текущие платежи"
          value={formatMoney(analysis.paymentTotal)}
          note={`Сумма строк анализа: ${formatMoney(
            analysis.paymentRecordsTotal,
          )}.`}
        />
        <MetricCard
          accent="red"
          label="Резерв конца дня"
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
              <h2>Поступления по каналам</h2>
            </div>
            <strong>{formatMoney(dashboardData.income.currentDay)}</strong>
          </div>
          <ul className="channel-list">
            {dashboardData.income.channels.map((channel) => (
              <li key={channel.label}>
                <div>
                  <span>
                    {channel.label} · код {channel.code}
                  </span>
                  <strong>{formatPreciseMoney(channel.currentDay)}</strong>
                </div>
                <div className="bar-track" aria-hidden="true">
                  <span
                    style={{
                      width: `${barWidth(
                        channel.currentDay,
                        analysis.maxIncomeChannel,
                      )}%`,
                    }}
                  />
                </div>
                <small>
                  Нарастающий факт: {formatPreciseMoney(channel.cumulativeFact)}
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
              <h2>Ранжированные платежи дня</h2>
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

type WaterfallChartProps = {
  paymentTotal: number;
  reserve: number;
};

function WaterfallChart({ paymentTotal, reserve }: WaterfallChartProps) {
  const steps = [
    {
      label: "Старт",
      amount: dashboardData.cash.total,
      tone: "blue",
    },
    {
      label: "Приход",
      amount: dashboardData.income.currentDay,
      tone: "green",
    },
    {
      label: "Платежи",
      amount: -paymentTotal,
      tone: "red",
    },
    {
      label: "Депозит",
      amount: -dashboardData.operations.depositTransfer,
      tone: "amber",
    },
    {
      label: "Резерв",
      amount: reserve,
      tone: "neutral",
    },
  ] as const;
  const maxAmount = Math.max(...steps.map((step) => Math.abs(step.amount)));

  return (
    <div className="waterfall-chart">
      {steps.map((step) => (
        <div className={`waterfall-step tone-${step.tone}`} key={step.label}>
          <div className="waterfall-column" aria-hidden="true">
            <span
              className={step.amount < 0 ? "negative" : "positive"}
              style={{
                height: `${barWidth(Math.abs(step.amount), maxAmount)}%`,
              }}
            />
          </div>
          <strong>{formatCompactSignedMoney(step.amount)}</strong>
          <span>{step.label}</span>
        </div>
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
