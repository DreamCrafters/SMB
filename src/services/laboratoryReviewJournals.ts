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
  section: LaboratoryReviewSection;
  isNameFilterEnabled: boolean;
};

export type LaboratoryReviewJournal = {
  id: LaboratoryReviewJournalId;
  /** Label of the journal button. */
  label: string;
  /** Heading above the journal table. */
  title: string;
  /** Which date the period filter narrows in this journal. */
  dateFilterLabel: string;
  supportsSection: boolean;
  supportsNameQuery: boolean;
};

export type LaboratoryReviewJournalExclusion = {
  journal: LaboratoryReviewJournal;
  reason: string;
};

export const laboratoryReviewJournals: readonly LaboratoryReviewJournal[] = [
  {
    id: "results",
    label: "Результаты испытаний",
    title: "Результаты испытаний",
    dateFilterLabel: "дата анализа",
    supportsSection: true,
    supportsNameQuery: true,
  },
  {
    id: "sample_registration",
    label: "Регистрация проб",
    title: "Журнал регистрации отбора проб",
    dateFilterLabel: "дата регистрации",
    supportsSection: false,
    supportsNameQuery: true,
  },
  {
    id: "chemical_analysis",
    label: "Химические анализы",
    title: "Журнал химических анализов",
    dateFilterLabel: "дата химического анализа",
    supportsSection: false,
    supportsNameQuery: true,
  },
  {
    id: "rotary_kiln_2",
    label: "Журнал печи 2",
    title: "Журнал контроля параметров обжига вращающейся печи 2",
    dateFilterLabel: "дата записи",
    supportsSection: false,
    supportsNameQuery: false,
  },
];

const sectionExclusionReason =
  "не делится на входящий и выходящий контроль";
const nameExclusionReason = "не содержит наименования (номенклатуры)";

export function selectLaboratoryReviewJournals(
  selection: LaboratoryReviewJournalSelection,
  filters: LaboratoryReviewFilters,
): {
  visible: LaboratoryReviewJournal[];
  excluded: LaboratoryReviewJournalExclusion[];
} {
  const requested = laboratoryReviewJournals.filter(
    (journal) => selection === "all" || journal.id === selection,
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
  if (filters.section !== "all" && !journal.supportsSection) {
    return sectionExclusionReason;
  }
  if (filters.isNameFilterEnabled && !journal.supportsNameQuery) {
    return nameExclusionReason;
  }
  return undefined;
}
