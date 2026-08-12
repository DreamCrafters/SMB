import type { LaboratorySection } from "../contracts/laboratoryResults.js";

/**
 * Laboratory journals keep different table formats, so the management review tab
 * shows one table per journal and only for the journals whose data the active
 * filters can actually match.
 */

export const laboratoryReviewJournalIds = [
  "results",
  "sample_registration",
  "chemical_analysis",
  "unshaped_product_samples",
  "formed_product_samples",
  "verifications",
  "rotary_kiln_2",
  "raw_material_quality",
  "green_product_quality",
] as const;

export type LaboratoryReviewJournalId =
  (typeof laboratoryReviewJournalIds)[number];
export type LaboratoryReviewJournalSelection =
  | LaboratoryReviewJournalId
  | "all";
export type LaboratoryReviewSection = LaboratorySection | "all";

export type LaboratoryReviewFilters = {
  isNameFilterEnabled: boolean;
};

export type LaboratoryReviewJournal = {
  id: LaboratoryReviewJournalId;
  /** Heading above the journal table. */
  title: string;
  /** Which date the period filter narrows in this journal. */
  dateFilterLabel: string;
  supportsNameQuery: boolean;
};

/**
 * Search scopes follow the laboratory assistant tab: the root row holds
 * `Все испытания` plus the `ЦЗЛ`, `ОТК`, and `ОЦ` group buttons, and each
 * group's journals open in their own nested row.
 */
export type LaboratoryReviewViewId =
  | "all"
  | LaboratorySection
  | LaboratoryReviewJournalId;

export type LaboratoryReviewViewGroup =
  | "root"
  | "central-lab"
  | "quality-control"
  | "refractory-shop";

export type LaboratoryReviewView = {
  id: LaboratoryReviewViewId;
  label: string;
  journal: LaboratoryReviewJournalSelection;
  section: LaboratoryReviewSection;
  group: LaboratoryReviewViewGroup;
};

export type LaboratoryReviewJournalExclusion = {
  journal: LaboratoryReviewJournal;
  reason: string;
};

/**
 * Разделы контроля убраны у всех, кто просматривает лабораторные анализы:
 * входящий и выходящий контроль признаны некорректными и будут заменены другой
 * логикой в других местах. Вместе с ними из просмотра уходит и журнал
 * результатов испытаний — он состоит только из этих разделов. Сохранённые
 * результаты, их PDF-протоколы и код журнала остаются на месте, а вернуть их в
 * просмотр можно, снова перечислив разделы здесь.
 */
export const visibleLaboratoryReviewSections: readonly LaboratorySection[] = [];

/** Stacking order of the tables, kept the same as the button order below. */
const allLaboratoryReviewJournals: readonly LaboratoryReviewJournal[] = [
  {
    id: "results",
    title: "Результаты испытаний",
    dateFilterLabel: "дата анализа",
    supportsNameQuery: true,
  },
  {
    id: "sample_registration",
    title: "Журнал регистрации отбора проб",
    dateFilterLabel: "дата регистрации",
    supportsNameQuery: true,
  },
  {
    id: "chemical_analysis",
    title: "Журнал химических анализов",
    dateFilterLabel: "дата химического анализа",
    supportsNameQuery: true,
  },
  {
    id: "rotary_kiln_2",
    title: "Журнал контроля параметров обжига вращающейся печи 2",
    dateFilterLabel: "дата записи",
    supportsNameQuery: false,
  },
  {
    id: "unshaped_product_samples",
    title: "Пробы неформованной продукции",
    dateFilterLabel: "дата пробы",
    supportsNameQuery: true,
  },
  {
    id: "formed_product_samples",
    title: "Регистрация проб готовой формованной продукции (кирпича)",
    dateFilterLabel: "дата сортировки",
    supportsNameQuery: true,
  },
  {
    id: "verifications",
    title: "Верификации",
    dateFilterLabel: "дата",
    supportsNameQuery: true,
  },
  {
    id: "raw_material_quality",
    title: "Журнал контроля качества сырья и соблюдения технологии",
    dateFilterLabel: "дата записи",
    supportsNameQuery: true,
  },
  {
    id: "green_product_quality",
    title: "Журнал контроля качества сырцовой продукции",
    dateFilterLabel: "дата контроля сырца",
    supportsNameQuery: true,
  },
];

export const laboratoryReviewJournals = allLaboratoryReviewJournals.filter(
  (journal) =>
    journal.id !== "results" || visibleLaboratoryReviewSections.length > 0,
);

const allLaboratoryReviewViews: readonly LaboratoryReviewView[] = [
  {
    id: "all",
    label: "Все испытания",
    journal: "all",
    section: "all",
    group: "root",
  },
  {
    id: "incoming",
    label: "Входящий контроль",
    journal: "results",
    section: "incoming",
    group: "root",
  },
  {
    id: "finished_product",
    label: "Выходящий контроль",
    journal: "results",
    section: "finished_product",
    group: "root",
  },
  {
    id: "sample_registration",
    label: "Регистрация проб",
    journal: "sample_registration",
    section: "all",
    group: "central-lab",
  },
  {
    id: "chemical_analysis",
    label: "Химические анализы",
    journal: "chemical_analysis",
    section: "all",
    group: "central-lab",
  },
  {
    id: "rotary_kiln_2",
    label: "Журнал печи 2",
    journal: "rotary_kiln_2",
    section: "all",
    group: "central-lab",
  },
  {
    id: "unshaped_product_samples",
    label: "Пробы неформованной продукции",
    journal: "unshaped_product_samples",
    section: "all",
    group: "quality-control",
  },
  {
    id: "formed_product_samples",
    label: "Регистрация проб формованной продукции (кирпича)",
    journal: "formed_product_samples",
    section: "all",
    group: "quality-control",
  },
  {
    id: "verifications",
    label: "Верификации",
    journal: "verifications",
    section: "all",
    group: "quality-control",
  },
  {
    id: "raw_material_quality",
    label: "Качество сырья и соблюдение технологии",
    journal: "raw_material_quality",
    section: "all",
    group: "refractory-shop",
  },
  {
    id: "green_product_quality",
    label: "Качество сырцовой продукции",
    journal: "green_product_quality",
    section: "all",
    group: "refractory-shop",
  },
];

export const laboratoryReviewViews = allLaboratoryReviewViews.filter(
  (view) =>
    view.section === "all" ||
    visibleLaboratoryReviewSections.includes(view.section),
);

/** Buttons of the root row; journal group buttons are rendered after them. */
export const laboratoryReviewRootViews = laboratoryReviewViews.filter(
  (view) => view.group === "root",
);

/** Buttons of the nested row, opened from the `ЦЗЛ` button. */
export const laboratoryReviewCentralLabViews = laboratoryReviewViews.filter(
  (view) => view.group === "central-lab",
);

/** Buttons of the nested row, opened from the `ОТК` button. */
export const laboratoryReviewQualityControlViews = laboratoryReviewViews.filter(
  (view) => view.group === "quality-control",
);

/** Buttons of the nested row, opened from the refractory shop group. */
export const laboratoryReviewRefractoryShopViews = laboratoryReviewViews.filter(
  (view) => view.group === "refractory-shop",
);

const nameExclusionReason = "не содержит наименования (номенклатуры)";

export function selectLaboratoryReviewJournals(
  view: LaboratoryReviewView,
  filters: LaboratoryReviewFilters,
): {
  visible: LaboratoryReviewJournal[];
  excluded: LaboratoryReviewJournalExclusion[];
} {
  const requested = laboratoryReviewJournals.filter(
    (journal) => view.journal === "all" || journal.id === view.journal,
  );
  const visible: LaboratoryReviewJournal[] = [];
  const excluded: LaboratoryReviewJournalExclusion[] = [];

  for (const journal of requested) {
    const reason = readExclusionReason(journal, filters);
    if (reason === undefined) visible.push(journal);
    else excluded.push({ journal, reason });
  }

  return { visible, excluded };
}

function readExclusionReason(
  journal: LaboratoryReviewJournal,
  filters: LaboratoryReviewFilters,
) {
  if (filters.isNameFilterEnabled && !journal.supportsNameQuery) {
    return nameExclusionReason;
  }
  return undefined;
}
