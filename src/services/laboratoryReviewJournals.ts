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
  "rotary_kiln_2",
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
 * Search scopes, split into two rows like the laboratory assistant tab: the root
 * row holds `Все испытания`, the control sections of the results journal and the
 * `ЦЗЛ` group button, and the central laboratory journals open inside that group.
 */
export type LaboratoryReviewViewId =
  | "all"
  | LaboratorySection
  | LaboratoryReviewJournalId;

export type LaboratoryReviewViewGroup = "root" | "central-lab";

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

/** Stacking order of the tables, kept the same as the button order below. */
export const laboratoryReviewJournals: readonly LaboratoryReviewJournal[] = [
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
];

export const laboratoryReviewViews: readonly LaboratoryReviewView[] = [
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
];

/** Buttons of the root row; the `ЦЗЛ` button is rendered after them. */
export const laboratoryReviewRootViews = laboratoryReviewViews.filter(
  (view) => view.group === "root",
);

/** Buttons of the nested row, opened from the `ЦЗЛ` button. */
export const laboratoryReviewCentralLabViews = laboratoryReviewViews.filter(
  (view) => view.group === "central-lab",
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
