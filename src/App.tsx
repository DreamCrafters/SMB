import {
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  accountCapabilities,
  productionCategories,
  type AccountNavigationItem,
  type AccountPosition,
  type AccountType,
  type BoardAssignmentAccess,
  type AdminAccountSummary,
  type AdminPositionSummary,
  type AdminDatabaseCellValue,
  type AdminDatabaseColumn,
  type AdminDatabaseMergeTarget,
  type AdminDatabaseRow,
  type AdminDatabaseTable,
  type AdminDispatcherImportPreviewResponse,
  type AuditEventCategory,
  type DispatcherFormDefinition,
  type DispatcherFormField,
  type DispatcherFormId,
  type DispatcherProductionBankContent,
  type DispatcherSubmission,
  type DispatcherSubmissionPayload,
  type ProductionBrandCategoryRow,
  type ProductionBrandCategoryTotals,
  type ProductionBrandLabel,
  type ProductionCategory,
  type ProductionCategoryPlans,
  type ProductionDailyPlan,
  type ProductionGranulationRow,
  type ProductionGranulationTotals,
  type ProductionJarMeasurementRow,
  type ProductionJarMeasurementTotals,
  type ProductionMetricRow,
  type ProductionMonthToDateValue,
  type ProductionReportBaseRow,
  type ProductionReportTableTotals,
  type ProductionReportTables,
  type ProductionPlanRevision,
  type ProductionPlanPreviewResponse,
  type RefractoryReportRevision,
  type DevAccessOption,
  type ServerUserProfile,
  type UserActivityActor,
  type UserActivityEvent,
} from "./contracts";
import {
  accountPositionLabels,
  authOptions,
  boardAssignmentAccessOptions,
  navigationItemsByAccountType,
  nonAdminNavigationItems,
  shellCopy,
  type NavigationItem,
} from "./content";
import {
  clearDevAccessSession,
  requestDevAccessOptions,
  selectDevAccessSession,
  type DevAccessOptionsResult,
  type DevAccessSessionResult,
} from "./services/devAccessSession";
import {
  loginWithPassword,
  logoutAuthSession,
  type AuthSessionResult,
} from "./services/authSession";
import { readDispatcherAutoLogoutAt } from "./services/dispatcherSessionExpiry";
import { isProductionAppEnv } from "./services/appEnvironment";
import {
  requestAccessProfile,
  type AccessProfileLoadState,
} from "./services/accessProfile";
import {
  dispatcherFeedPageLimit,
  mergeDispatcherFeedSubmissions,
  requestDispatcherForms,
  requestCompleteDispatcherFeed,
  requestDispatcherFeed,
  submitDispatcherEquipmentReport,
  submitDispatcherSubmission,
  type DispatcherFeedResult,
  type DispatcherFormsResult,
} from "./services/dispatcherSubmissions";
import {
  isProductionBrandColumnFieldName,
  isWeekendReportDate,
  validateDispatcherPayloadForSubmit,
} from "./services/dispatcherPayloadValidation";
import {
  buildIncidentResponsibleInput,
  decimalNumberInputPattern,
  decimalNumberInputTitle,
  integerInputPattern,
  integerInputTitle,
  normalizeDecimalNumberForPayload,
  normalizeDecimalNumberInput,
  normalizeIntegerForPayload,
  normalizeIntegerInput,
  normalizeSignedDecimalNumberForPayload,
  normalizeSignedDecimalNumberInput,
  signedDecimalNumberInputPattern,
  signedDecimalNumberInputTitle,
} from "./services/dispatcherFormInput";
import {
  initialIncidentCloseSelectionState,
  reduceIncidentCloseSelection,
} from "./services/dispatcherIncidentClose";
import {
  buildEquipmentCompletionMap,
  buildEquipmentFormPayload,
  buildEquipmentReportPayloads,
  formatReportDateForDisplay,
  hasEquipmentReportData,
  isEquipmentReportEntryDirty,
  readEquipmentDraftPayload,
  readEquipmentOptions,
  readLastEquipmentOption,
  readEquipmentReportEntryPayload,
  writeEquipmentReportEntryPayload,
  writeEquipmentDraftPayload,
  writeLastEquipmentOption,
  type DispatcherEquipmentDraftStorage,
} from "./services/dispatcherEquipmentReports";
import {
  canRequestDispatcherForms,
  canManageAnalyticsDatabase,
  canManageUsers,
  canSubmitDispatcherForms,
  hasCapability,
  resolveAllowedNavigationTab,
  resolveAllowedWorkspaceKind,
  type WorkspaceKind,
} from "./services/accessGuards";
import {
  clearAdminDatabaseTable,
  deleteAdminDatabaseRow,
  mergeAdminDatabaseRows,
  replaceTestDatabaseWithProductionSnapshot,
  requestAdminDatabaseRows,
  requestAdminDatabaseTables,
  requestProductionSnapshotStatus,
  updateAdminDatabaseRow,
  type AdminDatabaseRowsResult,
  type AdminDatabaseTablesResult,
  type ProductionSnapshotStatusResult,
} from "./services/adminDatabase";
import {
  formatAdminDatabaseCellValue,
  hasAdminDatabaseRowActions,
} from "./services/adminDatabasePresentation";
import {
  executeAdminDispatcherImport,
  previewAdminDispatcherImport,
} from "./services/adminDispatcherImport";
import {
  canDeleteAdminPosition,
  createAdminAccount,
  createAdminPosition,
  deleteAdminPosition,
  deleteAdminAccount,
  hasAdminAccountLogin,
  requestAdminAccounts,
  requestAdminPositions,
  resetAdminAccountPassword,
  saveAdminPositionOrder,
  setAdminAccountLoginEnabled,
  setAdminAccountProtected,
  setAdminAccountPosition,
  setAdminPositionProtected,
  updateAdminPosition,
  type AdminAccountsListResult,
  type AdminPositionsResult,
} from "./services/adminAccounts";
import {
  recordAuditScreenView,
  requestAdminAuditReport,
  type AdminAuditReportResult,
} from "./services/adminAudit";
import {
  buildDispatcherFeedDateRange,
  buildEquipmentDetailRows,
  buildEquipmentSummaryRows,
  buildIncidentSummaryRows,
  buildOwnerDispatcherOverview,
  buildOpenIncidentOptions,
  buildOpenIncidentRows,
  buildOpenVisitorOptions,
  buildProductionBrandCategoryTotals,
  filterProductionBrandCategoryRows,
  filterProductionReportTables,
  buildVisitorVisitRows,
  type DispatcherFeedGroup,
  type DispatcherFeedPeriod,
  type OwnerDispatcherOverview,
} from "./services/dispatcherFeedViews";
import {
  requestBusinessOverview,
  type BusinessOverviewResult,
} from "./services/businessOverview";
import { readShortUserMessage } from "./services/userFacingMessages";
import {
  requestProductionDailyPlan,
  requestProductionPlan,
  requestProductionPlanPreview,
  saveProductionPlan,
} from "./services/productionPlans";
import {
  requestDispatcherProductionBankContents,
  type DispatcherProductionBankContentsResult,
} from "./services/dispatcherBankContents";
import { ProductBrandPicker } from "./ProductBrandPicker";
import { LoadingIndicator } from "./LoadingIndicator";
import { useProductionBrands } from "./useProductionBrands";
import { formatUserShortName } from "./services/userDisplayName";
import {
  markToastExiting,
  prependToast,
  removeToast,
  shouldToastAutoDismiss,
  type AppToast,
  type ShowToast,
} from "./services/toastStack";
import type { NotificationTone } from "./contracts/notifications";
import {
  RefractoryReviewQueue,
  RefractoryShopWorkspace,
} from "./RefractoryReports";
import {
  buildRefractoryDecisionNotifications,
  buildRefractoryStatusMap,
  countReturnedRefractoryReportsByType,
  emptyReturnedRefractoryReportCounts,
  listReturnedRefractoryShifts,
  requestOwnRefractoryReports,
  requestPendingRefractoryReports,
  type ReturnedRefractoryShift,
} from "./services/refractoryReports";
import { LaboratoryResultsWorkspace } from "./LaboratoryResults";
import { LaboratoryReviewWorkspace } from "./LaboratoryReview";
import { BoardAssignmentsWorkspace } from "./BoardAssignments";
import {
  AdminNotificationSettingsModal,
  NotificationSettingsWorkspace,
} from "./NotificationSettings";
import { requestLoginNotifications } from "./services/notificationSettings";

type BusinessTab =
  | "overview"
  | "dispatcher"
  | "work"
  | "production_plan"
  | "refractory_shop"
  | "laboratory_results"
  | "laboratory_review"
  | "board_assignments"
  | "settings"
  | "user_actions"
  | "dispatcher_form";
type AdminTab = "account_preview" | "accounts" | "database" | "user_actions";

const navigationByBusinessTab: Record<BusinessTab, AccountNavigationItem> = {
  overview: "business.overview",
  dispatcher: "business.dispatcher",
  work: "business.work",
  production_plan: "business.production_plan",
  refractory_shop: "business.refractory_shop",
  laboratory_results: "business.laboratory_results",
  laboratory_review: "business.laboratory_review",
  board_assignments: "business.board_assignments",
  settings: "business.settings",
  user_actions: "business.user_actions",
  dispatcher_form: "business.dispatcher_form",
};

const navigationByAdminTab: Record<AdminTab, AccountNavigationItem> = {
  account_preview: "admin.account_preview",
  accounts: "admin.accounts",
  database: "admin.database",
  user_actions: "admin.user_actions",
};

type DataEntrySubmitStateControls = {
  setStatus: (message: string) => void;
  setIsSubmitting: (isSubmitting: boolean) => void;
};

type DataEntrySubmitCallbacks = {
  onSuccess?: (message: string) => void;
};

type DataEntrySubmitHandler = (
  event: FormEvent<HTMLFormElement>,
  actingProfile?: ServerUserProfile,
  controls?: DataEntrySubmitStateControls,
  callbacks?: DataEntrySubmitCallbacks,
) => void;

type SessionRequestState =
  | {
      status: "idle";
    }
  | {
      status: "loading";
      position?: AccountPosition;
    }
  | {
      status: "error";
      message: string;
    };

type DispatcherFeedLoadState =
  | {
      status: "loading";
      message: string;
    }
  | DispatcherFeedResult;

type DispatcherIncidentLoginPromptState = "idle" | "pending" | "open";

type BusinessOverviewLoadState =
  | {
      status: "loading";
      message: string;
    }
  | BusinessOverviewResult;

type DispatcherFormsLoadState =
  | {
      status: "loading";
      message: string;
    }
  | DispatcherFormsResult;

type AdminDatabaseTablesLoadState =
  | {
      status: "loading";
      message: string;
    }
  | AdminDatabaseTablesResult;

type AdminDatabaseRowsLoadState =
  | {
      status: "idle" | "loading";
      message: string;
    }
  | AdminDatabaseRowsResult;

type AdminAccountsLoadState =
  | {
      status: "loading";
      message: string;
    }
  | AdminAccountsListResult;

type AdminPositionsLoadState =
  | {
      status: "loading";
      message: string;
    }
  | AdminPositionsResult;

type AdminAuditLoadState =
  | {
      status: "loading";
      message: string;
    }
  | AdminAuditReportResult;

type DevAccessOptionsLoadState =
  | { status: "loading"; message: string }
  | DevAccessOptionsResult;

type DispatcherFeedFilterState = {
  group: DispatcherFeedGroup;
  period: DispatcherFeedPeriod;
  dateFrom: string;
  dateTo: string;
  incidentView: "period" | "all_open";
};

type ProductionReportSection = keyof ProductionReportTables;

type DispatcherFormChoiceGroupId =
  | "production"
  | "equipment"
  | "incidents"
  | "visitors";

type EquipmentLocalStatusTone = "info" | "error";

type DispatcherFormChoiceGroup = {
  id: DispatcherFormChoiceGroupId;
  title: string;
  description: string;
  forms: DispatcherFormDefinition[];
};

type FormLeaveGuard = (continueAfterDiscard: () => void) => boolean;

const successToastVisibleDurationMs = 4_000;
const toastExitDurationMs = 260;
const toastShiftDurationMs = 220;
const authScrollRestoreGuardDurationMs = 1_000;
const mobileNavigationMediaQuery = "(max-width: 820px)";

const initialAccessProfileState: AccessProfileLoadState = {
  status: "loading",
  message: "Загружаем профиль.",
};

const initialSessionRequestState: SessionRequestState = {
  status: "idle",
};

const initialDispatcherFeedState: DispatcherFeedLoadState = {
  status: "loading",
  message: "Загружаем историю.",
};

const initialBusinessOverviewState: BusinessOverviewLoadState = {
  status: "loading",
  message: "Загружаем обзор.",
};

const emptyProductionReportTables: ProductionReportTables = {
  forming: [],
  sorting: [],
  unformed: [],
  chamotte: [],
  jars: [],
  granulation: [],
};

const emptyProductionReportTableTotals: ProductionReportTableTotals = {
  forming: { rowCount: 0 },
  sorting: { rowCount: 0 },
  unformed: { rowCount: 0 },
  chamotte: { rowCount: 0 },
  jars: { rowCount: 0 },
  granulation: { rowCount: 0 },
};

const initialDispatcherFormsState: DispatcherFormsLoadState = {
  status: "loading",
  message: "Загружаем формы.",
};

const initialDispatcherFeedFilters: DispatcherFeedFilterState = {
  group: "equipment",
  period: "custom",
  dateFrom: "",
  dateTo: "",
  incidentView: "period",
};

const dispatcherFeedPeriodOptions: readonly {
  id: DispatcherFeedPeriod;
  label: string;
}[] = [
  { id: "today", label: "Сегодня" },
  { id: "current_month", label: "Текущий месяц" },
  { id: "current_year", label: "Текущий год" },
  { id: "custom", label: "Своё" },
];

const monthDisplayInputPattern = "(0[1-9]|1[0-2])\\.[0-9]{4}";
const monthDisplayInputTitle = "Введите месяц в формате ММ.ГГГГ, например 06.2026.";
const isProductionApp = isProductionAppEnv();
const isLocalTestFallbackEnabled = !isProductionApp;

function buildNavigationItems(
  profile: ServerUserProfile,
  businessTab: BusinessTab,
  adminTab: AdminTab,
  workspaceKind: WorkspaceKind,
): NavigationItem[] {
  const navigationItems = [
    ...nonAdminNavigationItems,
    ...navigationItemsByAccountType.admin,
  ].filter((item) => profile.activeAccess.navigationItems.includes(item.id));
  const effectiveWorkspaceKind = resolveAllowedWorkspaceKind(
    workspaceKind,
    profile.activeAccess.navigationItems,
  );
  const effectiveBusinessTab = resolveAllowedNavigationTab(
    businessTab,
    navigationByBusinessTab,
    profile.activeAccess.navigationItems,
  );
  const effectiveAdminTab = resolveAllowedNavigationTab(
    adminTab,
    navigationByAdminTab,
    profile.activeAccess.navigationItems,
  );

  return navigationItems
    .map((item) => {
      const businessTarget = getBusinessTabForNavigationItem(item);
      const adminTarget = getAdminTabForNavigationItem(item);
      const isActive = effectiveWorkspaceKind === "business"
        ? businessTarget === effectiveBusinessTab
        : effectiveWorkspaceKind === "admin"
          ? adminTarget === effectiveAdminTab
          : false;

      return {
        ...item,
        state: isActive ? "active" : "pending",
      };
    });
}

function getBusinessTabForNavigationItem(item: NavigationItem): BusinessTab | undefined {
  switch (item.id) {
    case "business.overview":
      return "overview";
    case "business.dispatcher":
      return "dispatcher";
    case "business.work":
      return "work";
    case "business.production_plan":
      return "production_plan";
    case "business.refractory_shop":
      return "refractory_shop";
    case "business.laboratory_results":
      return "laboratory_results";
    case "business.laboratory_review":
      return "laboratory_review";
    case "business.board_assignments":
      return "board_assignments";
    case "business.settings":
      return "settings";
    case "business.user_actions":
      return "user_actions";
    case "business.dispatcher_form":
      return "dispatcher_form";
    default:
      return undefined;
  }
}

function getAdminTabForNavigationItem(item: NavigationItem): AdminTab | undefined {
  switch (item.id) {
    case "admin.account_preview":
      return "account_preview";
    case "admin.accounts":
      return "accounts";
    case "admin.database":
      return "database";
    case "admin.user_actions":
      return "user_actions";
    default:
      return undefined;
  }
}

function getAdminNavigationItem(tab: AdminTab): AccountNavigationItem {
  return navigationByAdminTab[tab];
}

function hasAdminAccountPreviewAccess(profile: ServerUserProfile) {
  return profile.activeAccess.navigationItems.includes("admin.account_preview");
}

function getBusinessAuditScreenId(
  activeTab: BusinessTab,
): AccountNavigationItem | undefined {
  return navigationByBusinessTab[activeTab];
}

export default function App() {
  const [accessProfile, setAccessProfile] = useState<AccessProfileLoadState>(
    initialAccessProfileState,
  );
  const [sessionRequest, setSessionRequest] = useState<SessionRequestState>(
    initialSessionRequestState,
  );
  const [requestVersion, setRequestVersion] = useState(0);
  const [dataEntryStatus, setDataEntryStatus] = useState("");
  const [isDataEntrySubmitting, setIsDataEntrySubmitting] = useState(false);
  const [ownerTab, setOwnerTab] = useState<BusinessTab>("overview");
  const [adminTab, setAdminTab] = useState<AdminTab>("account_preview");
  const [workspaceKind, setWorkspaceKind] = useState<WorkspaceKind>("business");
  const [workspaceNavigationVersion, setWorkspaceNavigationVersion] =
    useState(0);
  const [adminViewedAccount, setAdminViewedAccount] =
    useState<AdminAccountSummary>();
  const [adminViewedOwnerTab, setAdminViewedOwnerTab] =
    useState<BusinessTab>("overview");
  const [adminViewedDataEntryStatus, setAdminViewedDataEntryStatus] =
    useState("");
  const [
    isAdminViewedDataEntrySubmitting,
    setIsAdminViewedDataEntrySubmitting,
  ] = useState(false);
  const [dispatcherFeed, setDispatcherFeed] = useState<DispatcherFeedLoadState>(
    initialDispatcherFeedState,
  );
  const [businessOverview, setBusinessOverview] =
    useState<BusinessOverviewLoadState>(initialBusinessOverviewState);
  const [dispatcherForms, setDispatcherForms] =
    useState<DispatcherFormsLoadState>(initialDispatcherFormsState);
  const [pendingRefractoryReports, setPendingRefractoryReports] = useState<
    RefractoryReportRevision[]
  >([]);
  const [refractoryQueueError, setRefractoryQueueError] = useState("");
  const knownPendingRefractoryIdsRef = useRef<Set<string>>(new Set());
  const hasLoadedPendingRefractoryRef = useRef(false);
  const knownOwnRefractoryStatusesRef = useRef<
    Map<string, RefractoryReportRevision["status"]>
  >(new Map());
  const hasLoadedOwnRefractoryRef = useRef(false);
  const [returnedRefractoryCounts, setReturnedRefractoryCounts] = useState(
    emptyReturnedRefractoryReportCounts,
  );
  const [returnedRefractoryShifts, setReturnedRefractoryShifts] = useState<
    ReturnedRefractoryShift[]
  >([]);
  const returnedRefractoryCount = Object.values(
    returnedRefractoryCounts,
  ).reduce((total, count) => total + count, 0);
  const [refractoryDecisionVersion, setRefractoryDecisionVersion] = useState(0);
  const [dispatcherSubmissionVersion, setDispatcherSubmissionVersion] = useState(0);
  const [dispatcherFeedFilters, setDispatcherFeedFilters] =
    useState<DispatcherFeedFilterState>(initialDispatcherFeedFilters);
  const [adminViewedDispatcherFeedFilters, setAdminViewedDispatcherFeedFilters] =
    useState<DispatcherFeedFilterState>(initialDispatcherFeedFilters);
  const [isWelcomePending, setIsWelcomePending] = useState(false);
  const [dispatcherIncidentLoginPrompt, setDispatcherIncidentLoginPrompt] =
    useState<DispatcherIncidentLoginPromptState>("idle");
  const [requestedDispatcherFormId, setRequestedDispatcherFormId] =
    useState<DispatcherFormId>();
  const [isMobileNavigation, setIsMobileNavigation] = useState(() =>
    window.matchMedia(mobileNavigationMediaQuery).matches,
  );
  const [isNavigationOpen, setIsNavigationOpen] = useState(() =>
    !window.matchMedia(mobileNavigationMediaQuery).matches,
  );
  const [toasts, setToasts] = useState<AppToast[]>([]);
  const nextToastIdRef = useRef(0);
  const toastTimeoutIdsRef = useRef<Set<number>>(new Set());
  const toastAutoDismissTimeoutIdsRef = useRef<Map<number, number>>(new Map());
  const exitingToastIdsRef = useRef<Set<number>>(new Set());
  const loginNotificationRequestIdRef = useRef(0);
  const lastRecordedScreenRef = useRef("");

  useEffect(() => {
    const visibleOverviewNavigationItems =
      adminViewedAccount === undefined
        ? accessProfile.status === "ready"
          ? accessProfile.profile.activeAccess.navigationItems
          : []
        : adminViewedAccount.navigationItems;
    const visibleOverviewTab = resolveAllowedNavigationTab(
      adminViewedAccount === undefined ? ownerTab : adminViewedOwnerTab,
      navigationByBusinessTab,
      visibleOverviewNavigationItems,
    );

    if (
      accessProfile.status !== "ready" ||
      (
        !hasCapability(accessProfile.profile, "business.view_all_statistics") &&
        !(
          adminViewedAccount !== undefined &&
          hasAdminAccountPreviewAccess(accessProfile.profile)
        )
      ) ||
      visibleOverviewTab !== "overview"
    ) {
      setBusinessOverview(initialBusinessOverviewState);
      return;
    }

    let isActive = true;
    let isLoading = false;
    let currentController: AbortController | undefined;

    async function loadBusinessOverview() {
      if (isLoading) return;

      isLoading = true;
      currentController?.abort();
      currentController = new AbortController();

      setBusinessOverview((current) =>
        current.status === "ready"
          ? current
          : initialBusinessOverviewState,
      );
      try {
        const result = await requestBusinessOverview({
          signal: currentController.signal,
        });

        if (isActive) {
          setBusinessOverview(result);
        }
      } finally {
        isLoading = false;
      }
    }

    loadBusinessOverview();
    const intervalId = window.setInterval(loadBusinessOverview, 5_000);

    return () => {
      isActive = false;
      currentController?.abort();
      window.clearInterval(intervalId);
    };
  }, [
    accessProfile,
    adminViewedAccount,
    adminViewedOwnerTab,
    ownerTab,
    dispatcherSubmissionVersion,
  ]);

  useEffect(() => {
    const timeoutIds = toastTimeoutIdsRef.current;

    return () => {
      loginNotificationRequestIdRef.current += 1;
      timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
      timeoutIds.clear();
      toastAutoDismissTimeoutIdsRef.current.clear();
      exitingToastIdsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia(mobileNavigationMediaQuery);

    function handleViewportChange(event: MediaQueryListEvent) {
      setIsMobileNavigation(event.matches);
      setIsNavigationOpen(!event.matches);
    }

    mediaQuery.addEventListener("change", handleViewportChange);

    return () => mediaQuery.removeEventListener("change", handleViewportChange);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    setAccessProfile({
      status: "loading",
      message: "Загружаем профиль.",
    });

    requestAccessProfile({
      localDevFallback: isLocalTestFallbackEnabled,
      signal: controller.signal,
    }).then((result) => {
      if (!controller.signal.aborted) {
        setAccessProfile(result);
      }
    });

    return () => {
      controller.abort();
    };
  }, [requestVersion]);

  useEffect(() => {
    const visibleDispatcherNavigationItems =
      adminViewedAccount === undefined
        ? accessProfile.status === "ready"
          ? accessProfile.profile.activeAccess.navigationItems
          : []
        : adminViewedAccount.navigationItems;
    const visibleDispatcherTab = resolveAllowedNavigationTab(
      adminViewedAccount === undefined ? ownerTab : adminViewedOwnerTab,
      navigationByBusinessTab,
      visibleDispatcherNavigationItems,
    );
    const isAdminViewedFeed =
      accessProfile.status === "ready" &&
      accessProfile.profile.activeAccess.navigationItems.includes(
        "admin.account_preview",
      ) &&
      adminTab === "account_preview" &&
      adminViewedAccount !== undefined;
    const activeDispatcherFeedFilters = isAdminViewedFeed
      ? adminViewedDispatcherFeedFilters
      : dispatcherFeedFilters;
    const productionDateFrom =
      activeDispatcherFeedFilters.group === "production"
        ? activeDispatcherFeedFilters.dateFrom || undefined
        : undefined;
    const productionDateTo =
      activeDispatcherFeedFilters.group === "production"
        ? activeDispatcherFeedFilters.dateTo || undefined
        : undefined;

    if (
      accessProfile.status !== "ready" ||
      (
        !hasCapability(accessProfile.profile, "business.view_dispatcher_feed") &&
        !isAdminViewedFeed
      ) ||
      (
        visibleDispatcherTab !== "dispatcher" &&
        visibleDispatcherTab !== "overview" &&
        visibleDispatcherTab !== "dispatcher_form"
      )
    ) {
      setDispatcherFeed(initialDispatcherFeedState);
      return;
    }

    let isActive = true;
    let isLoading = false;
    let currentController: AbortController | undefined;
    let completeHistory: DispatcherSubmission[] | undefined;
    let reloadTimeoutId: number | undefined;

    async function loadDispatcherFeed() {
      if (isLoading) {
        return;
      }

      isLoading = true;
      currentController?.abort();
      currentController = new AbortController();

      setDispatcherFeed((current) =>
        current.status === "ready"
          ? current
          : {
              status: "loading",
              message: "Загружаем историю.",
            },
      );

      try {
        const request = completeHistory === undefined
          ? requestCompleteDispatcherFeed
          : requestDispatcherFeed;
        const result = await request({
          signal: currentController.signal,
          localFallback: isLocalTestFallbackEnabled,
          limit: dispatcherFeedPageLimit,
          productionDateFrom,
          productionDateTo,
        });

        if (!isActive) {
          return;
        }

        if (result.status !== "ready") {
          setDispatcherFeed(result);
          return;
        }

        if (completeHistory === undefined) {
          completeHistory = result.submissions;
          setDispatcherFeed(result);
          return;
        }

        const mergedSubmissions = mergeDispatcherFeedSubmissions(
          completeHistory,
          result.submissions,
        );

        if (mergedSubmissions.length !== result.summary.total) {
          completeHistory = undefined;
          reloadTimeoutId = window.setTimeout(loadDispatcherFeed, 0);
          return;
        }

        completeHistory = mergedSubmissions;
        setDispatcherFeed({
          ...result,
          submissions: mergedSubmissions,
        });
      } finally {
        isLoading = false;
      }
    }

    loadDispatcherFeed();
    const intervalId = window.setInterval(loadDispatcherFeed, 5_000);

    return () => {
      isActive = false;
      currentController?.abort();
      window.clearInterval(intervalId);
      if (reloadTimeoutId !== undefined) {
        window.clearTimeout(reloadTimeoutId);
      }
    };
  }, [
    accessProfile,
    adminTab,
    adminViewedAccount,
    adminViewedDispatcherFeedFilters.group,
    adminViewedDispatcherFeedFilters.dateFrom,
    adminViewedDispatcherFeedFilters.dateTo,
    adminViewedOwnerTab,
    dispatcherFeedFilters.group,
    dispatcherFeedFilters.dateFrom,
    dispatcherFeedFilters.dateTo,
    ownerTab,
    dispatcherSubmissionVersion,
  ]);

  useEffect(() => {
    if (
      accessProfile.status !== "ready" ||
      (
        !canRequestDispatcherForms(accessProfile.profile) &&
        !(
          adminViewedAccount !== undefined &&
          hasAdminAccountPreviewAccess(accessProfile.profile)
        )
      )
    ) {
      setDispatcherForms(initialDispatcherFormsState);
      return;
    }

    const controller = new AbortController();

    setDispatcherForms({
      status: "loading",
      message: "Загружаем формы.",
    });

    requestDispatcherForms({
      localFallback: isLocalTestFallbackEnabled,
      signal: controller.signal,
    }).then((result) => {
      if (!controller.signal.aborted) {
        setDispatcherForms(result);
      }
    });

    return () => {
      controller.abort();
    };
  }, [accessProfile, adminViewedAccount]);

  useEffect(() => {
    if (
      accessProfile.status !== "ready" ||
      !hasCapability(
        accessProfile.profile,
        "business.submit_refractory_reports",
      )
    ) {
      knownOwnRefractoryStatusesRef.current = new Map();
      hasLoadedOwnRefractoryRef.current = false;
      setReturnedRefractoryCounts(emptyReturnedRefractoryReportCounts);
      setReturnedRefractoryShifts([]);
      return;
    }

    let isActive = true;
    let isLoading = false;
    let controller: AbortController | undefined;

    async function loadOwnRefractoryReports() {
      if (isLoading) return;
      isLoading = true;
      controller?.abort();
      controller = new AbortController();
      const result = await requestOwnRefractoryReports({
        signal: controller.signal,
      });
      isLoading = false;
      if (!isActive || controller.signal.aborted || result.status === "error") {
        return;
      }

      if (hasLoadedOwnRefractoryRef.current) {
        const notifications = buildRefractoryDecisionNotifications(
          knownOwnRefractoryStatusesRef.current,
          result.reports,
        );
        for (const notification of notifications) {
          handleShowToast(
            notification.title,
            notification.message,
            notification.tone,
          );
        }
        if (notifications.length > 0) {
          setRefractoryDecisionVersion((value) => value + 1);
        }
      }

      knownOwnRefractoryStatusesRef.current = buildRefractoryStatusMap(
        result.reports,
      );
      setReturnedRefractoryCounts(
        countReturnedRefractoryReportsByType(result.reports),
      );
      setReturnedRefractoryShifts(
        listReturnedRefractoryShifts(result.reports),
      );
      hasLoadedOwnRefractoryRef.current = true;
    }

    void loadOwnRefractoryReports();
    const intervalId = window.setInterval(loadOwnRefractoryReports, 5_000);
    return () => {
      isActive = false;
      controller?.abort();
      window.clearInterval(intervalId);
    };
  }, [accessProfile]);

  useEffect(() => {
    if (
      accessProfile.status !== "ready" ||
      !hasCapability(
        accessProfile.profile,
        "business.review_refractory_reports",
      )
    ) {
      setPendingRefractoryReports([]);
      setRefractoryQueueError("");
      knownPendingRefractoryIdsRef.current = new Set();
      hasLoadedPendingRefractoryRef.current = false;
      return;
    }

    let isActive = true;
    let isLoading = false;
    let controller: AbortController | undefined;

    async function loadPendingReports() {
      if (isLoading) return;
      isLoading = true;
      controller?.abort();
      controller = new AbortController();
      const result = await requestPendingRefractoryReports({
        signal: controller.signal,
      });
      isLoading = false;
      if (!isActive || controller.signal.aborted) return;

      if (result.status === "error") {
        setRefractoryQueueError(
          readShortUserMessage(
            result.message,
            "Не удалось проверить таблицы ОЦ.",
          ),
        );
        return;
      }

      const nextIds = new Set(result.reports.map((report) => report.id));
      const newReports = result.reports.filter(
        (report) => !knownPendingRefractoryIdsRef.current.has(report.id),
      );

      if (!hasLoadedPendingRefractoryRef.current && result.reports.length > 0) {
        handleShowToast(
          "Ожидают подтверждения",
          `Таблицы огнеупорного цеха: ${result.reports.length}.`,
          "suggestion",
        );
      } else if (newReports.length > 0) {
        handleShowToast(
          "Новая таблица ОЦ",
          newReports.length === 1
            ? "Поступила таблица на подтверждение."
            : `Поступило таблиц: ${newReports.length}.`,
          "suggestion",
        );
      }

      hasLoadedPendingRefractoryRef.current = true;
      knownPendingRefractoryIdsRef.current = nextIds;
      setRefractoryQueueError("");
      setPendingRefractoryReports(result.reports);
    }

    void loadPendingReports();
    const intervalId = window.setInterval(loadPendingReports, 5_000);
    return () => {
      isActive = false;
      controller?.abort();
      window.clearInterval(intervalId);
    };
  }, [accessProfile]);

  useEffect(() => {
    if (
      accessProfile.status !== "ready" ||
      !accessProfile.profile.activeAccess.navigationItems.includes(
        "admin.account_preview",
      ) ||
      adminTab !== "account_preview"
    ) {
      setAdminViewedAccount(undefined);
    }
  }, [accessProfile, adminTab]);

  useEffect(() => {
    if (accessProfile.status !== "ready") {
      return;
    }

    const logoutAt = readDispatcherAutoLogoutAt(accessProfile.profile);

    if (logoutAt === undefined) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void handleAutomaticDispatcherLogout();
    }, Math.max(0, logoutAt.getTime() - Date.now()));

    return () => window.clearTimeout(timeoutId);
  }, [accessProfile]);

  useEffect(() => {
    if (!isWelcomePending || accessProfile.status !== "ready") {
      return;
    }

    const shortName = formatUserShortName(accessProfile.profile.displayName);
    const requestId = loginNotificationRequestIdRef.current + 1;
    loginNotificationRequestIdRef.current = requestId;

    handleShowToast(
      "Добро пожаловать",
      shortName.length > 0 ? `Здравствуйте, ${shortName}!` : "Здравствуйте!",
      "success",
    );
    setIsWelcomePending(false);
    void requestLoginNotifications().then((result) => {
      if (
        loginNotificationRequestIdRef.current !== requestId ||
        result.status !== "ready"
      ) return;
      result.notifications.forEach(({ title, message, tone }) => {
        handleShowToast(title, message, tone);
      });
    });
  }, [accessProfile, isWelcomePending]);

  useEffect(() => {
    if (
      dispatcherIncidentLoginPrompt !== "pending" ||
      accessProfile.status !== "ready"
    ) {
      return;
    }

    if (
      !accessProfile.profile.activeAccess.navigationItems.includes(
        "business.dispatcher_form",
      )
    ) {
      setDispatcherIncidentLoginPrompt("idle");
      return;
    }

    if (dispatcherFeed.status === "ready") {
      setDispatcherIncidentLoginPrompt("open");
    }
  }, [accessProfile, dispatcherFeed.status, dispatcherIncidentLoginPrompt]);

  useEffect(() => {
    if (accessProfile.status !== "ready") {
      return;
    }

    const profile = accessProfile.profile;
    const previewTab = adminViewedAccount === undefined
      ? undefined
      : resolveAllowedNavigationTab(
          adminViewedOwnerTab,
          navigationByBusinessTab,
          adminViewedAccount.navigationItems,
        );
    const activeBusinessTab = resolveAllowedNavigationTab(
      ownerTab,
      navigationByBusinessTab,
      profile.activeAccess.navigationItems,
    );
    const activeAdminTab = resolveAllowedNavigationTab(
      adminTab,
      navigationByAdminTab,
      profile.activeAccess.navigationItems,
    );
    const activeWorkspaceKind = resolveAllowedWorkspaceKind(
      workspaceKind,
      profile.activeAccess.navigationItems,
    );
    const screenId = adminViewedAccount !== undefined && previewTab !== undefined
      ? getBusinessAuditScreenId(previewTab)
      : activeWorkspaceKind === "admin" && activeAdminTab !== undefined
        ? getAdminNavigationItem(activeAdminTab)
        : activeBusinessTab === undefined
          ? undefined
          : getBusinessAuditScreenId(activeBusinessTab);

    if (screenId === undefined) {
      return;
    }

    const screenKey = `${profile.activeAccess.accountId}:${screenId}`;

    if (lastRecordedScreenRef.current === screenKey) {
      return;
    }

    lastRecordedScreenRef.current = screenKey;
    void recordAuditScreenView(screenId);
  }, [
    accessProfile,
    adminTab,
    adminViewedAccount,
    adminViewedOwnerTab,
    ownerTab,
    workspaceKind,
  ]);

  function scheduleToastTimeout(callback: () => void, delayMs: number) {
    const timeoutId = window.setTimeout(() => {
      toastTimeoutIdsRef.current.delete(timeoutId);
      callback();
    }, delayMs);

    toastTimeoutIdsRef.current.add(timeoutId);
    return timeoutId;
  }

  function cancelToastTimeout(timeoutId: number) {
    window.clearTimeout(timeoutId);
    toastTimeoutIdsRef.current.delete(timeoutId);
  }

  function handleShowToast(
    title: string,
    message: string,
    tone: NotificationTone,
  ) {
    const toastId = nextToastIdRef.current + 1;
    nextToastIdRef.current = toastId;

    setToasts((current) =>
      prependToast(current, {
        id: toastId,
        title,
        message,
        tone,
        state: "visible",
      }),
    );

    if (shouldToastAutoDismiss(tone)) {
      const timeoutId = scheduleToastTimeout(() => {
        toastAutoDismissTimeoutIdsRef.current.delete(toastId);
        handleDismissToast(toastId);
      }, successToastVisibleDurationMs);
      toastAutoDismissTimeoutIdsRef.current.set(toastId, timeoutId);
    }
  }

  function handleDismissToast(toastId: number) {
    const autoDismissTimeoutId =
      toastAutoDismissTimeoutIdsRef.current.get(toastId);
    if (autoDismissTimeoutId !== undefined) {
      cancelToastTimeout(autoDismissTimeoutId);
      toastAutoDismissTimeoutIdsRef.current.delete(toastId);
    }
    if (exitingToastIdsRef.current.has(toastId)) {
      return;
    }

    exitingToastIdsRef.current.add(toastId);
    setToasts((current) => markToastExiting(current, toastId));
    scheduleToastTimeout(() => {
      setToasts((current) => removeToast(current, toastId));
      exitingToastIdsRef.current.delete(toastId);
    }, toastExitDurationMs);
  }

  function clearToastStack() {
    toastTimeoutIdsRef.current.forEach((timeoutId) =>
      window.clearTimeout(timeoutId),
    );
    toastTimeoutIdsRef.current.clear();
    toastAutoDismissTimeoutIdsRef.current.clear();
    exitingToastIdsRef.current.clear();
    setToasts([]);
  }

  async function handleSelectAccount(option: DevAccessOption) {
    setSessionRequest({
      status: "loading",
      position: option.position,
    });

    const result = await selectDevAccessSession(option, {
      localDevFallback: isLocalTestFallbackEnabled,
    });
    handleSessionResult(result, "login");
  }

  async function handlePasswordLogin(credentials: {
    login: string;
    password: string;
  }) {
    setSessionRequest({
      status: "loading",
    });

    const result = await loginWithPassword(credentials);
    handleSessionResult(result, "login");
  }

  async function handleClearSession() {
    loginNotificationRequestIdRef.current += 1;
    setIsWelcomePending(false);
    setDispatcherIncidentLoginPrompt("idle");
    setRequestedDispatcherFormId(undefined);
    clearToastStack();
    setSessionRequest({
      status: "loading",
    });

    const result = isProductionApp
      ? await logoutAuthSession()
      : await clearDevAccessSession({
          localDevFallback: isLocalTestFallbackEnabled,
        });
    handleSessionResult(result, "logout");
  }

  async function handleAutomaticDispatcherLogout() {
    loginNotificationRequestIdRef.current += 1;
    setIsWelcomePending(false);
    setDispatcherIncidentLoginPrompt("idle");
    setRequestedDispatcherFormId(undefined);
    setIsNavigationOpen(false);
    clearToastStack();
    setSessionRequest({
      status: "loading",
    });

    if (isProductionApp) {
      await logoutAuthSession();
    } else {
      await clearDevAccessSession({
        localDevFallback: isLocalTestFallbackEnabled,
      });
    }

    setSessionRequest(initialSessionRequestState);
    setRequestVersion((version) => version + 1);
  }

  function handleSessionResult(
    result: DevAccessSessionResult | AuthSessionResult,
    action: "login" | "logout",
  ) {
    if (result.status === "ready") {
      setIsWelcomePending(action === "login");
      setDispatcherIncidentLoginPrompt(
        action === "login" ? "pending" : "idle",
      );
      setRequestedDispatcherFormId(undefined);
      setIsNavigationOpen(action === "login" && !isMobileNavigation);
      setSessionRequest(initialSessionRequestState);
      setRequestVersion((version) => version + 1);
      return;
    }

    setSessionRequest({
      status: "error",
      message: readShortUserMessage(
        result.message,
        "Не удалось войти. Попробуйте ещё раз.",
      ),
    });
  }

  function handleRetryProfile() {
    setRequestVersion((version) => version + 1);
  }

  function handleDispatcherFeedFiltersChange(
    patch: Partial<DispatcherFeedFilterState>,
  ) {
    setDispatcherFeedFilters((current) => ({
      ...current,
      ...patch,
    }));
  }

  function handleAdminViewedDispatcherFeedFiltersChange(
    patch: Partial<DispatcherFeedFilterState>,
  ) {
    setAdminViewedDispatcherFeedFilters((current) => ({
      ...current,
      ...patch,
    }));
  }

  function handleOwnerTabNavigation(tab: BusinessTab) {
    setWorkspaceKind("business");
    setOwnerTab(tab);
    if (tab === "dispatcher") {
      setDispatcherFeedFilters(initialDispatcherFeedFilters);
    }
    if (tab === "dispatcher_form") {
      setDataEntryStatus("");
    }
    setWorkspaceNavigationVersion((version) => version + 1);
  }

  function handleAdminViewedOwnerTabNavigation(tab: BusinessTab) {
    setWorkspaceKind("business");
    setAdminViewedOwnerTab(tab);
    if (tab === "dispatcher") {
      setAdminViewedDispatcherFeedFilters(initialDispatcherFeedFilters);
    }
    if (tab === "dispatcher_form") {
      setAdminViewedDataEntryStatus("");
    }
    setWorkspaceNavigationVersion((version) => version + 1);
  }

  function handleAdminTabNavigation(tab: AdminTab) {
    setWorkspaceKind("admin");
    setAdminTab(tab);
    setWorkspaceNavigationVersion((version) => version + 1);
  }

  function handleOpenIncidentClosingFromLoginPrompt() {
    setDispatcherIncidentLoginPrompt("idle");
    setRequestedDispatcherFormId("incident_close");
    handleOwnerTabNavigation("dispatcher_form");
  }

  function handleRefractoryReportResolved(reportId: string) {
    knownPendingRefractoryIdsRef.current.delete(reportId);
    setPendingRefractoryReports((current) =>
      current.filter((report) => report.id !== reportId),
    );
  }

  function handleStartAdminAccountView(account: AdminAccountSummary) {
    setWorkspaceKind("business");
    setAdminViewedAccount(account);
    setAdminViewedOwnerTab("overview");
    setAdminViewedDataEntryStatus("");
    setIsAdminViewedDataEntrySubmitting(false);
    setAdminViewedDispatcherFeedFilters(initialDispatcherFeedFilters);
  }

  function handleStopAdminAccountView() {
    setWorkspaceKind("admin");
    setAdminViewedAccount(undefined);
    setAdminViewedDataEntryStatus("");
    setIsAdminViewedDataEntrySubmitting(false);
  }

  async function handleDataEntrySubmit(
    event: FormEvent<HTMLFormElement>,
    actingProfile?: ServerUserProfile,
    controls: DataEntrySubmitStateControls = {
      setStatus: setDataEntryStatus,
      setIsSubmitting: setIsDataEntrySubmitting,
    },
    callbacks: DataEntrySubmitCallbacks = {},
  ) {
    event.preventDefault();

    const submitProfile =
      actingProfile ??
      (accessProfile.status === "ready" ? accessProfile.profile : undefined);

    if (submitProfile === undefined) {
      controls.setStatus("Войдите в аккаунт и повторите.");
      return;
    }

    if (
      !canSubmitDispatcherForms(submitProfile)
    ) {
      controls.setStatus("Нет права отправки.");
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const formId = String(formData.get("formId") ?? "");
    const formDefinition =
      dispatcherForms.status === "ready"
        ? dispatcherForms.forms.find((item) => item.id === formId)
        : undefined;

    if (dispatcherForms.status !== "ready") {
      controls.setStatus("Формы ещё загружаются.");
      return;
    }

    if (formDefinition === undefined) {
      controls.setStatus("Выберите форму заново.");
      return;
    }

    const payload = readDispatcherSubmissionPayload(formData, formDefinition);

    if (formDefinition.id === "equipment") {
      const equipmentOptions = readEquipmentOptions(formDefinition);
      const equipmentReportPayloads = buildEquipmentReportPayloads({
        equipmentOptions,
        form: formDefinition,
        reportDate: payload.reportDate ?? getTodayDateValue(),
        storage: readBrowserEquipmentDraftStorage(),
      });

      if (equipmentReportPayloads.length !== equipmentOptions.length) {
        controls.setStatus(
          `Внесите данные по всем позициям оборудования: ${equipmentReportPayloads.length}/${equipmentOptions.length}.`,
        );
        return;
      }

      for (const equipmentPayload of equipmentReportPayloads) {
        const validationMessage = validateDispatcherPayloadForSubmit(
          formDefinition,
          equipmentPayload,
        );

        if (validationMessage !== undefined) {
          controls.setStatus(
            `${equipmentPayload.equipment ?? "Оборудование"}: ${validationMessage}`,
          );
          return;
        }
      }

      controls.setIsSubmitting(true);
      controls.setStatus("Сохраняем отчёт.");

      const result = await submitDispatcherEquipmentReport(
        {
          items: equipmentReportPayloads,
        },
        {
          localFallback: isLocalTestFallbackEnabled,
        },
      );

      controls.setIsSubmitting(false);

      if (result.status === "ready") {
        const successMessage = readEquipmentReportSuccessMessage(result);

        controls.setStatus(successMessage);
        setDispatcherSubmissionVersion((version) => version + 1);
        callbacks.onSuccess?.(successMessage);
        return;
      }

      controls.setStatus(
        readShortUserMessage(
          result.message,
          "Не удалось отправить отчёт. Проверьте данные и повторите.",
        ),
      );
      return;
    }

    const validationMessage = validateDispatcherPayloadForSubmit(
      formDefinition,
      payload,
    );

    if (validationMessage !== undefined) {
      controls.setStatus(validationMessage);
      return;
    }

    controls.setIsSubmitting(true);
    controls.setStatus("Отправляем данные.");

    const result = await submitDispatcherSubmission(
      {
        formId: formDefinition.id,
        payload,
      },
      {
        localFallback: isLocalTestFallbackEnabled,
      },
    );

    controls.setIsSubmitting(false);

    if (result.status === "ready") {
      const successMessage = readSubmissionSuccessMessage(result);

      controls.setStatus(successMessage);
      setDispatcherSubmissionVersion((version) => version + 1);
      resetDispatcherForm(form, formDefinition.id);
      callbacks.onSuccess?.(successMessage);

      return;
    }

    controls.setStatus(
      readShortUserMessage(
        result.message,
        "Не удалось отправить. Проверьте данные и повторите.",
      ),
    );
  }

  if (accessProfile.status !== "ready") {
    return (
      <AuthScreen
        accessProfile={accessProfile}
        sessionRequest={sessionRequest}
        onRetry={handleRetryProfile}
        onSelectAccount={handleSelectAccount}
        onLogin={handlePasswordLogin}
        mode={isProductionApp ? "production" : "test"}
      />
    );
  }

  const profile = accessProfile.profile;
  const viewedProfile =
    profile.activeAccess.navigationItems.includes("admin.account_preview") &&
    adminTab === "account_preview" &&
    adminViewedAccount !== undefined
      ? buildAdminPreviewProfile(adminViewedAccount)
      : undefined;
  const isAdminPreviewMode = viewedProfile !== undefined;
  const visibleProfile = viewedProfile ?? profile;
  const visibleWorkspaceKind = resolveAllowedWorkspaceKind(
    viewedProfile === undefined ? workspaceKind : "business",
    visibleProfile.activeAccess.navigationItems,
  ) ?? workspaceKind;
  const hasVisibleNavigationAccess =
    visibleProfile.activeAccess.navigationItems.length > 0;
  const visibleOwnerTab = viewedProfile !== undefined ? adminViewedOwnerTab : ownerTab;
  const visibleDispatcherFeedFilters =
    viewedProfile === undefined
      ? dispatcherFeedFilters
      : adminViewedDispatcherFeedFilters;
  const visibleDataEntryStatus =
    viewedProfile !== undefined
      ? adminViewedDataEntryStatus
      : dataEntryStatus;
  const isVisibleDataEntrySubmitting =
    viewedProfile !== undefined
      ? isAdminViewedDataEntrySubmitting
      : isDataEntrySubmitting;

  const handleVisibleDataEntrySubmit: DataEntrySubmitHandler = (
    event,
    actingProfile,
    controls,
    callbacks,
  ) => {
    if (viewedProfile !== undefined) {
      handleDataEntrySubmit(
        event,
        viewedProfile,
        {
          setStatus: setAdminViewedDataEntryStatus,
          setIsSubmitting: setIsAdminViewedDataEntrySubmitting,
        },
        callbacks,
      );
      return;
    }

    handleDataEntrySubmit(event, actingProfile, controls, callbacks);
  };

  return (
    <main
      className={`ops-shell ${
        isNavigationOpen
          ? "ops-shell-navigation-open"
          : "ops-shell-navigation-collapsed"
      } ${isAdminPreviewMode ? "ops-shell-admin-preview" : ""}`}
    >
      <SideRail
        profile={visibleProfile}
        signedInDisplayName={profile.displayName}
        isAdminPreviewMode={isAdminPreviewMode}
        isMobile={isMobileNavigation}
        isOpen={isNavigationOpen}
        onToggle={() => setIsNavigationOpen((current) => !current)}
        onRequestClose={() => setIsNavigationOpen(false)}
        onClearSession={
          viewedProfile === undefined ? handleClearSession : handleStopAdminAccountView
        }
        isSessionLoading={
          viewedProfile === undefined && sessionRequest.status === "loading"
        }
        sessionError={
          viewedProfile === undefined && sessionRequest.status === "error"
            ? sessionRequest.message
            : undefined
        }
        ownerTab={visibleOwnerTab}
        workspaceKind={visibleWorkspaceKind}
        onOwnerTabChange={
          viewedProfile !== undefined
            ? handleAdminViewedOwnerTabNavigation
            : handleOwnerTabNavigation
        }
        adminTab={adminTab}
        onAdminTabChange={handleAdminTabNavigation}
        pendingRefractoryCount={
          isAdminPreviewMode ? 0 : pendingRefractoryReports.length
        }
        returnedRefractoryCount={
          isAdminPreviewMode ? 0 : returnedRefractoryCount
        }
        returnedRefractoryShifts={
          isAdminPreviewMode ? [] : returnedRefractoryShifts
        }
      />

      {isMobileNavigation && isNavigationOpen ? (
        <button
          aria-label="Закрыть меню"
          className="rail-backdrop"
          type="button"
          onClick={() => setIsNavigationOpen(false)}
        />
      ) : null}

      <ToastViewport toasts={toasts} onDismiss={handleDismissToast} />

      {dispatcherIncidentLoginPrompt === "open" &&
      dispatcherFeed.status === "ready" ? (
        <DispatcherIncidentLoginPrompt
          openIncidentCount={dispatcherFeed.openIncidents.length}
          onContinue={() => setDispatcherIncidentLoginPrompt("idle")}
          onOpenIncidentClosing={handleOpenIncidentClosingFromLoginPrompt}
        />
      ) : null}

      {viewedProfile === undefined && sessionRequest.status === "loading" ? (
        <div className="app-session-loading">
          <LoadingIndicator label="Выходим из аккаунта…" variant="inline" />
        </div>
      ) : null}

      <section
        className={`workspace${
          hasVisibleNavigationAccess ? "" : " workspace-empty"
        }`}
        aria-label="Рабочая область"
      >
        <RoleWorkspace
          key={`${visibleProfile.activeAccess.accountId}:${workspaceNavigationVersion}`}
          profile={visibleProfile}
          isAdminPreviewMode={isAdminPreviewMode}
          dataEntryStatus={visibleDataEntryStatus}
          isDataEntrySubmitting={isVisibleDataEntrySubmitting}
          onDataEntrySubmit={handleVisibleDataEntrySubmit}
          ownerTab={visibleOwnerTab}
          adminTab={adminTab}
          workspaceKind={visibleWorkspaceKind}
          dispatcherFeed={dispatcherFeed}
          businessOverview={businessOverview}
          dispatcherForms={dispatcherForms}
          dispatcherSubmissionVersion={dispatcherSubmissionVersion}
          dispatcherFeedFilters={visibleDispatcherFeedFilters}
          onDispatcherFeedFiltersChange={
            viewedProfile === undefined
              ? handleDispatcherFeedFiltersChange
              : handleAdminViewedDispatcherFeedFiltersChange
          }
          onDataEntryStatusReset={
            viewedProfile !== undefined
              ? () => setAdminViewedDataEntryStatus("")
              : () => setDataEntryStatus("")
          }
          onShowToast={handleShowToast}
          onProductionSnapshotSynchronized={() => {
            void handleClearSession();
          }}
          onSelectAdminAccountView={handleStartAdminAccountView}
          pendingRefractoryReports={pendingRefractoryReports}
          refractoryQueueError={refractoryQueueError}
          refractoryDecisionVersion={refractoryDecisionVersion}
          onRefractoryReportResolved={handleRefractoryReportResolved}
          requestedDispatcherFormId={
            viewedProfile === undefined ? requestedDispatcherFormId : undefined
          }
          onRequestedDispatcherFormHandled={() =>
            setRequestedDispatcherFormId(undefined)
          }
        />
      </section>
    </main>
  );
}

function AuthScreen({
  accessProfile,
  sessionRequest,
  onRetry,
  onSelectAccount,
  onLogin,
  mode,
}: {
  accessProfile: AccessProfileLoadState;
  sessionRequest: SessionRequestState;
  onRetry: () => void;
  onSelectAccount: (option: DevAccessOption) => void;
  onLogin: (credentials: { login: string; password: string }) => void;
  mode: "test" | "production";
}) {
  const authShellRef = useRef<HTMLElement>(null);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [devAccessOptions, setDevAccessOptions] =
    useState<DevAccessOptionsLoadState>({
      status: "loading",
      message: "Загружаем тестовые аккаунты.",
    });
  useLayoutEffect(() => {
    const authShell = authShellRef.current;
    if (authShell === null) {
      return;
    }
    const authScrollContainer = authShell;

    let resetFrameId = 0;
    let restoreGuardTimerId = 0;
    let isRestoreGuardActive = false;
    const previousScrollRestoration = window.history.scrollRestoration;
    const canUseAnimationFrame =
      typeof window.requestAnimationFrame === "function" &&
      typeof window.cancelAnimationFrame === "function";
    const scheduleReset = canUseAnimationFrame
      ? window.requestAnimationFrame.bind(window)
      : (callback: FrameRequestCallback) =>
          window.setTimeout(() => callback(window.performance.now()), 0);
    const cancelScheduledReset = canUseAnimationFrame
      ? window.cancelAnimationFrame.bind(window)
      : window.clearTimeout.bind(window);

    function resetAuthScroll() {
      authScrollContainer.scrollTop = 0;
      authScrollContainer.scrollLeft = 0;
    }

    function releaseRestoreGuard() {
      isRestoreGuardActive = false;
      window.clearTimeout(restoreGuardTimerId);
    }

    function keepRestoredPageAtTop() {
      if (isRestoreGuardActive) {
        resetAuthScroll();
      }
    }

    function resetAuthScrollAfterPageRestore() {
      isRestoreGuardActive = true;
      resetAuthScroll();
      cancelScheduledReset(resetFrameId);
      resetFrameId = scheduleReset(resetAuthScroll);
      window.clearTimeout(restoreGuardTimerId);
      restoreGuardTimerId = window.setTimeout(
        releaseRestoreGuard,
        authScrollRestoreGuardDurationMs,
      );
    }

    window.history.scrollRestoration = "manual";
    resetAuthScrollAfterPageRestore();
    window.addEventListener("pageshow", resetAuthScrollAfterPageRestore);
    window.addEventListener("pagehide", resetAuthScroll);
    authScrollContainer.addEventListener("scroll", keepRestoredPageAtTop);
    authScrollContainer.addEventListener("wheel", releaseRestoreGuard, {
      passive: true,
    });
    authScrollContainer.addEventListener("touchstart", releaseRestoreGuard, {
      passive: true,
    });
    authScrollContainer.addEventListener("pointerdown", releaseRestoreGuard);
    authScrollContainer.addEventListener("keydown", releaseRestoreGuard);

    return () => {
      releaseRestoreGuard();
      cancelScheduledReset(resetFrameId);
      window.history.scrollRestoration = previousScrollRestoration;
      window.removeEventListener("pageshow", resetAuthScrollAfterPageRestore);
      window.removeEventListener("pagehide", resetAuthScroll);
      authScrollContainer.removeEventListener("scroll", keepRestoredPageAtTop);
      authScrollContainer.removeEventListener("wheel", releaseRestoreGuard);
      authScrollContainer.removeEventListener("touchstart", releaseRestoreGuard);
      authScrollContainer.removeEventListener(
        "pointerdown",
        releaseRestoreGuard,
      );
      authScrollContainer.removeEventListener("keydown", releaseRestoreGuard);
    };
  }, [accessProfile.status, devAccessOptions.status, mode]);
  useEffect(() => {
    if (mode === "production") {
      return;
    }

    const controller = new AbortController();

    requestDevAccessOptions({
      localDevFallback: isLocalTestFallbackEnabled,
      signal: controller.signal,
    }).then((result) => {
      if (!controller.signal.aborted) {
        setDevAccessOptions(result);
      }
    });

    return () => controller.abort();
  }, [mode]);
  const isBusy =
    accessProfile.status === "loading" ||
    sessionRequest.status === "loading" ||
    (mode === "test" && devAccessOptions.status === "loading");
  const statusMessage =
    sessionRequest.status === "error"
      ? readShortUserMessage(
          sessionRequest.message,
          "Не удалось войти. Попробуйте ещё раз.",
        )
      : accessProfile.status === "loading"
        ? shellCopy.authLoading
        : mode === "test" && devAccessOptions.status === "loading"
          ? devAccessOptions.message
          : mode === "test" && devAccessOptions.status === "error"
            ? readShortUserMessage(
                devAccessOptions.message,
                "Не удалось загрузить тестовые аккаунты.",
              )
        : accessProfile.status === "error"
          ? readShortUserMessage(
              accessProfile.message,
              "Не удалось загрузить профиль.",
            )
          : mode === "production"
            ? "Введите логин и пароль."
            : "Выберите должность для входа.";

  function handleLoginSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isBusy) {
      return;
    }

    onLogin({
      login,
      password,
    });
  }

  return (
    <main className="auth-shell" ref={authShellRef}>
      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="brand-mark" aria-hidden="true">
          <img alt="" src="/nmou-vector-icon.png" />
        </div>
        <div className="auth-copy">
          <p className="eyebrow"></p>
          <h1 id="auth-title">
            {mode === "production" ? "Вход в НМОУ Вектор" : shellCopy.authTitle}
          </h1>
          <p>
            {mode === "production"
              ? "Войдите в рабочий аккаунт."
              : shellCopy.authLead}
          </p>
        </div>

        {mode === "production" ? (
          <form className="auth-login-form" onSubmit={handleLoginSubmit}>
            <label>
              <span>Логин</span>
              <input
                autoComplete="username"
                disabled={isBusy}
                name="login"
                onChange={(event) => setLogin(event.target.value)}
                required
                type="text"
                value={login}
              />
            </label>
            <label>
              <span>Пароль</span>
              <input
                autoComplete="current-password"
                disabled={isBusy}
                name="password"
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </label>
            <button className="auth-login-button" disabled={isBusy} type="submit">
              {sessionRequest.status === "loading" ? (
                <LoadingIndicator
                  label="Входим…"
                  variant="button"
                />
              ) : "Войти"}
            </button>
          </form>
        ) : (
          <div className="auth-options" aria-label="Выбор должности">
            {(devAccessOptions.status === "ready"
              ? devAccessOptions.options
              : []).map((option) => {
              const copy = authOptions.find(
                (item) => item.accountType === option.accountType,
              );
              const isSelecting =
                sessionRequest.status === "loading" &&
                sessionRequest.position === option.position;

              return (
                <button
                  className={`auth-option auth-option-${option.accountType}`}
                  type="button"
                  disabled={isBusy}
                  key={option.position}
                  onClick={() => onSelectAccount(option)}
                >
                  <span>{copy?.scope ?? "test access"}</span>
                  <strong>{option.positionDisplayName}</strong>
                  <small>
                    {isSelecting ? (
                      <LoadingIndicator
                        label="Входим…"
                        variant="button"
                      />
                    ) : copy?.description}
                  </small>
                </button>
              );
            })}
          </div>
        )}

        <div className={`auth-status auth-status-${accessProfile.status}`}>
          {isBusy ? (
            <LoadingIndicator label={statusMessage} variant="inline" />
          ) : (
            <>
              <span
                className={`status-dot status-dot-${accessProfile.status}`}
                aria-hidden="true"
              />
              <p>{statusMessage}</p>
            </>
          )}
          {accessProfile.status === "error" ? (
            <button className="retry-button" type="button" onClick={onRetry}>
              Повторить
            </button>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function DispatcherIncidentLoginPrompt({
  openIncidentCount,
  onContinue,
  onOpenIncidentClosing,
}: {
  openIncidentCount: number;
  onContinue: () => void;
  onOpenIncidentClosing: () => void;
}) {
  return (
    <div
      className="admin-db-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onContinue();
        }
      }}
    >
      <section
        aria-labelledby="dispatcher-incident-login-title"
        aria-modal="true"
        className="admin-db-editor admin-db-clear-dialog dispatcher-incident-login-dialog"
        role="dialog"
      >
        <div className="admin-db-clear-copy">
          <span>Инциденты</span>
          <strong id="dispatcher-incident-login-title">
            Незакрытых инцидентов: {openIncidentCount}
          </strong>
          <p>Вы можете сразу перейти к их закрытию или продолжить работу.</p>
        </div>
        <div className="admin-db-actions dispatcher-incident-login-actions">
          <button
            autoFocus
            className="primary-button"
            type="button"
            onClick={onOpenIncidentClosing}
          >
            Перейти к закрытию инцидентов
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={onContinue}
          >
            Продолжить работу
          </button>
        </div>
      </section>
    </div>
  );
}

export function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: readonly AppToast[];
  onDismiss: (toastId: number) => void;
}) {
  const toastElementsRef = useRef(new Map<number, HTMLDivElement>());
  const previousPositionsRef = useRef(new Map<number, number>());
  const shiftAnimationsRef = useRef(new Map<number, Animation>());

  useLayoutEffect(() => {
    const nextPositions = new Map<number, number>();
    const activeToastIds = new Set(toasts.map((toast) => toast.id));
    const shouldReduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    toasts.forEach((toast) => {
      const element = toastElementsRef.current.get(toast.id);

      if (element !== undefined) {
        nextPositions.set(toast.id, element.getBoundingClientRect().top);
      }
    });

    shiftAnimationsRef.current.forEach((animation, toastId) => {
      if (!activeToastIds.has(toastId) || shouldReduceMotion) {
        animation.cancel();
        shiftAnimationsRef.current.delete(toastId);
      }
    });

    if (!shouldReduceMotion) {
      toasts.forEach((toast) => {
        const element = toastElementsRef.current.get(toast.id);
        const previousTop = previousPositionsRef.current.get(toast.id);
        const nextTop = nextPositions.get(toast.id);

        if (
          element === undefined ||
          previousTop === undefined ||
          nextTop === undefined ||
          previousTop === nextTop
        ) {
          return;
        }

        shiftAnimationsRef.current.get(toast.id)?.cancel();

        const animation = element.animate(
          [
            { translate: `0 ${previousTop - nextTop}px` },
            { translate: "0 0" },
          ],
          {
            duration: toastShiftDurationMs,
            easing: "ease-out",
          },
        );

        shiftAnimationsRef.current.set(toast.id, animation);
        animation.onfinish = () => {
          if (shiftAnimationsRef.current.get(toast.id) === animation) {
            shiftAnimationsRef.current.delete(toast.id);
          }
        };
      });
    }

    previousPositionsRef.current = nextPositions;
  }, [toasts]);

  useEffect(() => {
    const shiftAnimations = shiftAnimationsRef.current;

    return () => {
      shiftAnimations.forEach((animation) => animation.cancel());
      shiftAnimations.clear();
    };
  }, []);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div
      aria-atomic="false"
      aria-live="polite"
      aria-relevant="additions text"
      className="toast-viewport"
      role="status"
    >
      {toasts.map((toast) => (
        <div
          className={`app-toast app-toast-${toast.tone} app-toast-${toast.state}`}
          key={toast.id}
          ref={(element) => {
            if (element === null) {
              toastElementsRef.current.delete(toast.id);
              return;
            }

            toastElementsRef.current.set(toast.id, element);
          }}
        >
          <strong>{toast.title}</strong>
          <span>{toast.message}</span>
          <button
            aria-label={`Закрыть уведомление «${toast.title}»`}
            className="app-toast-close"
            disabled={toast.state === "exiting"}
            type="button"
            onClick={() => onDismiss(toast.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

export function SideRail({
  profile,
  signedInDisplayName,
  isAdminPreviewMode,
  isMobile,
  isOpen,
  onToggle,
  onRequestClose,
  onClearSession,
  isSessionLoading,
  sessionError,
  ownerTab,
  workspaceKind,
  onOwnerTabChange,
  adminTab,
  onAdminTabChange,
  pendingRefractoryCount,
  returnedRefractoryCount,
  returnedRefractoryShifts,
}: {
  profile: ServerUserProfile;
  signedInDisplayName: string;
  isAdminPreviewMode: boolean;
  isMobile: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onRequestClose: () => void;
  onClearSession: () => void;
  isSessionLoading: boolean;
  sessionError?: string;
  ownerTab: BusinessTab;
  workspaceKind: WorkspaceKind;
  onOwnerTabChange: (tab: BusinessTab) => void;
  adminTab: AdminTab;
  onAdminTabChange: (tab: AdminTab) => void;
  pendingRefractoryCount: number;
  returnedRefractoryCount: number;
  returnedRefractoryShifts: readonly ReturnedRefractoryShift[];
}) {
  const railRef = useRef<HTMLElement>(null);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerMenuButtonRef = useRef<HTMLButtonElement>(null);
  const navigationItems = buildNavigationItems(
    profile,
    ownerTab,
    adminTab,
    workspaceKind,
  );

  useEffect(() => {
    if (!isMobile || !isOpen) {
      return;
    }

    const rail = railRef.current;
    const previouslyFocusedElement =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : undefined;
    const focusFrame = window.requestAnimationFrame(() => {
      drawerMenuButtonRef.current?.focus();
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onRequestClose();
        return;
      }

      if (event.key !== "Tab" || rail === null) {
        return;
      }

      const focusableElements = Array.from(
        rail.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null);
      const firstElement = focusableElements[0];
      const lastElement = focusableElements.at(-1);

      if (firstElement === undefined || lastElement === undefined) {
        return;
      }

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);

      if (previouslyFocusedElement?.isConnected) {
        window.requestAnimationFrame(() => previouslyFocusedElement.focus());
      } else {
        window.requestAnimationFrame(() => mobileMenuButtonRef.current?.focus());
      }
    };
  }, [isMobile, isOpen]);

  return (
    <>
      <header className="mobile-navigation-bar">
        <div className="brand-mark" aria-hidden="true">
          <img alt="" src="/nmou-vector-icon.png" />
        </div>
        <button
          aria-controls="primary-navigation"
          aria-expanded={isOpen}
          aria-label={isOpen ? "Закрыть меню" : "Открыть меню"}
          className="rail-menu-toggle"
          ref={mobileMenuButtonRef}
          type="button"
          onClick={onToggle}
        >
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <span aria-hidden="true" />
        </button>
      </header>

      <aside
        aria-hidden={isMobile && !isOpen ? true : undefined}
        aria-label="Основная навигация"
        aria-modal={isMobile && isOpen ? true : undefined}
        className={`side-rail side-rail-${isOpen ? "open" : "collapsed"}`}
        ref={railRef}
        role={isMobile && isOpen ? "dialog" : undefined}
      >
        <div className="rail-brand-row">
          <span className="brand-mark" aria-hidden="true">
            <img alt="" src="/nmou-vector-icon.png" />
          </span>
          {isAdminPreviewMode ? (
            <div className="admin-preview-mode-badge" role="status">
              АДМИН ПРЕВЬЮ МОД
            </div>
          ) : null}
          {isMobile ? (
            <button
              aria-controls="primary-navigation"
              aria-expanded={isOpen}
              aria-label="Закрыть меню"
              className="rail-menu-toggle"
              ref={drawerMenuButtonRef}
              type="button"
              onClick={onToggle}
            >
              <span aria-hidden="true" />
              <span aria-hidden="true" />
              <span aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <div className="rail-product-copy">
          <p className="eyebrow">платформа</p>
          <h1>{shellCopy.productName}</h1>
          <p className="rail-user-name">
            {formatUserShortName(signedInDisplayName)}
          </p>
        </div>
        <nav className="primary-nav" id="primary-navigation">
          {navigationItems.map((item) => {
            const ownerTarget = getBusinessTabForNavigationItem(item);
            const adminTarget = getAdminTabForNavigationItem(item);
            const notificationCount =
              item.id === "business.dispatcher_form"
                ? pendingRefractoryCount
                : item.id === "business.refractory_shop"
                  ? returnedRefractoryCount
                  : 0;

            return (
              <button
                className={`nav-item nav-item-${item.state}`}
                type="button"
                aria-current={item.state === "active" ? "page" : undefined}
                disabled={ownerTarget === undefined && adminTarget === undefined}
                key={item.id}
                onClick={() => {
                  if (ownerTarget !== undefined) {
                    onOwnerTabChange(ownerTarget);
                  }
                  if (adminTarget !== undefined) {
                    onAdminTabChange(adminTarget);
                  }
                  if (isMobile) {
                    onRequestClose();
                  }
                }}
              >
                <span>
                  {item.label}
                  {notificationCount > 0 ? (
                    <b className="nav-notification-count">
                      {notificationCount}
                    </b>
                  ) : null}
                </span>
                <small>{item.description}</small>
                {item.id === "business.refractory_shop"
                  ? returnedRefractoryShifts.map((shift) => (
                      <small
                        className="nav-notification-detail"
                        key={`${shift.reportDate}:${shift.shiftNumber}`}
                      >
                        Исправить за {formatDateOnly(shift.reportDate)} · смена{" "}
                        {shift.shiftNumber}
                      </small>
                    ))
                  : null}
              </button>
            );
          })}
        </nav>
        <div className="rail-note">
          <span>доступ</span>
          <strong>{profile.activeAccess.positionDisplayName}</strong>
          <button
            className="rail-logout-button"
            type="button"
            disabled={isSessionLoading}
            onClick={() => {
              onClearSession();
              if (isMobile && isAdminPreviewMode) {
                onRequestClose();
              }
            }}
          >
            {isAdminPreviewMode
              ? "Выйти из превью мода"
              : isSessionLoading
                ? (
                    <LoadingIndicator
                      announce={false}
                      label="Выходим…"
                      variant="button"
                    />
                  )
                : "Выйти из аккаунта"}
          </button>
          {sessionError === undefined ? null : (
            <small className="rail-session-error">{sessionError}</small>
          )}
        </div>
      </aside>
    </>
  );
}

function RoleWorkspace({
  profile,
  isAdminPreviewMode,
  dataEntryStatus,
  isDataEntrySubmitting,
  onDataEntrySubmit,
  ownerTab,
  adminTab,
  workspaceKind,
  dispatcherFeed,
  businessOverview,
  dispatcherForms,
  dispatcherSubmissionVersion,
  dispatcherFeedFilters,
  onDispatcherFeedFiltersChange,
  onDataEntryStatusReset,
  onShowToast,
  onProductionSnapshotSynchronized,
  onSelectAdminAccountView,
  pendingRefractoryReports,
  refractoryQueueError,
  refractoryDecisionVersion,
  onRefractoryReportResolved,
  requestedDispatcherFormId,
  onRequestedDispatcherFormHandled,
}: {
  profile: ServerUserProfile;
  isAdminPreviewMode: boolean;
  dataEntryStatus: string;
  isDataEntrySubmitting: boolean;
  onDataEntrySubmit: DataEntrySubmitHandler;
  ownerTab: BusinessTab;
  adminTab: AdminTab;
  workspaceKind: WorkspaceKind;
  dispatcherFeed: DispatcherFeedLoadState;
  businessOverview: BusinessOverviewLoadState;
  dispatcherForms: DispatcherFormsLoadState;
  dispatcherSubmissionVersion: number;
  dispatcherFeedFilters: DispatcherFeedFilterState;
  onDispatcherFeedFiltersChange: (
    patch: Partial<DispatcherFeedFilterState>,
  ) => void;
  onDataEntryStatusReset: () => void;
  onShowToast: ShowToast;
  onProductionSnapshotSynchronized: () => void;
  onSelectAdminAccountView: (account: AdminAccountSummary) => void;
  pendingRefractoryReports: RefractoryReportRevision[];
  refractoryQueueError: string;
  refractoryDecisionVersion: number;
  onRefractoryReportResolved: (reportId: string) => void;
  requestedDispatcherFormId?: DispatcherFormId;
  onRequestedDispatcherFormHandled: () => void;
}) {
  const effectiveOwnerTab = resolveAllowedNavigationTab(
    ownerTab,
    navigationByBusinessTab,
    profile.activeAccess.navigationItems,
  );
  const effectiveAdminTab = resolveAllowedNavigationTab(
    adminTab,
    navigationByAdminTab,
    profile.activeAccess.navigationItems,
  );
  const effectiveWorkspaceKind = resolveAllowedWorkspaceKind(
    workspaceKind,
    profile.activeAccess.navigationItems,
  );

  if (effectiveWorkspaceKind === "admin" && effectiveAdminTab !== undefined) {
    return (
      <AdminWorkspace
        profile={profile}
        activeTab={effectiveAdminTab}
        onShowToast={onShowToast}
        onProductionSnapshotSynchronized={
          onProductionSnapshotSynchronized
        }
        onSelectAccountView={onSelectAdminAccountView}
      />
    );
  }

  if (effectiveOwnerTab === undefined) return null;
  if (effectiveOwnerTab === "work") return <WorkerWorkspace />;
  if (effectiveOwnerTab === "production_plan") {
    return (
      <ProductionPlanWorkspace
        isAdminPreviewMode={isAdminPreviewMode}
        onShowToast={onShowToast}
      />
    );
  }
  if (effectiveOwnerTab === "refractory_shop") {
    return (
      <RefractoryShopWorkspace
        profile={profile}
        isAdminPreviewMode={isAdminPreviewMode}
        onShowToast={onShowToast}
        decisionRefreshVersion={refractoryDecisionVersion}
      />
    );
  }
  if (effectiveOwnerTab === "laboratory_results") {
    return (
      <LaboratoryResultsWorkspace
        profile={profile}
        isAdminPreviewMode={isAdminPreviewMode}
        onShowToast={onShowToast}
      />
    );
  }
  if (effectiveOwnerTab === "laboratory_review") {
    return (
      <LaboratoryReviewWorkspace
        isAdminPreviewMode={isAdminPreviewMode}
        onShowToast={onShowToast}
      />
    );
  }
  if (effectiveOwnerTab === "board_assignments") {
    return (
      <BoardAssignmentsWorkspace
        isAdminPreviewMode={isAdminPreviewMode}
        onShowToast={onShowToast}
      />
    );
  }
  if (effectiveOwnerTab === "settings") {
    return (
      <NotificationSettingsWorkspace
        isAdminPreviewMode={isAdminPreviewMode}
        onShowToast={onShowToast}
      />
    );
  }
  if (effectiveOwnerTab === "user_actions") {
    return isAdminPreviewMode
      ? <UserActionsPreviewNotice />
      : <UserActionsWorkspace profile={profile} />;
  }
  if (effectiveOwnerTab === "dispatcher_form") {
    return (
      <DataEntryWorkspace
        ariaLabel="Диспетчерская отправка"
        status={dataEntryStatus}
        isSubmitting={isDataEntrySubmitting}
        onSubmit={onDataEntrySubmit}
        dispatcherForms={dispatcherForms}
        dispatcherFeed={dispatcherFeed}
        dispatcherFeedFilters={dispatcherFeedFilters}
        onDispatcherFeedFiltersChange={onDispatcherFeedFiltersChange}
        currentUserDisplayName={profile.displayName}
        isAdminPreviewMode={isAdminPreviewMode}
        refreshVersion={dispatcherSubmissionVersion}
        onResetStatus={onDataEntryStatusReset}
        onShowToast={onShowToast}
        pendingRefractoryReports={
          isAdminPreviewMode ? [] : pendingRefractoryReports
        }
        refractoryQueueError={
          isAdminPreviewMode ? "" : refractoryQueueError
        }
        onRefractoryReportResolved={onRefractoryReportResolved}
        requestedFormId={requestedDispatcherFormId}
        onRequestedFormHandled={onRequestedDispatcherFormHandled}
      />
    );
  }
  return (
    <OwnerWorkspace
      activeTab={effectiveOwnerTab}
      dispatcherFeed={dispatcherFeed}
      businessOverview={businessOverview}
      dispatcherForms={dispatcherForms}
      dispatcherFeedFilters={dispatcherFeedFilters}
      onDispatcherFeedFiltersChange={onDispatcherFeedFiltersChange}
    />
  );
}

function OwnerWorkspace({
  activeTab,
  dispatcherFeed,
  businessOverview,
  dispatcherForms,
  dispatcherFeedFilters,
  onDispatcherFeedFiltersChange,
}: {
  activeTab: Extract<BusinessTab, "overview" | "dispatcher">;
  dispatcherFeed: DispatcherFeedLoadState;
  businessOverview: BusinessOverviewLoadState;
  dispatcherForms: DispatcherFormsLoadState;
  dispatcherFeedFilters: DispatcherFeedFilterState;
  onDispatcherFeedFiltersChange: (
    patch: Partial<DispatcherFeedFilterState>,
  ) => void;
}) {
  if (activeTab === "overview") {
    const dispatcherOverview = buildOwnerDispatcherOverview(
      dispatcherFeed.status === "ready" ? dispatcherFeed.submissions : [],
      dispatcherFeed.status === "ready"
        ? dispatcherFeed.productionMonthOverview ?? undefined
        : undefined,
    );

    return (
      <OwnerOverviewPanel
        businessOverview={businessOverview}
        dispatcherFeed={dispatcherFeed}
        dispatcherOverview={dispatcherOverview}
      />
    );
  }

  return (
    <DispatcherFeedPanel
      dispatcherFeed={dispatcherFeed}
      dispatcherForms={dispatcherForms}
      filters={dispatcherFeedFilters}
      onFiltersChange={onDispatcherFeedFiltersChange}
    />
  );
}

export function OwnerOverviewPanel({
  businessOverview,
  dispatcherFeed,
  dispatcherOverview,
}: {
  businessOverview: BusinessOverviewLoadState;
  dispatcherFeed: DispatcherFeedLoadState;
  dispatcherOverview: OwnerDispatcherOverview;
}) {
  const isLocalTestMode =
    dispatcherFeed.status === "ready" && dispatcherFeed.source === "local_test";

  return (
    <section className="owner-overview" aria-label="Обзор">
      <div className="owner-overview-header">
        <div>
          <h2>Коротко с начала месяца</h2>
          {businessOverview.status === "ready" ? (
            <p>
              С {formatDateOnly(businessOverview.overview.period.monthStart)} по{" "}
              {formatDateOnly(businessOverview.overview.period.today)}
            </p>
          ) : null}
        </div>
        {businessOverview.status === "ready" ? (
          <span>
            Обновлено: {formatDateTime(businessOverview.overview.receivedAt)}
          </span>
        ) : null}
      </div>
      {businessOverview.status === "loading" ? (
        <LoadingIndicator
          className="owner-overview-loading"
          label={businessOverview.message}
          variant="panel"
        />
      ) : null}
      {businessOverview.status === "error" ? (
        <p className="owner-overview-status owner-overview-status-error">
          {readShortUserMessage(
            businessOverview.message,
            "Не удалось загрузить инциденты и лабораторию.",
          )}
        </p>
      ) : null}
      {dispatcherFeed.status === "loading" ? (
        <LoadingIndicator
          className="owner-overview-loading"
          label={dispatcherFeed.message}
          variant="panel"
        />
      ) : null}
      {dispatcherFeed.status === "error" ? (
        <p className="owner-overview-status owner-overview-status-error">
          {readShortUserMessage(
            dispatcherFeed.message,
            "Не удалось загрузить остальные разделы обзора.",
          )}
        </p>
      ) : null}
      {isLocalTestMode ? (
        <p className="owner-overview-status owner-overview-status-local">
          Тестовый режим: диспетчерские данные только на этом устройстве.
        </p>
      ) : null}
      {(
        businessOverview.status === "ready" ||
        dispatcherFeed.status === "ready"
      ) ? (
        <div className="owner-overview-stack">
          {businessOverview.status === "ready" ? (
            <>
              <OwnerOverviewMetrics
                title="Инциденты"
                metrics={[
                  {
                    label: "Всего за месяц",
                    value: businessOverview.overview.incidents.monthTotal,
                  },
                  {
                    label: "Закрыто из них",
                    value: businessOverview.overview.incidents.monthClosed,
                  },
                  {
                    label: "Сегодня",
                    value: businessOverview.overview.incidents.todayTotal,
                  },
                  {
                    label: "Не закрыто сейчас",
                    value: businessOverview.overview.incidents.openNow,
                    tone: businessOverview.overview.incidents.openNow > 0
                      ? "attention"
                      : undefined,
                  },
                ]}
              />
              <OwnerOverviewMetrics
                title="Лаборатория"
                metrics={[
                  {
                    label: "Отобранных проб за месяц",
                    value:
                      businessOverview.overview.laboratory.sampled.monthTotal,
                  },
                  {
                    label: "Отобранных проб сегодня",
                    value:
                      businessOverview.overview.laboratory.sampled.todayTotal,
                  },
                  {
                    label: "Химанализов за месяц",
                    value: businessOverview.overview.laboratory
                      .chemicalAnalyses.monthTotal,
                  },
                  {
                    label: "Химанализов сегодня",
                    value: businessOverview.overview.laboratory
                      .chemicalAnalyses.todayTotal,
                  },
                  {
                    label: "Показаний печи 2 за месяц",
                    value: businessOverview.overview.laboratory
                      .rotaryKiln2Readings.monthTotal,
                  },
                  {
                    label: "Показаний печи 2 сегодня",
                    value: businessOverview.overview.laboratory
                      .rotaryKiln2Readings.todayTotal,
                  },
                ]}
              />
            </>
          ) : null}
          {dispatcherFeed.status === "ready" ? (
            <>
              <OwnerEquipmentOverviewBlock overview={dispatcherOverview} />
              <OwnerProductionOverviewBlock overview={dispatcherOverview} />
              <OwnerVisitorsOverviewBlock overview={dispatcherOverview} />
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function OwnerOverviewMetrics({
  title,
  headingMeta,
  metrics,
  note,
}: {
  title: string;
  headingMeta?: {
    label: string;
    value: string;
  };
  metrics: Array<{
    label: string;
    value: number | string;
    tone?: "attention";
  }>;
  note?: string;
}) {
  return (
    <section className="owner-overview-block" aria-label={title}>
      <div className="owner-overview-block-header">
        <h3>{title}</h3>
        {headingMeta === undefined ? null : (
          <p className="owner-overview-heading-meta">
            <span>{headingMeta.label}</span>
            <strong>{headingMeta.value}</strong>
          </p>
        )}
      </div>
      <dl className="owner-overview-metrics">
        {metrics.map((metric) => (
          <div
            className={
              metric.tone === undefined
                ? undefined
                : `owner-overview-metric-${metric.tone}`
            }
            key={metric.label}
          >
            <dt>{metric.label}</dt>
            <dd
              className={
                typeof metric.value === "string"
                  ? "owner-overview-metric-value-text"
                  : undefined
              }
            >
              {typeof metric.value === "number"
                ? formatNumber(metric.value)
                : metric.value}
            </dd>
          </div>
        ))}
      </dl>
      {note === undefined ? null : (
        <p className="owner-overview-note">{note}</p>
      )}
    </section>
  );
}

function OwnerEquipmentOverviewBlock({
  overview,
}: {
  overview: OwnerDispatcherOverview;
}) {
  const equipment = overview.equipment;

  return (
    <OwnerOverviewMetrics
      title="Оборудование"
      headingMeta={{
        label: "Последний отчёт",
        value:
          equipment === undefined
            ? "—"
            : formatDateOnly(equipment.reportDate ?? equipment.updatedAt),
      }}
      metrics={[
        ...(equipment?.workingCounts.map((item) => ({
          label: `Работало ${item.label.toLocaleLowerCase("ru-RU")}`,
          value: item.count,
        })) ?? []),
      ]}
      note={
        equipment === undefined
          ? "Отчётов пока нет."
          : `Обновлено: ${formatDateTime(equipment.updatedAt)}`
      }
    />
  );
}

function OwnerProductionOverviewBlock({
  overview,
}: {
  overview: OwnerDispatcherOverview;
}) {
  return (
    <OwnerOverviewMetrics
      title="Выработка"
      metrics={[
        {
          label: "Отформовано с начала месяца, т",
          value: overview.production?.forming.monthFact ?? "—",
        },
        {
          label: "Отформовано сегодня, т",
          value: overview.production?.forming.todayFact ?? "—",
        },
        {
          label: "Отсортировано с начала месяца, т",
          value: overview.production?.sorting.monthFact ?? "—",
        },
        {
          label: "Отсортировано сегодня, т",
          value: overview.production?.sorting.todayFact ?? "—",
        },
        {
          label: "Неформованной продукции с начала месяца, т",
          value: overview.production?.unformed.monthFact ?? "—",
        },
        {
          label: "Неформованной продукции сегодня, т",
          value: overview.production?.unformed.todayFact ?? "—",
        },
        {
          label: "Шамота с начала месяца, т",
          value: overview.production?.chamotte.monthFact ?? "—",
        },
        {
          label: "Шамота сегодня, т",
          value: overview.production?.chamotte.todayFact ?? "—",
        },
        {
          label: "Гранулировано с начала месяца, т",
          value: overview.production?.granulation.monthFact ?? "—",
        },
        {
          label: "Гранулировано сегодня, т",
          value: overview.production?.granulation.todayFact ?? "—",
        },
      ]}
      note={
        overview.production === undefined
          ? "Отчётов за текущий месяц пока нет."
          : undefined
      }
    />
  );
}

function OwnerVisitorsOverviewBlock({
  overview,
}: {
  overview: OwnerDispatcherOverview;
}) {
  const visitors = overview.visitors;
  const visitorHosts =
    visitors.hosts.length === 0
      ? "не указано"
      : visitors.hosts.join(", ");

  return (
    <OwnerOverviewMetrics
      title="Посетители"
      headingMeta={{
        label: "Последний день посещений",
        value:
          visitors.latestDate === undefined
            ? "—"
            : formatDateOnly(visitors.latestDate),
      }}
      metrics={[
        {
          label: "Посетителей в этот день",
          value: visitors.count,
        },
        {
          label: "Не вышли сейчас",
          value: visitors.openCount,
          tone: visitors.openCount > 0 ? "attention" : undefined,
        },
      ]}
      note={
        visitors.latestDate === undefined
          ? "Посещений пока нет."
          : `К кому приходили: ${visitorHosts}`
      }
    />
  );
}

function WorkerWorkspace() {
  return <section className="owner-empty-view" aria-label="Рабочие данные" />;
}

type ProductionPlanLoadState =
  | { status: "loading"; message: string }
  | { status: "ready"; plan?: ProductionPlanRevision }
  | { status: "error"; message: string };

const productionCategoryLabels: Record<ProductionCategory, string> = {
  forming: "Формовка",
  sorting: "Сортировка",
  unformed: "Неформованная продукция, контейнеры",
  chamotte: "Цех обжига шамота",
};

const productionPlanMonthLabels = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
] as const;
const productionPlanYearOptions = Array.from(
  { length: 101 },
  (_, index) => 2000 + index,
);
const productionPlanDecimalInputPattern = "[0-9]+([.][0-9]{0,2})?";
const productionPlanDecimalInputTitle =
  "Введите положительное число максимум с двумя знаками после запятой.";

function createEmptyProductionPlanInputs(): Record<ProductionCategory, string> {
  return {
    forming: "",
    sorting: "",
    unformed: "",
    chamotte: "",
  };
}

function createEmptyProductionPlanDateSelections(): Record<
  ProductionCategory,
  string[]
> {
  return {
    forming: [],
    sorting: [],
    unformed: [],
    chamotte: [],
  };
}

export function ProductionPlanWorkspace({
  isAdminPreviewMode,
  onShowToast,
}: {
  isAdminPreviewMode: boolean;
  onShowToast: ShowToast;
}) {
  const [month, setMonth] = useState(readCurrentMonthInputValue);
  const [monthlyPlanInputs, setMonthlyPlanInputs] = useState(
    createEmptyProductionPlanInputs,
  );
  const [loadState, setLoadState] = useState<ProductionPlanLoadState>({
    status: "loading",
    message: "Загружаем план.",
  });
  const [datePresets, setDatePresets] =
    useState<ProductionPlanPreviewResponse>();
  const [selectedWorkingDates, setSelectedWorkingDates] = useState(
    createEmptyProductionPlanDateSelections,
  );
  const [activeCategoryIndex, setActiveCategoryIndex] = useState(0);
  const [status, setStatus] = useState("");
  const [isLoadingPresets, setIsLoadingPresets] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setDatePresets(undefined);
    setSelectedWorkingDates(createEmptyProductionPlanDateSelections());
    setActiveCategoryIndex(0);
    setStatus("");
    setMonthlyPlanInputs(createEmptyProductionPlanInputs());

    if (isAdminPreviewMode) {
      const dates = buildProductionPlanMonthDates(month);
      const allDates = dates.map((item) => item.date);
      const weekdayDates = dates
        .filter((item) => !item.isWeekend)
        .map((item) => item.date);

      setDatePresets({ month, allDates, weekdayDates });
      setSelectedWorkingDates(
        Object.fromEntries(
          productionCategories.map((category) => [category, weekdayDates]),
        ) as Record<ProductionCategory, string[]>,
      );
      setLoadState({
        status: "ready",
      });
      return;
    }

    const controller = new AbortController();

    setLoadState({ status: "loading", message: "Загружаем план." });
    setIsLoadingPresets(true);
    Promise.all([
      requestProductionPlan(month, { signal: controller.signal }),
      requestProductionPlanPreview({ month }, { signal: controller.signal }),
    ]).then(([planResult, presetsResult]) => {
      if (controller.signal.aborted) {
        return;
      }

      setIsLoadingPresets(false);

      if (presetsResult.status === "error") {
        setStatus(
          readShortUserMessage(
            presetsResult.message,
            "Не удалось загрузить календарь.",
          ),
        );
      } else {
        setDatePresets({
          month: presetsResult.month,
          allDates: presetsResult.allDates,
          weekdayDates: presetsResult.weekdayDates,
        });
      setSelectedWorkingDates(
        Object.fromEntries(
          productionCategories.map((category) => [
            category,
              planResult.status === "ready" &&
                planResult.plan?.schedules[category] !== undefined
                ? planResult.plan.schedules[category]!.dailyPlans.map(
                    (item) => item.date,
                  )
                : presetsResult.weekdayDates,
            ]),
          ) as Record<ProductionCategory, string[]>,
        );
      }

      if (planResult.status === "ready") {
        setLoadState({ status: "ready", plan: planResult.plan });
        setMonthlyPlanInputs(
          planResult.plan === undefined
            ? createEmptyProductionPlanInputs()
            : Object.fromEntries(
                productionCategories.map((category) => [
                  category,
                  planResult.plan!.schedules[category] === undefined
                    ? ""
                    : String(planResult.plan!.schedules[category]!.monthlyPlan),
                ]),
              ) as Record<ProductionCategory, string>,
        );
        return;
      }

      setLoadState({
        status: "error",
        message: readShortUserMessage(
          planResult.message,
          "Не удалось загрузить план.",
        ),
      });
    });

    return () => controller.abort();
  }, [isAdminPreviewMode, month]);

  function handleMonthPartChange(
    part: "month" | "year",
    event: ChangeEvent<HTMLSelectElement>,
  ) {
    const nextValue = Number(event.currentTarget.value);
    const current = readProductionPlanMonthParts(month);
    const nextMonth = part === "month"
      ? formatProductionPlanMonthValue(current.year, nextValue)
      : formatProductionPlanMonthValue(nextValue, current.month);

    setMonth(nextMonth);
  }

  function handleMonthShift(offset: -1 | 1) {
    setMonth((current) => shiftProductionPlanMonth(current, offset));
  }

  function handleMonthlyPlanChange(
    category: ProductionCategory,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const nextValue = normalizeProductionPlanInput(event.currentTarget.value);

    setMonthlyPlanInputs((current) => ({
      ...current,
      [category]: nextValue,
    }));
    setStatus("");
  }

  async function handleSaveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const category = productionCategories[activeCategoryIndex];
    const monthlyPlan = readPositiveDecimalInput(monthlyPlanInputs[category]);

    if (monthlyPlan === undefined) {
      setStatus(
        `Введите месячный план больше нуля, максимум с двумя знаками после запятой для категории «${productionCategoryLabels[category]}».`,
      );
      return;
    }

    if (selectedWorkingDates[category].length === 0) {
      setStatus(
        `Выберите хотя бы один день для категории «${productionCategoryLabels[category]}».`,
      );
      return;
    }

    setIsSaving(true);
    setStatus("Сохраняем план.");
    const result = await saveProductionPlan({
      month,
      category,
      schedule: {
        monthlyPlan,
        workingDates: selectedWorkingDates[category],
      },
    });
    setIsSaving(false);

    if (result.status === "error") {
      setStatus(readShortUserMessage(result.message, "Не удалось сохранить план."));
      return;
    }

    setLoadState({ status: "ready", plan: result.plan });
    setStatus("");
    onShowToast(
      "План сохранён",
      `${productionCategoryLabels[category]} · ${formatProductionPlanMonth(month)}`,
      "success",
    );
  }

  function handleWorkingDateChange(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const date = event.currentTarget.value;
    const isChecked = event.currentTarget.checked;
    const category = productionCategories[activeCategoryIndex];

    setSelectedWorkingDates((current) => ({
      ...current,
      [category]: isChecked
        ? Array.from(new Set([...current[category], date])).sort()
        : current[category].filter((item) => item !== date),
    }));
    setStatus("");
  }

  function handleApplyPreset(preset: "all" | "weekdays") {
    if (datePresets === undefined) {
      return;
    }

    const category = productionCategories[activeCategoryIndex];
    const dates = preset === "all"
      ? datePresets.allDates
      : datePresets.weekdayDates;

    setSelectedWorkingDates((current) => ({
      ...current,
      [category]: dates,
    }));
    setStatus("");
  }

  const activeCategory = productionCategories[activeCategoryIndex];
  const monthParts = readProductionPlanMonthParts(month);
  const monthDates = datePresets?.month === month
    ? buildProductionPlanMonthDates(month)
    : [];
  const activeWorkingDates = selectedWorkingDates[activeCategory];
  const selectedWorkingDateSet = new Set(activeWorkingDates);
  const isAllDatesPreset = datePresets !== undefined &&
    areSameProductionPlanDates(activeWorkingDates, datePresets.allDates);
  const isWeekdaysPreset = datePresets !== undefined &&
    areSameProductionPlanDates(activeWorkingDates, datePresets.weekdayDates);

  return (
    <section className="production-plan-workspace" aria-label="План выработки">
      <header className="production-plan-header">
        <div>
          <span>Работа экономиста</span>
          <h2>План выработки</h2>
        </div>
        <p>
          Выберите месяц и любую категорию. У каждой категории свой план и
          собственное расписание.
        </p>
      </header>

      {isAdminPreviewMode ? (
        <p className="production-plan-notice">
          В режиме просмотра расчёт и сохранение отключены.
        </p>
      ) : null}

      <ol className="production-plan-steps" aria-label="Категории плана">
        {productionCategories.map((category, index) => {
          const isSaved = loadState.status === "ready" &&
            loadState.plan?.schedules[category] !== undefined;

          return (
            <li
              className={`${index === activeCategoryIndex ? "is-active" : ""} ${
                isSaved ? "is-complete" : ""
              }`}
              key={category}
            >
              <button
                aria-pressed={index === activeCategoryIndex}
                disabled={isSaving}
                type="button"
                onClick={() => {
                  setActiveCategoryIndex(index);
                  setStatus("");
                }}
              >
                <span>{index + 1}</span>
                <strong>{productionCategoryLabels[category]}</strong>
              </button>
            </li>
          );
        })}
      </ol>

      <form className="production-plan-form" onSubmit={handleSaveCategory}>
        <div className="production-plan-month-field">
          <span>Месяц</span>
          <div className="production-plan-month-picker">
            <button
              aria-label="Предыдущий месяц"
              disabled={
                isAdminPreviewMode ||
                isSaving ||
                (monthParts.year === 2000 && monthParts.month === 1)
              }
              type="button"
              onClick={() => handleMonthShift(-1)}
            >
              ←
            </button>
            <select
              aria-label="Месяц плана"
              disabled={isAdminPreviewMode || isSaving}
              value={monthParts.month}
              onChange={(event) => handleMonthPartChange("month", event)}
            >
              {productionPlanMonthLabels.map((label, index) => (
                <option key={label} value={index + 1}>{label}</option>
              ))}
            </select>
            <select
              aria-label="Год плана"
              disabled={isAdminPreviewMode || isSaving}
              value={monthParts.year}
              onChange={(event) => handleMonthPartChange("year", event)}
            >
              {productionPlanYearOptions.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
            <button
              aria-label="Следующий месяц"
              disabled={
                isAdminPreviewMode ||
                isSaving ||
                (monthParts.year === 2100 && monthParts.month === 12)
              }
              type="button"
              onClick={() => handleMonthShift(1)}
            >
              →
            </button>
          </div>
        </div>
        <label>
          <span>Месячный план · {productionCategoryLabels[activeCategory]}</span>
          <input
            disabled={isAdminPreviewMode || isLoadingPresets || isSaving}
            inputMode="decimal"
            pattern={productionPlanDecimalInputPattern}
            required
            title={productionPlanDecimalInputTitle}
            type="text"
            value={monthlyPlanInputs[activeCategory]}
            onChange={(event) => handleMonthlyPlanChange(activeCategory, event)}
          />
        </label>

        {datePresets !== undefined ? (
          <section
            className="production-plan-confirmation"
            aria-label={`Расписание — ${productionCategoryLabels[activeCategory]}`}
          >
            <div className="production-plan-confirmation-head">
              <div>
                <span>Расписание категории</span>
                <strong>{activeWorkingDates.length} дней</strong>
              </div>
              <p>
                Выберите готовое расписание, затем при необходимости добавьте
                или снимите отдельные дни.
              </p>
            </div>
            <div
              className="production-plan-presets"
              aria-label="Пресеты расписания"
            >
              <button
                aria-pressed={isAllDatesPreset}
                className={isAllDatesPreset ? "is-active" : undefined}
                disabled={isAdminPreviewMode || isSaving}
                type="button"
                onClick={() => handleApplyPreset("all")}
              >
                Все дни
              </button>
              <button
                aria-pressed={isWeekdaysPreset}
                className={isWeekdaysPreset ? "is-active" : undefined}
                disabled={isAdminPreviewMode || isSaving}
                type="button"
                onClick={() => handleApplyPreset("weekdays")}
              >
                Только рабочие
              </button>
            </div>
            <div
              className="production-plan-calendar"
              role="group"
              aria-label="Дни месяца"
            >
              {monthDates.map((item) => {
                const isChecked = selectedWorkingDateSet.has(item.date);

                return (
                  <label
                    className={`production-plan-day ${
                      isChecked ? "is-working" : ""
                    } ${item.isWeekend ? "is-weekend" : ""}`}
                    key={item.date}
                    style={
                      item.dayNumber === 1
                        ? { gridColumnStart: item.calendarColumn }
                        : undefined
                    }
                  >
                    <input
                      checked={isChecked}
                      disabled={isAdminPreviewMode || isSaving}
                      type="checkbox"
                      value={item.date}
                      onChange={handleWorkingDateChange}
                    />
                    <span>{item.weekdayLabel}</span>
                    <strong>{item.dayNumber}</strong>
                  </label>
                );
              })}
            </div>
          </section>
        ) : (
          isLoadingPresets ? (
            <LoadingIndicator
              className="production-plan-load-state"
              label="Загружаем календарь."
              variant="panel"
            />
          ) : (
            <p className="production-plan-load-state">Календарь недоступен.</p>
          )
        )}

        <div className="production-plan-actions">
          <button
            className="production-plan-primary-button"
            disabled={
              isAdminPreviewMode ||
              isLoadingPresets ||
              isSaving ||
              activeWorkingDates.length === 0
            }
            type="submit"
          >
            {isSaving ? (
              <LoadingIndicator
                label="Сохраняем…"
                variant="button"
              />
            ) : `Сохранить · ${productionCategoryLabels[activeCategory]}`}
          </button>
        </div>
      </form>

      {status ? <p className="form-status" role="status">{status}</p> : null}

      <ProductionPlanSavedPanel state={loadState} />
    </section>
  );
}

function ProductionPlanSavedPanel({ state }: { state: ProductionPlanLoadState }) {
  if (state.status === "loading") {
    return (
      <LoadingIndicator
        className="production-plan-load-state"
        label={state.message}
        variant="panel"
      />
    );
  }

  if (state.status === "error") {
    return <p className="production-plan-load-state">{state.message}</p>;
  }

  if (state.plan === undefined) {
    return <p className="production-plan-load-state">На этот месяц план ещё не сохранён.</p>;
  }

  const plan = state.plan;
  const savedCategoryCount = productionCategories.filter(
    (category) => plan.schedules[category] !== undefined,
  ).length;

  return (
    <section className="production-plan-saved" aria-label="Сохранённый ежедневный план">
      <div className="production-plan-saved-head">
        <div>
          <span>Сохранённый план · {formatProductionPlanMonth(plan.month)}</span>
          <strong>Сохранено {savedCategoryCount} из 4</strong>
        </div>
        <p>
          Обновлено {formatDateTime(plan.createdAt)}
        </p>
      </div>
      <dl className="production-plan-category-summary">
        {productionCategories.map((category) => {
          const schedule = plan.schedules[category];

          return (
            <div key={category}>
              <dt>{productionCategoryLabels[category]}</dt>
              <dd>
                {schedule === undefined
                  ? "Не задан"
                  : formatNumber(schedule.monthlyPlan)}
              </dd>
              <span>
                {schedule === undefined
                  ? "Можно заполнить отдельно"
                  : `${schedule.workingDayCount} дней`}
              </span>
            </div>
          );
        })}
      </dl>
      <div className="production-plan-table-wrap">
        <table className="production-plan-table">
          <thead>
            <tr>
              <th scope="col">Дата</th>
              {productionCategories.map((category) => (
                <th scope="col" key={category}>
                  {productionCategoryLabels[category]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {readProductionPlanScheduleDates(plan).map((date) => (
              <tr key={date}>
                <td>{formatDateOnly(date)}</td>
                {productionCategories.map((category) => {
                  const schedule = plan.schedules[category];
                  const dailyPlan = schedule?.dailyPlans.find(
                    (item) => item.date === date,
                  );
                  const isRemainder = dailyPlan !== undefined &&
                    schedule?.dailyPlans.at(-1)?.date === date;

                  return (
                    <td
                      className={isRemainder ? "is-remainder" : undefined}
                      key={category}
                    >
                      {dailyPlan === undefined ? "—" : formatNumber(dailyPlan.value)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="production-plan-formula-note">
        До предпоследнего рабочего дня используется округление вверх; последний день — остаток.
      </p>
    </section>
  );
}

function readDispatcherFormChoiceGroups(
  forms: DispatcherFormDefinition[],
): DispatcherFormChoiceGroup[] {
  const groups: DispatcherFormChoiceGroup[] = [
    {
      id: "production",
      title: "Производство",
      description: "Сводка по выработке",
      forms: readDispatcherFormsByIds(forms, ["production"]),
    },
    {
      id: "equipment",
      title: "Оборудование",
      description: "Ежедневная отметка",
      forms: readDispatcherFormsByIds(forms, ["equipment"]),
    },
    {
      id: "incidents",
      title: "Инциденты",
      description: "Регистрация и закрытие",
      forms: readDispatcherFormsByIds(forms, ["incident", "incident_close"]),
    },
    {
      id: "visitors",
      title: "Посетители",
      description: "Вход и выход",
      forms: readDispatcherFormsByIds(forms, ["visitor", "visitor_exit"]),
    },
  ];

  return groups.filter((group) => group.forms.length > 0);
}

function readDispatcherFormsByIds(
  forms: DispatcherFormDefinition[],
  formIds: readonly DispatcherFormId[],
) {
  return formIds
    .map((formId) => forms.find((form) => form.id === formId))
    .filter((form): form is DispatcherFormDefinition => form !== undefined);
}

function readDispatcherFieldsByVisualSize(
  fields: readonly DispatcherFormField[],
) {
  return [
    ...fields.filter((field) => field.type !== "textarea"),
    ...fields.filter((field) => field.type === "textarea"),
  ];
}

export function DataEntryWorkspace({
  ariaLabel,
  status,
  isSubmitting,
  onSubmit,
  dispatcherForms,
  dispatcherFeed,
  dispatcherFeedFilters,
  onDispatcherFeedFiltersChange,
  currentUserDisplayName,
  isAdminPreviewMode,
  refreshVersion,
  onResetStatus,
  onShowToast,
  pendingRefractoryReports,
  refractoryQueueError,
  onRefractoryReportResolved,
  requestedFormId,
  onRequestedFormHandled,
}: {
  ariaLabel: string;
  status: string;
  isSubmitting: boolean;
  onSubmit: DataEntrySubmitHandler;
  dispatcherForms: DispatcherFormsLoadState;
  dispatcherFeed: DispatcherFeedLoadState;
  dispatcherFeedFilters: DispatcherFeedFilterState;
  onDispatcherFeedFiltersChange: (
    patch: Partial<DispatcherFeedFilterState>,
  ) => void;
  currentUserDisplayName: string;
  isAdminPreviewMode: boolean;
  refreshVersion: number;
  onResetStatus: () => void;
  onShowToast: ShowToast;
  pendingRefractoryReports: RefractoryReportRevision[];
  refractoryQueueError: string;
  onRefractoryReportResolved: (reportId: string) => void;
  requestedFormId?: DispatcherFormId;
  onRequestedFormHandled?: () => void;
}) {
  const forms = dispatcherForms.status === "ready" ? dispatcherForms.forms : [];
  const [selectedFormId, setSelectedFormId] = useState("");
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isRefractoryReviewOpen, setIsRefractoryReviewOpen] = useState(false);
  const formLeaveGuardRef = useRef<FormLeaveGuard | undefined>(undefined);
  const currentForm = forms.find((form) => form.id === selectedFormId);
  const isLocalTestMode =
    dispatcherForms.status === "ready" && dispatcherForms.source === "local_test";
  const formsStatusMessage =
    dispatcherForms.status === "ready"
      ? "Формы пока недоступны."
      : dispatcherForms.status === "error"
        ? readShortUserMessage(
            dispatcherForms.message,
            "Не удалось загрузить формы.",
          )
        : dispatcherForms.message;
  const localTestModeMessage =
    "Тестовый режим: данные сохраняются только на этом устройстве.";
  const reviewQueue = (
    <RefractoryReviewQueue
      reports={pendingRefractoryReports}
      errorMessage={
        refractoryQueueError.length > 0 ? refractoryQueueError : undefined
      }
      onResolved={onRefractoryReportResolved}
      onShowToast={onShowToast}
    />
  );

  useEffect(() => {
    if (
      selectedFormId.length > 0 &&
      !forms.some((form) => form.id === selectedFormId)
    ) {
      formLeaveGuardRef.current = undefined;
      setIsHistoryOpen(false);
      setSelectedFormId("");
    }
  }, [forms, selectedFormId]);

  useEffect(() => {
    if (
      requestedFormId === undefined ||
      !forms.some((form) => form.id === requestedFormId)
    ) {
      return;
    }

    formLeaveGuardRef.current = undefined;
    onResetStatus();
    setIsHistoryOpen(false);
    setIsRefractoryReviewOpen(false);
    setSelectedFormId(requestedFormId);
    void recordAuditScreenView(`dispatcher.form.${requestedFormId}`);
    onRequestedFormHandled?.();
  }, [forms, onRequestedFormHandled, onResetStatus, requestedFormId]);

  function handleSelectForm(formId: string) {
    const continueSelection = () => {
      formLeaveGuardRef.current = undefined;
      onResetStatus();
      setIsHistoryOpen(false);
      setIsRefractoryReviewOpen(false);
      setSelectedFormId(formId);
      if (formId.length > 0) {
        void recordAuditScreenView(`dispatcher.form.${formId}`);
      }
    };

    if (
      formLeaveGuardRef.current !== undefined &&
      !formLeaveGuardRef.current(continueSelection)
    ) {
      return;
    }

    continueSelection();
  }

  function handleSuccessfulSubmit(message: string) {
    formLeaveGuardRef.current = undefined;
    setIsHistoryOpen(false);
    onShowToast("Отправлено", message, "success");
    setSelectedFormId("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    onSubmit(event, undefined, undefined, {
      onSuccess: handleSuccessfulSubmit,
    });
  }

  function handleOpenRefractoryReview() {
    formLeaveGuardRef.current = undefined;
    onResetStatus();
    setSelectedFormId("");
    setIsRefractoryReviewOpen(true);
    void recordAuditScreenView("dispatcher.refractory_review");
  }

  function handleOpenHistory() {
    const groupByForm: Partial<Record<DispatcherFormId, DispatcherFeedGroup>> = {
      production: "production",
      equipment: "equipment",
      incident: "incidents",
      incident_close: "incidents",
      visitor: "visitors",
      visitor_exit: "visitors",
    };

    onDispatcherFeedFiltersChange({
      group:
        groupByForm[currentForm?.id ?? "production"] ??
        dispatcherFeedFilters.group,
    });
    setIsHistoryOpen(true);
  }

  if (isRefractoryReviewOpen) {
    return (
      <section className="data-entry-surface" aria-label={ariaLabel}>
        <div className="dispatcher-form-toolbar">
          <strong>Таблицы огнеупорного цеха</strong>
          <button
            className="secondary-button"
            type="button"
            onClick={() => setIsRefractoryReviewOpen(false)}
          >
            К выбору формы
          </button>
        </div>
        {reviewQueue}
      </section>
    );
  }

  if (dispatcherForms.status !== "ready" || forms.length === 0) {
    return (
      <section className="data-entry-surface" aria-label={ariaLabel}>
        <div className="dispatcher-form-choice" aria-label="Выбор формы">
          <RefractoryReviewChoice
            hasError={refractoryQueueError.length > 0}
            pendingCount={pendingRefractoryReports.length}
            onOpen={handleOpenRefractoryReview}
          />
        </div>
        {dispatcherForms.status === "loading" ? (
          <LoadingIndicator label={formsStatusMessage} variant="page" />
        ) : (
          <p className="form-status">{formsStatusMessage}</p>
        )}
      </section>
    );
  }

  if (currentForm === undefined) {
    const choiceGroups = readDispatcherFormChoiceGroups(forms);

    return (
      <section className="data-entry-surface" aria-label={ariaLabel}>
        {isLocalTestMode ? (
          <p className="form-status form-status-local">{localTestModeMessage}</p>
        ) : null}
        <div className="dispatcher-form-choice" aria-label="Выбор формы">
          <RefractoryReviewChoice
            hasError={refractoryQueueError.length > 0}
            pendingCount={pendingRefractoryReports.length}
            onOpen={handleOpenRefractoryReview}
          />
          {choiceGroups.map((group) => (
            <section
              className={`dispatcher-form-choice-group dispatcher-form-choice-group-${group.id}`}
              aria-labelledby={`dispatcher-form-choice-${group.id}`}
              key={group.id}
            >
              <div className="dispatcher-form-choice-group-header">
                <span id={`dispatcher-form-choice-${group.id}`}>
                  {group.title}
                </span>
                <small>{group.description}</small>
              </div>
              <div className="dispatcher-form-choice-buttons">
                {group.forms.map((form) => (
                  <button
                    className="dispatcher-form-choice-button"
                    type="button"
                    key={form.id}
                    onClick={() => handleSelectForm(form.id)}
                  >
                    <span>{form.title}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="data-entry-surface" aria-label={ariaLabel}>
      {isHistoryOpen ? (
        <div className="dispatcher-form-history">
          <div className="dispatcher-form-toolbar">
            <strong>История диспетчерских форм</strong>
            <div className="dispatcher-form-toolbar-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setIsHistoryOpen(false)}
              >
                Вернуться к форме
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => handleSelectForm("")}
              >
                К выбору формы
              </button>
            </div>
          </div>
          <DispatcherFeedPanel
            dispatcherFeed={dispatcherFeed}
            dispatcherForms={dispatcherForms}
            filters={dispatcherFeedFilters}
            onFiltersChange={onDispatcherFeedFiltersChange}
          />
        </div>
      ) : null}
      <form
        className="data-entry-form"
        hidden={isHistoryOpen}
        onSubmit={handleSubmit}
      >
        <input name="formId" type="hidden" value={currentForm.id} readOnly />
        {isLocalTestMode ? (
          <p className="form-status form-status-local">{localTestModeMessage}</p>
        ) : null}
        <div className="dispatcher-form-toolbar">
          <div className="dispatcher-form-toolbar-leading">
            <strong>{currentForm.title}</strong>
            <button
              className="secondary-button"
              type="button"
              onClick={handleOpenHistory}
            >
              Посмотреть историю
            </button>
          </div>
          <button
            className="secondary-button"
            type="button"
            onClick={() => handleSelectForm("")}
          >
            К выбору формы
          </button>
        </div>
        {currentForm.id === "production" ? (
          <DispatcherProductionReportFormBody
            form={currentForm}
            isAdminPreviewMode={isAdminPreviewMode}
            isSubmitting={isSubmitting}
            status={status}
            onResetStatus={onResetStatus}
          />
        ) : currentForm.id === "equipment" ? (
          <DispatcherEquipmentFormBody
            form={currentForm}
            isSubmitting={isSubmitting}
            refreshVersion={refreshVersion}
            status={status}
            onLeaveGuardChange={(guard) => {
              formLeaveGuardRef.current = guard;
            }}
            onResetStatus={onResetStatus}
          />
        ) : currentForm.id === "visitor_exit" ? (
          <DispatcherVisitorExitFormBody
            isSubmitting={isSubmitting}
            refreshVersion={refreshVersion}
            status={status}
          />
        ) : currentForm.id === "incident_close" ? (
          <DispatcherIncidentCloseFormBody
            form={currentForm}
            isSubmitting={isSubmitting}
            refreshVersion={refreshVersion}
            status={status}
          />
        ) : (
          <>
            <div className="dispatcher-form-fields">
              {readDispatcherFieldsByVisualSize(currentForm.fields).map(
                (field) => {
                  const responsibleInput =
                    currentForm.id === "incident" && field.name === "responsible"
                      ? buildIncidentResponsibleInput({
                          currentUserDisplayName,
                          isAdminPreviewMode,
                          options: field.options ?? [],
                        })
                      : undefined;

                  return (
                    <DispatcherFormFieldInput
                      defaultValue={responsibleInput?.defaultValue}
                      field={field}
                      key={field.name}
                      options={responsibleInput?.options}
                    />
                  );
                },
              )}
            </div>
            <div className="form-actions">
              <button
                className="primary-button"
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <LoadingIndicator
                    label="Отправляем…"
                    variant="button"
                  />
                ) : "Отправить"}
              </button>
              {status.length > 0 ? <p className="form-status">{status}</p> : null}
            </div>
          </>
        )}
      </form>
    </section>
  );
}

function RefractoryReviewChoice({
  hasError,
  pendingCount,
  onOpen,
}: {
  hasError: boolean;
  pendingCount: number;
  onOpen: () => void;
}) {
  return (
    <section className="dispatcher-form-choice-group dispatcher-form-choice-group-refractory">
      <div className="dispatcher-form-choice-group-header">
        <span>Подтверждение</span>
        <small>Отдельная очередь входящих таблиц</small>
      </div>
      <div className="dispatcher-form-choice-buttons">
        <button
          className="dispatcher-form-choice-button dispatcher-form-choice-button-refractory"
          type="button"
          onClick={onOpen}
        >
          <span>Таблицы огнеупорного цеха</span>
          <small>
            {hasError
              ? "Не удалось проверить очередь"
              : pendingCount > 0
                ? `Ожидают решения: ${pendingCount}`
                : "Нет ожидающих таблиц"}
          </small>
          {pendingCount > 0 ? <b aria-hidden="true">{pendingCount}</b> : null}
        </button>
      </div>
    </section>
  );
}

type DispatcherProductionBankContentsState =
  | DispatcherProductionBankContentsResult
  | { status: "loading" };

export function DispatcherProductionReportFormBody({
  form,
  isAdminPreviewMode,
  isSubmitting,
  onResetStatus,
  status,
}: {
  form: DispatcherFormDefinition;
  isAdminPreviewMode: boolean;
  isSubmitting: boolean;
  onResetStatus: () => void;
  status: string;
}) {
  const reportDateField = form.fields.find(
    (field) => field.name === "reportDate",
  );
  const [reportDate, setReportDate] = useState(getTodayDateValue);
  const [dailyPlanState, setDailyPlanState] = useState<
    | { status: "loading" }
    | { status: "ready"; plan?: ProductionDailyPlan }
    | { status: "error"; message: string }
  >({ status: "loading" });
  const [brandRefreshVersion, setBrandRefreshVersion] = useState(0);
  const {
    labels: brandLabels,
    loadState: brandLoadState,
  } = useProductionBrands({
    refreshVersion: brandRefreshVersion,
  });
  const [reportLoadState, setReportLoadState] = useState<
    | { status: "loading" }
    | { status: "ready"; submission?: DispatcherSubmission }
    | { status: "error"; message: string }
  >({ status: "loading" });
  const [bankContentsState, setBankContentsState] =
    useState<DispatcherProductionBankContentsState>({ status: "loading" });

  useEffect(() => {
    if (reportDate.length === 0) {
      setBankContentsState({
        status: "error",
        message: "Выберите дату отчёта.",
      });
      return;
    }

    const controller = new AbortController();

    setBankContentsState({ status: "loading" });
    requestDispatcherProductionBankContents(
      { reportDate },
      { signal: controller.signal },
    ).then((result) => {
      if (controller.signal.aborted) {
        return;
      }

      setBankContentsState(
        result.status === "error"
          ? {
              status: "error",
              message: readShortUserMessage(
                result.message,
                "Не удалось загрузить данные банок.",
              ),
            }
          : result,
      );
    });

    return () => controller.abort();
  }, [isAdminPreviewMode, reportDate]);

  useEffect(() => {
    if (reportDate.length === 0) {
      setReportLoadState({ status: "ready" });
      return;
    }

    const controller = new AbortController();

    setReportLoadState({ status: "loading" });
    requestDispatcherFeed({
      formId: "production",
      reportDate,
      limit: 1,
      localFallback: true,
      signal: controller.signal,
    }).then((result) => {
      if (controller.signal.aborted) return;

      if (result.status === "ready") {
        setReportLoadState({
          status: "ready",
          submission: result.submissions.find(
            (submission) => submission.formId === "production",
          ),
        });
        return;
      }

      setReportLoadState({
        status: "error",
        message: readShortUserMessage(
          result.message,
          "Не удалось загрузить данные за выбранную дату.",
        ),
      });
    });

    return () => controller.abort();
  }, [isAdminPreviewMode, reportDate]);

  useEffect(() => {
    if (reportDate.length === 0) {
      setDailyPlanState({ status: "ready" });
      return;
    }

    const controller = new AbortController();

    setDailyPlanState({ status: "loading" });
    requestProductionDailyPlan(reportDate, { signal: controller.signal }).then(
      (result) => {
        if (controller.signal.aborted) {
          return;
        }

        if (result.status === "ready") {
          setDailyPlanState({ status: "ready", plan: result.plan });
          return;
        }

        setDailyPlanState({
          status: "error",
          message: readShortUserMessage(
            result.message,
            "Не удалось загрузить планы.",
          ),
        });
      },
    );

    return () => controller.abort();
  }, [isAdminPreviewMode, reportDate]);

  const dailyPlan =
    dailyPlanState.status === "ready" ? dailyPlanState.plan : undefined;
  const dailyPlanValues = dailyPlan?.values;
  const monthToDateValues = dailyPlan?.monthToDate;

  return (
    <>
      <div className="production-report-intro">
        <div>
          <strong>Сводка о выполнении показателей по заводу</strong>
          <span>Заполните известные показатели за выбранную дату.</span>
        </div>
        {reportDateField === undefined ? null : (
          <DispatcherControlledFormFieldInput
            field={reportDateField}
            value={reportDate}
            onBlur={() => undefined}
            onChange={(nextReportDate) => {
              onResetStatus();
              setReportDate(nextReportDate);
            }}
          />
        )}
      </div>

      <div className="production-report-daily-plan" aria-live="polite">
        <span>Планы на выбранную дату</span>
        {dailyPlanState.status === "loading" ? (
          <LoadingIndicator
            announce={false}
            label="Загружаем планы…"
            variant="inline"
          />
        ) : dailyPlanState.status === "error" ? (
          <strong>{dailyPlanState.message}</strong>
        ) : dailyPlanValues === undefined ? (
          <strong>На эту дату не заданы</strong>
        ) : (
          <dl className="production-report-daily-plan-list">
            {productionCategories.map((category) => (
              <div key={category}>
                <dt>{productionCategoryLabels[category]}</dt>
                <dd>
                  {dailyPlanValues[category] === undefined
                    ? "Не задан"
                    : formatNumber(dailyPlanValues[category])}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      {reportLoadState.status === "loading" ||
      bankContentsState.status === "loading" ? (
        <LoadingIndicator
          label="Загружаем данные и замеры за выбранную дату…"
          variant="panel"
        />
      ) : reportLoadState.status === "error" ? (
        <p className="form-status" role="alert">
          {reportLoadState.message}
        </p>
      ) : (
        <ProductionReportEditor
          key={`${reportDate}:${reportLoadState.submission?.id ?? "new"}`}
          brandLabels={brandLabels}
          brandLoadState={brandLoadState}
          bankContentsState={bankContentsState}
          dailyPlanValues={dailyPlanValues}
          form={form}
          initialSubmission={reportLoadState.submission}
          isAdminPreviewMode={isAdminPreviewMode}
          isSubmitting={isSubmitting}
          monthToDateValues={monthToDateValues}
          reportDate={reportDate}
          status={status}
          onRetryBrands={() =>
            setBrandRefreshVersion((current) => current + 1)
          }
        />
      )}
    </>
  );
}

function ProductionReportEditor({
  bankContentsState,
  brandLabels,
  brandLoadState,
  dailyPlanValues,
  form,
  initialSubmission,
  isAdminPreviewMode,
  isSubmitting,
  monthToDateValues,
  reportDate,
  status,
  onRetryBrands,
}: {
  bankContentsState: DispatcherProductionBankContentsState;
  brandLabels: ProductionBrandLabel[];
  brandLoadState:
    | { status: "loading" }
    | { status: "ready" }
    | { status: "error"; message: string };
  dailyPlanValues?: Partial<ProductionCategoryPlans>;
  form: DispatcherFormDefinition;
  initialSubmission?: DispatcherSubmission;
  isAdminPreviewMode: boolean;
  isSubmitting: boolean;
  monthToDateValues?: Partial<
    Record<ProductionCategory, ProductionMonthToDateValue>
  >;
  reportDate: string;
  status: string;
  onRetryBrands: () => void;
}) {
  const initialPayload = initialSubmission?.payload;
  const bankMaterialByNumber = new Map(
    bankContentsState.status === "ready"
      ? bankContentsState.bankContents.map((item) => [
          item.bankNumber,
          item.materialLabel,
        ])
      : [],
  );
  const bankMeasurementByNumber = new Map(
    bankContentsState.status === "ready"
      ? bankContentsState.bankMeasurements.map((item) => [
          item.bankNumber,
          item,
        ])
      : [],
  );
  const unavailableBankMaterialLabel =
    bankContentsState.status === "loading" ? "Загрузка…" : "Нет данных";

  return (
    <>
      {initialSubmission === undefined ? (
        <p className="dispatcher-status-line">
          За выбранную дату данные ещё не внесены.
        </p>
      ) : (
        <p className="dispatcher-status-line" role="status">
          Загружены сохранённые данные. После отправки изменения станут новой
          версией отчёта.
        </p>
      )}

      {brandLoadState.status === "loading" ? (
        <LoadingIndicator label="Загружаем марки…" variant="panel" />
      ) : brandLoadState.status === "error" ? (
        <div className="production-brand-load-error" role="alert">
          <span>{brandLoadState.message}</span>
          <button type="button" onClick={onRetryBrands}>
            Повторить
          </button>
        </div>
      ) : null}

      <fieldset className="production-report-section">
        <legend>Огнеупорный цех</legend>
        <ProductionCategoryTable
          allowBlankFact={isWeekendReportDate(reportDate)}
          brandLabels={brandLabels}
          categoryPlan={dailyPlanValues?.forming}
          initialPayload={initialPayload}
          isAdminPreviewMode={isAdminPreviewMode}
          monthToDate={monthToDateValues?.forming}
          prefix="forming"
          title="Формовка"
        />
        <ProductionCategoryTable
          brandLabels={brandLabels}
          categoryPlan={dailyPlanValues?.sorting}
          initialPayload={initialPayload}
          isAdminPreviewMode={isAdminPreviewMode}
          monthToDate={monthToDateValues?.sorting}
          prefix="sorting"
          title="Сортировка"
        />
      </fieldset>

      <div className="production-report-split">
        <fieldset className="production-report-section">
          <legend>Неформованная продукция, контейнеры</legend>
          <ProductionCategoryTable
            brandLabels={brandLabels}
            categoryPlan={dailyPlanValues?.unformed}
            initialPayload={initialPayload}
            isAdminPreviewMode={isAdminPreviewMode}
            monthToDate={monthToDateValues?.unformed}
            prefix="unformed"
          />
        </fieldset>

        <fieldset className="production-report-section">
          <legend>Цех обжига шамота</legend>
          <span className="production-report-section-note">
            Выпуск шамота по маркам
          </span>
          <ProductionCategoryTable
            brandLabels={brandLabels}
            categoryPlan={dailyPlanValues?.chamotte}
            initialPayload={initialPayload}
            isAdminPreviewMode={isAdminPreviewMode}
            monthToDate={monthToDateValues?.chamotte}
            prefix="chamotte"
          />
        </fieldset>
      </div>

      <div className="production-report-split production-report-split-bottom">
        <fieldset className="production-report-section">
          <legend>Замеры банок</legend>
          {bankContentsState.status === "ready" ? (
            <span className="production-report-section-note">
              По замерам: начало — ЦОШ ОЦ за{" "}
              {formatDateOnly(bankContentsState.previousReportDate)}, конец —
              ЦОШ ОЦ за {formatDateOnly(bankContentsState.reportDate)}.
            </span>
          ) : null}
          {bankContentsState.status === "error" ? (
            <span
              className="production-report-section-note production-report-bank-content-error"
              role="alert"
            >
              {bankContentsState.message}
            </span>
          ) : null}
          <div className="production-report-table-wrap">
            <table className="production-report-table production-report-jar-table">
              <thead>
                <tr>
                  <th scope="col" rowSpan={2}>Банка</th>
                  <th scope="colgroup" colSpan={2}>Начало дня</th>
                  <th scope="colgroup" colSpan={2}>Конец дня</th>
                </tr>
                <tr>
                  <th scope="col">По замерам</th>
                  <th scope="col">По отгрузкам</th>
                  <th scope="col">По замерам</th>
                  <th scope="col">По отгрузкам</th>
                </tr>
              </thead>
              <tbody>
                {([1, 2, 3] as const).map((jarNumber) => (
                  <tr key={jarNumber}>
                    <th scope="row">
                      <span className="production-report-jar-label">
                        <span>{jarNumber}</span>
                        <small>
                          {bankContentsState.status === "ready"
                            ? bankMaterialByNumber.get(jarNumber) ?? "Не назначено"
                            : unavailableBankMaterialLabel}
                        </small>
                      </span>
                    </th>
                    <td>
                      <ProductionReportCell
                        defaultValue={readBankMeasurementValue(
                          bankMeasurementByNumber.get(jarNumber)?.start,
                        )}
                        fieldName={`jarStart${jarNumber}`}
                        form={form}
                        readOnly
                      />
                    </td>
                    <td>
                      <ProductionReportCell
                        defaultValue={
                          initialPayload?.[`jarShipmentStart${jarNumber}`]
                        }
                        fieldName={`jarShipmentStart${jarNumber}`}
                        form={form}
                      />
                    </td>
                    <td>
                      <ProductionReportCell
                        defaultValue={readBankMeasurementValue(
                          bankMeasurementByNumber.get(jarNumber)?.end,
                        )}
                        fieldName={`jarEnd${jarNumber}`}
                        form={form}
                        readOnly
                      />
                    </td>
                    <td>
                      <ProductionReportCell
                        defaultValue={
                          initialPayload?.[`jarShipmentEnd${jarNumber}`]
                        }
                        fieldName={`jarShipmentEnd${jarNumber}`}
                        form={form}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </fieldset>

        <fieldset className="production-report-section">
          <legend>Участок грануляции</legend>
          <ProductionGranulationTable
            form={form}
            initialPayload={initialPayload}
          />
        </fieldset>
      </div>

      <div className="form-actions">
        <button
          className="primary-button"
          type="submit"
          disabled={isSubmitting || brandLoadState.status !== "ready"}
        >
          {isSubmitting ? (
            <LoadingIndicator label="Отправляем…" variant="button" />
          ) : initialSubmission === undefined ? (
            "Отправить"
          ) : (
            "Внести изменения"
          )}
        </button>
        {status.length > 0 ? <p className="form-status">{status}</p> : null}
      </div>
    </>
  );
}

type ProductionBrandColumn = {
  id: number;
  brand: string;
  initialFact: string;
};

export function ProductionCategoryTable({
  allowBlankFact = false,
  brandLabels,
  categoryPlan,
  initialPayload,
  isAdminPreviewMode,
  monthToDate,
  prefix,
  title,
}: {
  allowBlankFact?: boolean;
  brandLabels: ProductionBrandLabel[];
  categoryPlan?: number;
  initialPayload?: DispatcherSubmissionPayload;
  isAdminPreviewMode: boolean;
  monthToDate?: ProductionMonthToDateValue;
  prefix: ProductionCategory;
  title?: string;
}) {
  const [columns, setColumns] = useState<ProductionBrandColumn[]>(() =>
    readProductionBrandColumns(initialPayload, prefix),
  );
  const [factsByColumnId, setFactsByColumnId] = useState<
    Partial<Record<number, number>>
  >(() => readProductionBrandFactValues(initialPayload, prefix));

  function addColumn() {
    if (columns.length >= 50) return;

    const usedIds = new Set(columns.map((column) => column.id));
    const id = Array.from({ length: 50 }, (_, index) => index + 1).find(
      (candidate) => !usedIds.has(candidate),
    );

    if (id === undefined) return;

    setColumns((current) => [
      ...current,
      { id, brand: "", initialFact: "" },
    ]);
  }

  function removeColumn(id: number) {
    setColumns((current) => current.filter((column) => column.id !== id));
    setFactsByColumnId((current) => {
      const next = { ...current };

      delete next[id];
      return next;
    });
  }

  function changeColumnBrand(id: number, brand: string) {
    setColumns((current) =>
      current.map((column) =>
        column.id === id ? { ...column, brand } : column,
      ),
    );
  }

  const selectedLabels = columns
    .map((column) => column.brand)
    .filter((brand) => brand.length > 0);
  const dayFact = Object.values(factsByColumnId).reduce<number>(
    (sum, value) => sum + (value ?? 0),
    0,
  );
  const monthFact = calculateProductionDraftMonthFact(monthToDate, dayFact);
  const content = (
    <div className="production-brand-columns">
      <div className="production-report-table-wrap">
        <table className="production-report-table production-report-brand-columns-table">
          <thead>
            <tr>
              {columns.map((column, index) => (
                <th scope="col" key={column.id}>
                  <ProductBrandPicker
                    disabled={isAdminPreviewMode}
                    labels={brandLabels}
                    name={`${prefix}Brand${column.id}`}
                    selectedLabels={selectedLabels.filter(
                      (label) => label !== column.brand,
                    )}
                    value={column.brand}
                    onChange={(brand) => changeColumnBrand(column.id, brand)}
                  />
                  {columns.length > 1 ? (
                    <button
                      aria-label={`Удалить столбец ${index + 1}`}
                      className="production-brand-column-remove"
                      disabled={isAdminPreviewMode}
                      type="button"
                      onClick={() => removeColumn(column.id)}
                    >
                      Удалить
                    </button>
                  ) : null}
                </th>
              ))}
              <th className="production-report-plan-heading" scope="col">
                План за день
              </th>
              <th className="production-report-plan-heading" scope="col">
                План за месяц
              </th>
              <th className="production-report-plan-heading" scope="col">
                Факт за месяц
              </th>
              <th className="production-report-plan-heading" scope="col">
                Отклонение
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              {columns.map((column) => (
                <td key={column.id}>
                  <label className="production-brand-fact-input">
                    <span>Факт по марке</span>
                    <input
                      aria-label={`Факт: ${column.brand || "марка не выбрана"}`}
                      defaultValue={column.initialFact}
                      inputMode="decimal"
                      name={`${prefix}Fact${column.id}`}
                      placeholder="Факт за сутки"
                      pattern={decimalNumberInputPattern}
                      required={!allowBlankFact && column.brand.length > 0}
                      title={decimalNumberInputTitle}
                      type="text"
                      onMouseDown={prefix === "forming" || prefix === "sorting"
                        ? (event) => {
                            if (
                              event.currentTarget.ownerDocument.activeElement !==
                              event.currentTarget
                            ) {
                              event.preventDefault();
                              event.currentTarget.focus({ preventScroll: true });
                            }
                          }
                        : undefined}
                      onBlur={(event) => {
                        const normalizedFact =
                          normalizeDecimalNumberForPayload(
                            event.currentTarget.value,
                          ) ?? "";

                        event.currentTarget.value = normalizedFact;
                        setFactsByColumnId((current) => ({
                          ...current,
                          [column.id]: readProductionDraftFact(normalizedFact),
                        }));
                      }}
                      onChange={(event) => {
                        const normalizedFact = normalizeDecimalNumberInput(
                          event.currentTarget.value,
                        );

                        event.currentTarget.value = normalizedFact;
                        setFactsByColumnId((current) => ({
                          ...current,
                          [column.id]: readProductionDraftFact(normalizedFact),
                        }));
                      }}
                    />
                  </label>
                </td>
              ))}
              <td className="production-report-plan-cell">
                {categoryPlan === undefined
                  ? "Не задан"
                  : formatNumber(categoryPlan)}
              </td>
              <td className="production-report-plan-cell">
                <ProductionCalculatedValue
                  ariaLabel={`${productionCategoryLabels[prefix]}: план за месяц`}
                  emptyLabel="Не задан"
                  value={monthToDate?.monthPlan}
                />
              </td>
              <td className="production-report-plan-cell">
                <ProductionCalculatedValue
                  ariaLabel={`${productionCategoryLabels[prefix]}: факт за месяц`}
                  emptyLabel="Не рассчитан"
                  value={monthFact}
                />
              </td>
              <td className="production-report-plan-cell">
                <ProductionCalculatedValue
                  ariaLabel={`${productionCategoryLabels[prefix]}: отклонение`}
                  emptyLabel="Не рассчитано"
                  value={calculateProductionDraftDeviation(
                    monthToDate,
                    monthFact,
                  )}
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <button
        className="production-brand-column-add"
        disabled={isAdminPreviewMode || columns.length >= 50}
        type="button"
        onClick={addColumn}
      >
        + Добавить марку
      </button>
    </div>
  );

  return title === undefined ? content : (
    <section className="production-report-subsection">
      <h3>{title}</h3>
      {content}
    </section>
  );
}

function ProductionCalculatedValue({
  ariaLabel,
  emptyLabel,
  value,
}: {
  ariaLabel: string;
  emptyLabel: string;
  value?: number;
}) {
  return (
    <output aria-label={ariaLabel} className="production-report-calculated-value">
      {value === undefined ? emptyLabel : formatNumber(value)}
    </output>
  );
}

function calculateProductionDraftDeviation(
  monthToDate: ProductionMonthToDateValue | undefined,
  monthFact: number | undefined,
) {
  return monthToDate?.monthPlan === undefined || monthFact === undefined
    ? undefined
    : monthFact - monthToDate.monthPlan;
}

function calculateProductionDraftMonthFact(
  monthToDate: ProductionMonthToDateValue | undefined,
  dayFact: number,
) {
  return monthToDate === undefined
    ? undefined
    : monthToDate.monthFactBeforeDay + dayFact;
}

function readProductionDraftFact(value: string | undefined) {
  const normalized = normalizeDecimalNumberForPayload(value ?? "");
  const fact = normalized === undefined ? 0 : Number(normalized);

  return Number.isFinite(fact) && fact >= 0 ? fact : 0;
}

function readProductionBrandFactValues(
  payload: DispatcherSubmissionPayload | undefined,
  prefix: ProductionCategory,
) {
  const facts: Partial<Record<number, number>> = {};

  for (let id = 1; id <= 50; id += 1) {
    const value = payload?.[`${prefix}Fact${id}`];

    if (value !== undefined) {
      facts[id] = readProductionDraftFact(value);
    }
  }

  if (
    Object.keys(facts).length === 0 &&
    (prefix === "forming" || prefix === "sorting") &&
    payload?.[`${prefix}Day`] !== undefined
  ) {
    facts[1] = readProductionDraftFact(payload[`${prefix}Day`]);
  }

  return facts;
}

function readProductionBrandColumns(
  payload: DispatcherSubmissionPayload | undefined,
  prefix: ProductionCategory,
): ProductionBrandColumn[] {
  const fieldPattern = new RegExp(`^${prefix}(?:Brand|Fact)(\\d+)$`, "u");
  const ids = new Set<number>();

  for (const fieldName of Object.keys(payload ?? {})) {
    const match = fieldPattern.exec(fieldName);
    const id = match === null ? undefined : Number(match[1]);

    if (id !== undefined && Number.isInteger(id) && id >= 1 && id <= 50) {
      ids.add(id);
    }
  }

  if (ids.size === 0) {
    return [{
      id: 1,
      brand:
        prefix === "forming" || prefix === "sorting"
          ? payload?.[`${prefix}ProductBrand`] ?? ""
          : "",
      initialFact:
        prefix === "forming" || prefix === "sorting"
          ? payload?.[`${prefix}Day`] ?? ""
          : "",
    }];
  }

  return [...ids]
    .sort((left, right) => left - right)
    .map((id) => ({
      id,
      brand: payload?.[`${prefix}Brand${id}`] ?? "",
      initialFact: payload?.[`${prefix}Fact${id}`] ?? "",
    }));
}

function ProductionGranulationTable({
  form,
  initialPayload,
}: {
  form: DispatcherFormDefinition;
  initialPayload?: DispatcherSubmissionPayload;
}) {
  return (
    <div className="production-report-table-wrap">
      <table className="production-report-table production-report-granulation-table">
        <thead>
          <tr>
            <th scope="col" rowSpan={2}>Количество тарелок в работе</th>
            <th scope="col" rowSpan={2}>Время работы мельницы, часов</th>
            <th scope="colgroup" colSpan={2}>Выпуск сырцовой гранулы, т</th>
          </tr>
          <tr>
            <th scope="col">Фракция 16/30</th>
            <th scope="col">Фракция 12/18</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            {[
              "granulationPlatesInOperation",
              "granulationMillHours",
              "granulationFraction1630Day",
              "granulationFraction1218Day",
            ].map((fieldName) => (
              <td key={fieldName}>
                <ProductionReportCell
                  defaultValue={initialPayload?.[fieldName]}
                  fieldName={fieldName}
                  form={form}
                />
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function ProductionReportCell({
  defaultValue,
  fieldName,
  focusOnMouseDown = false,
  form,
  readOnly = false,
  required,
}: {
  defaultValue?: string;
  fieldName: string;
  focusOnMouseDown?: boolean;
  form: DispatcherFormDefinition;
  readOnly?: boolean;
  required?: boolean;
}) {
  const field = form.fields.find((item) => item.name === fieldName);

  if (field === undefined) {
    return null;
  }

  return (
    <div className="production-report-cell-input" title={field.label}>
      <DispatcherFormFieldInput
        defaultValue={defaultValue}
        field={field}
        focusOnMouseDown={focusOnMouseDown}
        readOnly={readOnly}
        required={required}
      />
    </div>
  );
}

function DispatcherIncidentCloseFormBody({
  form,
  isSubmitting,
  refreshVersion,
  status,
}: {
  form: DispatcherFormDefinition;
  isSubmitting: boolean;
  refreshVersion: number;
  status: string;
}) {
  const firstIncidentButtonRef = useRef<HTMLButtonElement>(null);
  const selectedIncidentCardRef = useRef<HTMLDivElement>(null);
  const hasActivatedIncidentChoiceRef = useRef(false);
  const [selection, dispatchSelection] = useReducer(
    reduceIncidentCloseSelection,
    initialIncidentCloseSelectionState,
  );
  const [incidentFeed, setIncidentFeed] = useState<DispatcherFeedLoadState>({
    status: "loading",
    message: "Загружаем инциденты.",
  });
  const openIncidents = buildOpenIncidentOptions(
    incidentFeed.status === "ready" ? incidentFeed.openIncidents : [],
  );
  const selectedIncident = selection.selectedIncident;
  const isLocalIncidentFeed =
    incidentFeed.status === "ready" && incidentFeed.source === "local_test";
  const closeFields = readDispatcherFieldsByVisualSize(
    form.fields.filter((field) => field.name !== "incidentNumber"),
  );

  useEffect(() => {
    let isActive = true;
    let currentController: AbortController | undefined;

    function loadIncidentFeed() {
      currentController?.abort();
      currentController = new AbortController();

      setIncidentFeed((current) =>
        current.status === "ready"
          ? current
          : {
              status: "loading",
              message: "Загружаем инциденты.",
            },
      );

      requestDispatcherFeed({
        limit: 1,
        localFallback: true,
        signal: currentController.signal,
      }).then((result) => {
        if (isActive) {
          setIncidentFeed(result);
        }
      });
    }

    loadIncidentFeed();
    const intervalId = window.setInterval(loadIncidentFeed, 10_000);

    return () => {
      isActive = false;
      currentController?.abort();
      window.clearInterval(intervalId);
    };
  }, [refreshVersion]);

  useEffect(() => {
    if (
      incidentFeed.status !== "ready" ||
      hasActivatedIncidentChoiceRef.current ||
      selectedIncident !== undefined
    ) {
      return;
    }

    hasActivatedIncidentChoiceRef.current = true;
    if (openIncidents.length > 0) {
      firstIncidentButtonRef.current?.focus();
    }
  }, [incidentFeed.status, openIncidents.length, selectedIncident]);

  useEffect(() => {
    if (incidentFeed.status === "ready") {
      dispatchSelection({
        type: "feed_ready",
        openIncidents,
      });
      return;
    }

    if (incidentFeed.status === "error") {
      dispatchSelection({ type: "feed_unavailable" });
    }
  }, [incidentFeed]);

  useEffect(() => {
    if (selectedIncident === undefined) {
      return;
    }

    const animationFrame = window.requestAnimationFrame(() =>
      selectedIncidentCardRef.current?.focus(),
    );

    return () => window.cancelAnimationFrame(animationFrame);
  }, [selectedIncident]);

  useEffect(() => {
    if (selection.notice.length === 0 || selectedIncident !== undefined) {
      return;
    }

    const animationFrame = window.requestAnimationFrame(() =>
      firstIncidentButtonRef.current?.focus(),
    );

    return () => window.cancelAnimationFrame(animationFrame);
  }, [selectedIncident, selection.notice]);

  function handleSelectIncident(
    incident: ReturnType<typeof buildOpenIncidentOptions>[number],
  ) {
    dispatchSelection({ type: "select", incident });
  }

  function handleResetIncidentSelection() {
    dispatchSelection({ type: "reset" });
    window.requestAnimationFrame(() => firstIncidentButtonRef.current?.focus());
  }

  const incidentFeedStatus = (
    <>
      {incidentFeed.status === "error" ? (
        <p className="form-status">
          {readShortUserMessage(
            incidentFeed.message,
            "Не удалось загрузить инциденты.",
          )}
        </p>
      ) : null}
      {isLocalIncidentFeed ? (
        <p className="form-status form-status-local">
          Тестовый режим: список только на этом устройстве.
        </p>
      ) : null}
    </>
  );

  if (selectedIncident === undefined) {
    return (
      <>
        <section
          className="incident-close-choice"
          aria-labelledby="incident-close-choice-title"
        >
          <div className="incident-close-choice-header">
            <strong id="incident-close-choice-title">Выберите инцидент</strong>
            <span>Показаны только незакрытые инциденты.</span>
          </div>
          {incidentFeed.status === "loading" ? (
            <LoadingIndicator label="Загружаем инциденты." variant="panel" />
          ) : null}
          {incidentFeed.status === "ready" && openIncidents.length === 0 ? (
            <p className="dispatcher-status-line">Нет незакрытых инцидентов.</p>
          ) : null}
          {openIncidents.length > 0 ? (
            <div className="incident-close-choice-buttons">
              {openIncidents.map((incident, index) => (
                <button
                  ref={index === 0 ? firstIncidentButtonRef : undefined}
                  className="dispatcher-form-choice-button incident-close-choice-button"
                  type="button"
                  key={incident.incidentNumber}
                  onClick={() => handleSelectIncident(incident)}
                >
                  <strong>{incident.incidentNumber}</strong>
                  <span>{formatOpenIncidentChoiceDetails(incident)}</span>
                </button>
              ))}
            </div>
          ) : null}
        </section>
        {selection.notice.length > 0 ? (
          <p className="form-status" role="status" aria-live="polite">
            {selection.notice}
          </p>
        ) : null}
        {incidentFeedStatus}
      </>
    );
  }

  return (
    <>
      <input
        name="incidentNumber"
        type="hidden"
        value={selectedIncident.incidentNumber}
        readOnly
      />
      <div
        ref={selectedIncidentCardRef}
        className="incident-close-selected"
        tabIndex={-1}
        aria-live="polite"
      >
        <div>
          <span>Выбранный инцидент</span>
          <strong>{selectedIncident.incidentNumber}</strong>
          <small>{formatOpenIncidentChoiceDetails(selectedIncident)}</small>
        </div>
        <button
          className="secondary-button"
          type="button"
          disabled={isSubmitting}
          onClick={handleResetIncidentSelection}
        >
          Выбрать другой
        </button>
      </div>
      <div className="dispatcher-form-fields">
        {closeFields.map((field) => (
          <DispatcherFormFieldInput field={field} key={field.name} />
        ))}
      </div>
      {incidentFeedStatus}
      <div className="form-actions">
        <button
          className="primary-button"
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <LoadingIndicator
              label="Отправляем…"
              variant="button"
            />
          ) : "Закрыть инцидент"}
        </button>
        {status.length > 0 ? <p className="form-status">{status}</p> : null}
      </div>
    </>
  );
}

function formatOpenIncidentChoiceDetails(
  incident: ReturnType<typeof buildOpenIncidentOptions>[number],
) {
  return [
    incident.location,
    incident.incidentType,
    incident.criticality,
    `открыт ${incident.openedAt}`,
  ]
    .filter(
      (value): value is string => value !== undefined && value.length > 0,
    )
    .join(" · ");
}

function DispatcherVisitorExitFormBody({
  isSubmitting,
  refreshVersion,
  status,
}: {
  isSubmitting: boolean;
  refreshVersion: number;
  status: string;
}) {
  const [visitorFeed, setVisitorFeed] = useState<DispatcherFeedLoadState>({
    status: "loading",
    message: "Загружаем посетителей.",
  });
  const submissions =
    visitorFeed.status === "ready" ? visitorFeed.submissions : [];
  const todayDate = getTodayDateValue();
  const openVisitors = buildOpenVisitorOptions(
    submissions,
    todayDate,
  );
  const isLocalVisitorFeed =
    visitorFeed.status === "ready" && visitorFeed.source === "local_test";

  useEffect(() => {
    let isActive = true;
    let currentController: AbortController | undefined;

    function loadVisitorFeed() {
      currentController?.abort();
      currentController = new AbortController();

      setVisitorFeed((current) =>
        current.status === "ready"
          ? current
          : {
              status: "loading",
              message: "Загружаем посетителей.",
            },
      );

      requestDispatcherFeed({
        limit: 2_000,
        localFallback: true,
        signal: currentController.signal,
      }).then((result) => {
        if (isActive) {
          setVisitorFeed(result);
        }
      });
    }

    loadVisitorFeed();
    const intervalId = window.setInterval(loadVisitorFeed, 10_000);

    return () => {
      isActive = false;
      currentController?.abort();
      window.clearInterval(intervalId);
    };
  }, [refreshVersion]);

  return (
    <>
      {visitorFeed.status === "loading" ? (
        <LoadingIndicator label={visitorFeed.message} variant="panel" />
      ) : null}
      <div className="dispatcher-form-fields dispatcher-form-fields-single">
        <label>
          <span>Посетитель</span>
          <select
            name="visitorEntryId"
            required
            defaultValue=""
            disabled={openVisitors.length === 0}
          >
            <option value="">
              {openVisitors.length === 0
                ? "Сегодня нет вошедших посетителей"
                : "Выберите посетителя"}
            </option>
            {openVisitors.map((visitor) => (
              <option value={visitor.entryId} key={visitor.entryId}>
                {visitor.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {visitorFeed.status === "error" ? (
        <p className="form-status">
          {readShortUserMessage(
            visitorFeed.message,
            "Не удалось загрузить посетителей.",
          )}
        </p>
      ) : null}
      {isLocalVisitorFeed ? (
        <p className="form-status form-status-local">
          Тестовый режим: список только на этом устройстве.
        </p>
      ) : null}
      <div className="form-actions">
        <button
          className="primary-button"
          type="submit"
          disabled={isSubmitting || openVisitors.length === 0}
        >
          {isSubmitting ? (
            <LoadingIndicator
              label="Отправляем…"
              variant="button"
            />
          ) : "Отметить выход"}
        </button>
        {status.length > 0 ? <p className="form-status">{status}</p> : null}
      </div>
    </>
  );
}

function DispatcherEquipmentFormBody({
  form,
  isSubmitting,
  refreshVersion,
  status,
  onLeaveGuardChange,
  onResetStatus,
}: {
  form: DispatcherFormDefinition;
  isSubmitting: boolean;
  refreshVersion: number;
  status: string;
  onLeaveGuardChange: (guard: FormLeaveGuard | undefined) => void;
  onResetStatus: () => void;
}) {
  const equipmentOptions = readEquipmentOptions(form);
  const [payload, setPayload] = useState(() =>
    buildInitialEquipmentFormPayload(form, equipmentOptions),
  );
  const [, setReportDraftVersion] = useState(0);
  const [equipmentLocalStatus, setEquipmentLocalStatus] = useState("");
  const [equipmentLocalStatusTone, setEquipmentLocalStatusTone] =
    useState<EquipmentLocalStatusTone>("info");
  const [equipmentUnsavedPrompt, setEquipmentUnsavedPrompt] = useState<
    | {
        equipment: string;
        onDiscard: () => void;
      }
    | undefined
  >(undefined);
  const [equipmentFeed, setEquipmentFeed] = useState<DispatcherFeedLoadState>({
    status: "loading",
    message: "Загружаем отметки.",
  });
  const selectedEquipment = payload.equipment ?? "";
  const reportDate = payload.reportDate ?? getTodayDateValue();
  const reportDateField = form.fields.find((field) => field.name === "reportDate");
  const equipmentFields = readDispatcherFieldsByVisualSize(
    form.fields.filter((field) => field.name !== "reportDate"),
  );
  const equipmentSubmissions =
    equipmentFeed.status === "ready" ? equipmentFeed.submissions : [];
  const completionMap = buildEquipmentCompletionMap(
    equipmentSubmissions,
    reportDate,
  );
  const doneCount = equipmentOptions.filter((equipment) =>
    completionMap.has(equipment),
  ).length;
  const reportPayloads = buildEquipmentReportPayloads({
    equipmentOptions,
    form,
    reportDate,
    storage: readBrowserEquipmentDraftStorage(),
  });
  const reportEquipmentNames = new Set(
    reportPayloads
      .map((item) => item.equipment?.trim())
      .filter((item): item is string => item !== undefined && item.length > 0),
  );
  const missingReportEquipmentCount = Math.max(
    equipmentOptions.length - reportPayloads.length,
    0,
  );
  const isEquipmentReportComplete =
    equipmentOptions.length > 0 && missingReportEquipmentCount === 0;
  const isLocalEquipmentFeed =
    equipmentFeed.status === "ready" && equipmentFeed.source === "local_test";
  const selectedReportPayload =
    selectedEquipment.length === 0
      ? {}
      : readEquipmentReportEntryPayload({
          equipment: selectedEquipment,
          form,
          reportDate,
          storage: readBrowserEquipmentDraftStorage(),
        });
  const selectedServerSubmission =
    selectedEquipment.length === 0
      ? undefined
      : completionMap.get(selectedEquipment);
  const selectedSavedPayload = hasEquipmentReportData(selectedReportPayload)
    ? selectedReportPayload
    : (selectedServerSubmission?.payload ?? {});
  const isSelectedEquipmentDirty =
    selectedEquipment.length > 0 &&
    hasEquipmentReportData(selectedSavedPayload) &&
    isEquipmentReportEntryDirty({
      currentPayload: payload,
      form,
      reportPayload: selectedSavedPayload,
    });
  const addEquipmentEntryButtonLabel = isSelectedEquipmentDirty
    ? "Обновить данные"
    : "Внести данные";
  const visibleEquipmentStatus =
    status.length > 0 ? status : equipmentLocalStatus;
  const isVisibleEquipmentStatusError =
    status.length === 0 && equipmentLocalStatusTone === "error";

  useEffect(() => {
    setPayload(
      buildInitialEquipmentFormPayload(form, equipmentOptions),
    );
    setReportDraftVersion((version) => version + 1);
    setEquipmentLocalStatus("");
    setEquipmentLocalStatusTone("info");
  }, [form, equipmentOptions]);

  useEffect(() => {
    if (!isSelectedEquipmentDirty || typeof window === "undefined") {
      return undefined;
    }

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isSelectedEquipmentDirty]);

  useEffect(() => {
    let isActive = true;
    let currentController: AbortController | undefined;

    function loadEquipmentFeed(showLoading: boolean) {
      currentController?.abort();
      currentController = new AbortController();

      setEquipmentFeed((current) =>
        !showLoading && current.status === "ready"
          ? current
          : {
              status: "loading",
              message: "Загружаем отметки.",
            },
      );

      requestDispatcherFeed({
        formId: "equipment",
        reportDate: reportDate.length > 0 ? reportDate : undefined,
        limit: 2_000,
        localFallback: true,
        signal: currentController.signal,
      }).then((result) => {
        if (isActive) {
          setEquipmentFeed(result);
        }
      });
    }

    loadEquipmentFeed(true);
    const intervalId = window.setInterval(
      () => loadEquipmentFeed(false),
      10_000,
    );

    return () => {
      isActive = false;
      currentController?.abort();
      window.clearInterval(intervalId);
    };
  }, [refreshVersion, reportDate]);

  useEffect(() => {
    if (
      equipmentFeed.status !== "ready" ||
      selectedEquipment.length === 0 ||
      selectedServerSubmission === undefined
    ) {
      return;
    }

    const storage = readBrowserEquipmentDraftStorage();
    const localReportPayload = readEquipmentReportEntryPayload({
      equipment: selectedEquipment,
      form,
      reportDate,
      storage,
    });
    const draftPayload = readEquipmentDraftPayload({
      equipment: selectedEquipment,
      form,
      reportDate,
      storage,
    });

    if (
      hasEquipmentReportData(localReportPayload) ||
      hasEquipmentReportData(draftPayload)
    ) {
      return;
    }

    setPayload((currentPayload) => {
      if (
        currentPayload.equipment !== selectedEquipment ||
        currentPayload.reportDate !== reportDate
      ) {
        return currentPayload;
      }

      return buildEquipmentFormPayload({
        equipment: selectedEquipment,
        form,
        savedDraft: selectedServerSubmission.payload,
        todayDate: reportDate,
      });
    });
  }, [
    equipmentFeed.status,
    form,
    reportDate,
    selectedEquipment,
    selectedServerSubmission,
  ]);

  useEffect(() => {
    onLeaveGuardChange(
      isSelectedEquipmentDirty ? handleDirtyEquipmentLeave : undefined,
    );

    return () => {
      onLeaveGuardChange(undefined);
    };
  }, [isSelectedEquipmentDirty, onLeaveGuardChange, payload, selectedEquipment]);

  function handleDirtyEquipmentLeave(continueAfterDiscard: () => void) {
    if (!isSelectedEquipmentDirty) {
      return true;
    }

    const storage = readBrowserEquipmentDraftStorage();
    const dirtyEquipment = selectedEquipment;
    const dirtyReportDate = reportDate;
    const dirtyServerSubmission = selectedServerSubmission;

    setEquipmentUnsavedPrompt({
      equipment: dirtyEquipment,
      onDiscard: () => {
        rollbackEquipmentEntryDraft({
          equipment: dirtyEquipment,
          reportDate: dirtyReportDate,
          serverSubmission: dirtyServerSubmission,
          storage,
        });
        setEquipmentUnsavedPrompt(undefined);
        continueAfterDiscard();
      },
    });
    onResetStatus();

    return false;
  }

  function handleEquipmentChange(equipment: string) {
    if (equipment === selectedEquipment) {
      return;
    }

    if (!handleDirtyEquipmentLeave(() => applyEquipmentChange(equipment))) {
      return;
    }

    applyEquipmentChange(equipment);
  }

  function applyEquipmentChange(equipment: string) {
    const storage = readBrowserEquipmentDraftStorage();

    if (equipment.length > 0) {
      writeLastEquipmentOption({
        equipment,
        storage,
      });
    }

    setPayload((currentPayload) => {
      return readEquipmentPayloadForSelection({
        equipment,
        reportDate: currentPayload.reportDate ?? getTodayDateValue(),
        serverSubmission: completionMap.get(equipment),
        storage,
      });
    });
    setEquipmentLocalStatus("");
    setEquipmentLocalStatusTone("info");
    setEquipmentUnsavedPrompt(undefined);
    onResetStatus();
  }

  function handleReportDateChange(value: string) {
    if (value === reportDate) {
      return;
    }

    if (!handleDirtyEquipmentLeave(() => applyReportDateChange(value))) {
      return;
    }

    applyReportDateChange(value);
  }

  function applyReportDateChange(nextReportDate: string) {
    const storage = readBrowserEquipmentDraftStorage();

    setPayload((currentPayload) => {
      const equipment = currentPayload.equipment ?? "";
      const nextCompletionMap = buildEquipmentCompletionMap(
        equipmentSubmissions,
        nextReportDate,
      );

      return readEquipmentPayloadForSelection({
        equipment,
        reportDate: nextReportDate,
        serverSubmission: nextCompletionMap.get(equipment),
        storage,
      });
    });
    setReportDraftVersion((version) => version + 1);
    setEquipmentLocalStatus("");
    setEquipmentLocalStatusTone("info");
    setEquipmentUnsavedPrompt(undefined);
    onResetStatus();
  }

  function showEquipmentLocalStatus(
    message: string,
    tone: EquipmentLocalStatusTone = "info",
  ) {
    setEquipmentLocalStatus(message);
    setEquipmentLocalStatusTone(tone);
  }

  function handleFieldChange(field: DispatcherFormField, value: string) {
    const nextValue = normalizeControlledFieldInput(value, field);

    updateEquipmentPayload(field, nextValue);
  }

  function handleFieldBlur(field: DispatcherFormField) {
    const currentValue = payload[field.name] ?? "";
    const nextValue =
      field.type === "number"
        ? normalizeDecimalNumberForPayload(currentValue) ?? ""
        : field.type === "integer"
          ? normalizeIntegerForPayload(currentValue) ?? ""
          : currentValue;

    updateEquipmentPayload(field, nextValue);
  }

  function updateEquipmentPayload(field: DispatcherFormField, value: string) {
    setPayload((current) => {
      const nextPayload = {
        ...current,
        [field.name]: value,
      };
      const equipment = nextPayload.equipment ?? "";

      if (field.name !== "reportDate" && equipment.length > 0) {
        writeEquipmentDraftPayload({
          equipment,
          form,
          payload: nextPayload,
          reportDate: nextPayload.reportDate ?? reportDate,
          storage: readBrowserEquipmentDraftStorage(),
        });
      }

      return nextPayload;
    });

    onResetStatus();
  }

  function readEquipmentPayloadForSelection({
    equipment,
    reportDate,
    serverSubmission,
    storage,
  }: {
    equipment: string;
    reportDate: string;
    serverSubmission: DispatcherSubmission | undefined;
    storage: DispatcherEquipmentDraftStorage | undefined;
  }) {
    const reportPayload =
      equipment.length === 0
        ? {}
        : readEquipmentReportEntryPayload({
            equipment,
            form,
            reportDate,
            storage,
          });
    const draftPayload =
      equipment.length === 0
        ? {}
        : readEquipmentDraftPayload({
            equipment,
            form,
            reportDate,
            storage,
          });
    const savedReportPayload = hasEquipmentReportData(reportPayload)
      ? reportPayload
      : (serverSubmission?.payload ?? {});
    const savedDraft =
      hasEquipmentReportData(savedReportPayload) &&
      (!hasEquipmentReportData(draftPayload) ||
        !isEquipmentReportEntryDirty({
          currentPayload: draftPayload,
          form,
          reportPayload: savedReportPayload,
        }))
        ? savedReportPayload
        : draftPayload;

    return buildEquipmentFormPayload({
      equipment,
      form,
      savedDraft,
      todayDate: reportDate,
    });
  }

  function rollbackEquipmentEntryDraft({
    equipment,
    reportDate,
    serverSubmission,
    storage,
  }: {
    equipment: string;
    reportDate: string;
    serverSubmission: DispatcherSubmission | undefined;
    storage: DispatcherEquipmentDraftStorage | undefined;
  }) {
    if (equipment.length === 0) {
      return;
    }

    const reportPayload = readEquipmentReportEntryPayload({
      equipment,
      form,
      reportDate,
      storage,
    });
    const savedPayload = hasEquipmentReportData(reportPayload)
      ? reportPayload
      : (serverSubmission?.payload ?? {});

    if (!hasEquipmentReportData(savedPayload)) {
      return;
    }

    writeEquipmentDraftPayload({
      equipment,
      form,
      payload: savedPayload,
      reportDate,
      storage,
    });
    setReportDraftVersion((version) => version + 1);
  }

  function saveEquipmentEntry(entryPayload: DispatcherSubmissionPayload) {
    const equipment = entryPayload.equipment ?? "";

    if (equipment.length === 0) {
      showEquipmentLocalStatus("Выберите оборудование.", "error");
      onResetStatus();
      return false;
    }

    if (!hasEquipmentReportData(entryPayload)) {
      showEquipmentLocalStatus(
        "Заполните данные по выбранному оборудованию.",
        "error",
      );
      onResetStatus();
      return false;
    }

    const validationMessage = validateDispatcherPayloadForSubmit(
      form,
      entryPayload,
    );

    if (validationMessage !== undefined) {
      showEquipmentLocalStatus(validationMessage, "error");
      onResetStatus();
      return false;
    }

    const storage = readBrowserEquipmentDraftStorage();
    const entryReportDate = entryPayload.reportDate ?? reportDate;
    const hadReportEntry =
      hasEquipmentReportData(
        readEquipmentReportEntryPayload({
          equipment,
          form,
          reportDate: entryReportDate,
          storage,
        }),
      ) ||
      buildEquipmentCompletionMap(equipmentSubmissions, entryReportDate).has(
        equipment,
      );

    writeEquipmentDraftPayload({
      equipment,
      form,
      payload: entryPayload,
      reportDate: entryReportDate,
      storage,
    });
    const isWritten = writeEquipmentReportEntryPayload({
      equipment,
      form,
      payload: entryPayload,
      reportDate: entryReportDate,
      storage,
    });

    showEquipmentLocalStatus(
      isWritten
        ? `${equipment}: ${hadReportEntry ? "данные обновлены" : "данные внесены"}.`
        : "Не удалось сохранить. Попробуйте ещё раз.",
      isWritten ? "info" : "error",
    );
    setReportDraftVersion((version) => version + 1);
    onResetStatus();

    return isWritten;
  }

  function handleAddEquipmentEntry() {
    if (saveEquipmentEntry(payload)) {
      setEquipmentUnsavedPrompt(undefined);
    }
  }

  return (
    <>
      {reportDateField === undefined ? (
        <input name="reportDate" type="hidden" value={reportDate} readOnly />
      ) : (
        <div className="equipment-report-settings">
          <label className="equipment-report-date-field">
            <span>{reportDateField.label}</span>
            <input
              name={reportDateField.name}
              type="date"
              required={reportDateField.required}
              value={reportDate}
              onChange={(event) =>
                handleReportDateChange(event.currentTarget.value)
              }
            />
          </label>
        </div>
      )}
      <div className="equipment-progress-panel" aria-label="Отметки оборудования">
        <div className="equipment-progress-header">
          <strong>
            Внесено в отчёт за {formatReportDateForDisplay(reportDate)}:{" "}
            {reportPayloads.length}/{equipmentOptions.length}
          </strong>
          <span>
            Сохранено: {doneCount}/{equipmentOptions.length}
          </span>
        </div>
        {equipmentFeed.status === "loading" ? (
          <LoadingIndicator label={equipmentFeed.message} variant="panel" />
        ) : null}
        <div className="equipment-status-grid">
          {equipmentOptions.map((equipment) => {
            const submission = completionMap.get(equipment);
            const isComplete = submission !== undefined;
            const isActive = equipment === selectedEquipment;
            const isInReport = reportEquipmentNames.has(equipment);
            const reportEntryPayload = readEquipmentReportEntryPayload({
              equipment,
              form,
              reportDate,
              storage: readBrowserEquipmentDraftStorage(),
            });
            const draftPayload = readEquipmentDraftPayload({
              equipment,
              form,
              reportDate,
              storage: readBrowserEquipmentDraftStorage(),
            });
            const hasDraft = hasEquipmentReportData(draftPayload);
            const isDraft = hasDraft && !isInReport && !isComplete;
            const savedPayload = hasEquipmentReportData(reportEntryPayload)
              ? reportEntryPayload
              : (submission?.payload ?? {});
            const isDirty =
              hasEquipmentReportData(savedPayload) &&
              isEquipmentReportEntryDirty({
                currentPayload: isActive ? payload : draftPayload,
                form,
                reportPayload: savedPayload,
              });

            return (
              <button
                className={[
                  "equipment-status-button",
                  isInReport && !isComplete ? "is-in-report" : "",
                  isComplete ? "is-complete" : "",
                  isDraft ? "is-draft" : "",
                  isDirty ? "is-dirty" : "",
                  isActive ? "is-active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                type="button"
                aria-pressed={isActive}
                key={equipment}
                onClick={() => handleEquipmentChange(equipment)}
              >
                <span>
                  {equipment}
                  {isDirty ? (
                    <strong
                      aria-label="Есть несохранённые изменения"
                      className="equipment-dirty-mark"
                    >
                      *
                    </strong>
                  ) : null}
                </span>
                <small>
                  {isDirty
                    ? "есть несохранённые правки"
                    : isInReport
                    ? submission === undefined
                      ? "внесено в отчёт"
                      : `в отчёте, сохранено ${formatDateTime(submission.receivedAt)}`
                    : submission !== undefined
                      ? `сохранено ${formatDateTime(submission.receivedAt)}`
                      : hasDraft
                        ? "черновик"
                        : "нет данных"}
                </small>
              </button>
            );
          })}
        </div>
        {equipmentFeed.status === "error" ? (
          <p className="form-status">
            {readShortUserMessage(
              equipmentFeed.message,
              "Не удалось загрузить отметки.",
            )}
          </p>
        ) : null}
        {isLocalEquipmentFeed ? (
          <p className="form-status form-status-local">
            Тестовый режим: отметки только на этом устройстве.
          </p>
        ) : null}
      </div>
      {equipmentUnsavedPrompt !== undefined ? (
        <div
          aria-live="polite"
          className="equipment-unsaved-alert"
          role="status"
        >
          <span>{equipmentUnsavedPrompt.equipment}: правки не сохранены.</span>
          <div className="equipment-unsaved-actions">
            <button
              className="secondary-button secondary-button-danger"
              type="button"
              onClick={equipmentUnsavedPrompt.onDiscard}
            >
              Сбросить
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setEquipmentUnsavedPrompt(undefined)}
            >
              Остаться
            </button>
          </div>
        </div>
      ) : null}
      <div className="dispatcher-form-fields">
        {equipmentFields.map((field) => (
          <DispatcherControlledFormFieldInput
            field={field}
            key={field.name}
            value={payload[field.name] ?? ""}
            onBlur={handleFieldBlur}
            onChange={
              field.name === "equipment"
                ? handleEquipmentChange
                : (value) => handleFieldChange(field, value)
            }
          />
        ))}
      </div>
      <div className="form-actions">
        <button
          className="secondary-button"
          type="button"
          disabled={isSubmitting}
          onClick={handleAddEquipmentEntry}
        >
          {addEquipmentEntryButtonLabel}
        </button>
        <button
          className="primary-button"
          type="submit"
          disabled={isSubmitting || !isEquipmentReportComplete}
          title={
            isEquipmentReportComplete
              ? "Отправить отчет начальству"
              : `Осталось внести позиций: ${missingReportEquipmentCount}`
          }
        >
          {isSubmitting ? (
            <LoadingIndicator
              label="Отправляем…"
              variant="button"
            />
          ) : "Отправить отчет начальству"}
        </button>
        {visibleEquipmentStatus.length > 0 ? (
          <p
            className={[
              "form-status",
              isVisibleEquipmentStatusError ? "form-status-error" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            role={isVisibleEquipmentStatusError ? "alert" : undefined}
          >
            {visibleEquipmentStatus}
          </p>
        ) : null}
      </div>
    </>
  );
}

function DispatcherControlledFormFieldInput({
  field,
  value,
  onBlur,
  onChange,
}: {
  field: DispatcherFormField;
  value: string;
  onBlur: (field: DispatcherFormField) => void;
  onChange: (value: string) => void;
}) {
  if (field.type === "textarea") {
    return (
      <label className="dispatcher-form-field-large">
        <span>{field.label}</span>
        <textarea
          name={field.name}
          rows={4}
          required={field.required}
          maxLength={readInputMaxLength(field)}
          value={value}
          onBlur={() => onBlur(field)}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      </label>
    );
  }

  if (field.type === "select") {
    return (
      <label>
        <span>{field.label}</span>
        <select
          name={field.name}
          required={field.required}
          value={value}
          onBlur={() => onBlur(field)}
          onChange={(event) => onChange(event.currentTarget.value)}
        >
          <option value="">Не выбрано</option>
          {(field.options ?? []).map((option) => (
            <option value={option} key={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label>
      <span>{field.label}</span>
      <input
        name={field.name}
        type={readInputType(field)}
        inputMode={readInputMode(field)}
        pattern={readInputPattern(field)}
        title={readInputTitle(field)}
        placeholder={readInputPlaceholder(field)}
        maxLength={readInputMaxLength(field)}
        required={field.required}
        value={value}
        onBlur={() => onBlur(field)}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
  );
}

function DispatcherFormFieldInput({
  defaultValue,
  field,
  focusOnMouseDown = false,
  options,
  readOnly = false,
  required,
  onValueChange,
}: {
  defaultValue?: string;
  field: DispatcherFormField;
  focusOnMouseDown?: boolean;
  options?: readonly string[];
  readOnly?: boolean;
  required?: boolean;
  onValueChange?: (value: string) => void;
}) {
  if (field.type === "textarea") {
    return (
      <label className="dispatcher-form-field-large">
        <span>{field.label}</span>
        <textarea
          name={field.name}
          rows={4}
          required={required ?? field.required}
          maxLength={readInputMaxLength(field)}
          onChange={(event) => {
            const nextValue = event.currentTarget.value;
            onValueChange?.(nextValue);
          }}
        />
      </label>
    );
  }

  if (field.type === "select") {
    return (
      <label>
        <span>{field.label}</span>
        <select
          name={field.name}
          required={required ?? field.required}
          defaultValue={defaultValue ?? ""}
          onChange={(event) => {
            const nextValue = event.currentTarget.value;
            onValueChange?.(nextValue);
          }}
        >
          <option value="">Не выбрано</option>
          {(options ?? field.options ?? []).map((option) => (
            <option value={option} key={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.type === "month") {
    return <DispatcherMonthFieldInput field={field} />;
  }

  return (
    <label>
      <span>{field.label}</span>
      <input
        name={field.name}
        type={readInputType(field)}
        inputMode={readInputMode(field)}
        pattern={readInputPattern(field)}
        title={readInputTitle(field)}
        placeholder={readInputPlaceholder(field)}
        maxLength={readInputMaxLength(field)}
        readOnly={readOnly}
        required={required ?? field.required}
        defaultValue={defaultValue ?? readInputDefaultValue(field)}
        onMouseDown={focusOnMouseDown
          ? (event) => {
              if (
                event.currentTarget.ownerDocument.activeElement !==
                event.currentTarget
              ) {
                event.preventDefault();
                event.currentTarget.focus({ preventScroll: true });
              }
            }
          : undefined}
        onChange={(event) => {
          if (field.type === "number") {
            event.currentTarget.value = normalizeDecimalNumberInput(
              event.currentTarget.value,
            );
          }

          if (field.type === "signed-number") {
            event.currentTarget.value = normalizeSignedDecimalNumberInput(
              event.currentTarget.value,
            );
          }

          if (field.type === "integer") {
            event.currentTarget.value = normalizeIntegerInput(
              event.currentTarget.value,
            );
          }

          const nextValue = event.currentTarget.value;
          onValueChange?.(nextValue);
        }}
        onBlur={(event) => {
          if (field.type === "number") {
            event.currentTarget.value =
              normalizeDecimalNumberForPayload(event.currentTarget.value) ?? "";
          }

          if (field.type === "signed-number") {
            event.currentTarget.value =
              normalizeSignedDecimalNumberForPayload(
                event.currentTarget.value,
              ) ?? "";
          }

          if (field.type === "integer") {
            event.currentTarget.value =
              normalizeIntegerForPayload(event.currentTarget.value) ?? "";
          }

          const nextValue = event.currentTarget.value;
          onValueChange?.(nextValue);
        }}
      />
    </label>
  );
}

function DispatcherMonthFieldInput({ field }: { field: DispatcherFormField }) {
  const [displayValue, setDisplayValue] = useState(() =>
    formatCanonicalMonthForDisplay(getCurrentMonthValue()) ?? "",
  );
  const normalizedValue = normalizeMonthValue(displayValue);
  const canonicalValue = isCanonicalMonthValue(normalizedValue)
    ? normalizedValue
    : "";

  function handleDisplayChange(value: string) {
    setDisplayValue(formatMonthDisplayInput(value));
  }

  function handleDisplayBlur() {
    const formatted = formatCanonicalMonthForDisplay(normalizedValue);

    if (formatted !== undefined) {
      setDisplayValue(formatted);
    }
  }

  function handleMonthStep(offset: number) {
    const baseValue =
      canonicalValue.length > 0 ? canonicalValue : getCurrentMonthValue();

    setDisplayValue(
      formatCanonicalMonthForDisplay(shiftMonthValue(baseValue, offset)) ?? "",
    );
  }

  return (
    <label className="month-input-label">
      <span>{field.label}</span>
      <input name={field.name} type="hidden" value={canonicalValue} readOnly />
      <div className="month-input-control">
        <button
          className="month-step-button"
          type="button"
          aria-label="Предыдущий месяц"
          title="Предыдущий месяц"
          onClick={() => handleMonthStep(-1)}
        >
          {"<"}
        </button>
        <input
          type="text"
          inputMode="numeric"
          pattern={monthDisplayInputPattern}
          title={monthDisplayInputTitle}
          placeholder="06.2026"
          maxLength={7}
          required={field.required}
          value={displayValue}
          onBlur={handleDisplayBlur}
          onChange={(event) => handleDisplayChange(event.currentTarget.value)}
        />
        <button
          className="month-step-button"
          type="button"
          aria-label="Следующий месяц"
          title="Следующий месяц"
          onClick={() => handleMonthStep(1)}
        >
          {">"}
        </button>
      </div>
    </label>
  );
}

export function DispatcherFeedPanel({
  dispatcherFeed,
  dispatcherForms,
  filters,
  onFiltersChange,
}: {
  dispatcherFeed: DispatcherFeedLoadState;
  dispatcherForms: DispatcherFormsLoadState;
  filters: DispatcherFeedFilterState;
  onFiltersChange: (patch: Partial<DispatcherFeedFilterState>) => void;
}) {
  const submissions =
    dispatcherFeed.status === "ready" ? dispatcherFeed.submissions : [];
  const isLocalTestMode =
    dispatcherFeed.status === "ready" && dispatcherFeed.source === "local_test";
  const selectedDateRange = {
    dateFrom: filters.dateFrom.length > 0 ? filters.dateFrom : undefined,
    dateTo: filters.dateTo.length > 0 ? filters.dateTo : undefined,
  };
  const showAllOpenIncidents =
    filters.group === "incidents" && filters.incidentView === "all_open";
  const equipmentRows = buildEquipmentSummaryRows(submissions, selectedDateRange);
  const productionTables = filterProductionReportTables(
    dispatcherFeed.status === "ready"
      ? dispatcherFeed.productionReportTables
      : emptyProductionReportTables,
    selectedDateRange,
  );
  const productionTableTotals =
    dispatcherFeed.status === "ready"
      ? dispatcherFeed.productionReportTableTotals
      : emptyProductionReportTableTotals;
  const bankContents =
    dispatcherFeed.status === "ready" ? dispatcherFeed.bankContents : [];
  const incidentRows = showAllOpenIncidents
    ? buildOpenIncidentRows(
        dispatcherFeed.status === "ready" ? dispatcherFeed.openIncidents : [],
      )
    : buildIncidentSummaryRows(submissions, selectedDateRange);
  const visitorRows = buildVisitorVisitRows(submissions, selectedDateRange);
  const productionForm =
    dispatcherForms.status === "ready"
      ? dispatcherForms.forms.find((form) => form.id === "production")
      : undefined;
  const visibleRowCount =
    filters.group === "equipment"
      ? equipmentRows.length
      : filters.group === "incidents"
        ? incidentRows.length
        : filters.group === "visitors"
          ? visitorRows.length
          : undefined;

  function handlePeriodChange(period: DispatcherFeedPeriod) {
    const range = buildDispatcherFeedDateRange(period);

    onFiltersChange({
      period,
      dateFrom: range.dateFrom ?? "",
      dateTo: range.dateTo ?? "",
      incidentView: "period",
    });
  }

  return (
    <section className="dispatcher-live-column" aria-label="Диспетчерская">
      <div className="dispatcher-feed-controls">
        <div className="dispatcher-feed-group-tabs" aria-label="Раздел данных">
          {[
            ["production", "Выработка"],
            ["equipment", "Оборудование"],
            ["incidents", "Инциденты"],
            ["visitors", "Посетители"],
          ].map(([group, label]) => (
            <button
              className={`dispatcher-feed-group-button ${
                filters.group === group ? "is-active" : ""
              }`}
              type="button"
              aria-pressed={filters.group === group}
              key={group}
              onClick={() =>
                onFiltersChange({ group: group as DispatcherFeedGroup })
              }
            >
              {label}
            </button>
          ))}
        </div>
        <div className="dispatcher-period-picker">
          <div
            className={`dispatcher-period-buttons ${
              filters.group === "incidents"
                ? "dispatcher-period-buttons-incidents"
                : ""
            }`}
            aria-label="Период данных"
          >
            {dispatcherFeedPeriodOptions.map((option) => (
              <button
                className={`dispatcher-period-button ${
                  filters.period === option.id && !showAllOpenIncidents
                    ? "is-active"
                    : ""
                }`}
                type="button"
                aria-pressed={
                  filters.period === option.id && !showAllOpenIncidents
                }
                key={option.id}
                onClick={() => handlePeriodChange(option.id)}
              >
                {option.label}
              </button>
            ))}
            {filters.group === "incidents" ? (
              <button
                className={`dispatcher-period-button ${
                  showAllOpenIncidents ? "is-active" : ""
                }`}
                type="button"
                aria-pressed={showAllOpenIncidents}
                onClick={() => onFiltersChange({ incidentView: "all_open" })}
              >
                Все незакрытые
              </button>
            ) : null}
          </div>
          {filters.period === "custom" && !showAllOpenIncidents ? (
            <div className="dispatcher-custom-date-range">
              <label>
                <span>С даты</span>
                <input
                  type="date"
                  value={filters.dateFrom}
                  max={filters.dateTo || undefined}
                  onChange={(event) => {
                    const dateFrom = event.currentTarget.value;
                    onFiltersChange({ dateFrom });
                  }}
                />
              </label>
              <label>
                <span>По дату</span>
                <input
                  type="date"
                  value={filters.dateTo}
                  min={filters.dateFrom || undefined}
                  onChange={(event) => {
                    const dateTo = event.currentTarget.value;
                    onFiltersChange({ dateTo });
                  }}
                />
              </label>
              <small>Без дат показываются данные за всё время.</small>
            </div>
          ) : null}
        </div>
      </div>
      {dispatcherFeed.status === "ready" ? (
        <div className="dispatcher-summary-strip" aria-label="Сводка регистраций">
          {filters.group === "production" ? null : (
            <span>Строк в таблице: {visibleRowCount}</span>
          )}
          <span>Обновлено: {formatDateTime(dispatcherFeed.receivedAt)}</span>
        </div>
      ) : null}
      {dispatcherFeed.status === "loading" ? (
        <LoadingIndicator label={dispatcherFeed.message} variant="page" />
      ) : null}
      {dispatcherFeed.status === "ready" &&
      dispatcherForms.status === "loading" &&
      filters.group === "production" ? (
        <LoadingIndicator label={dispatcherForms.message} variant="inline" />
      ) : null}
      {dispatcherForms.status === "error" ? (
        <p className="dispatcher-status-line">
          {readShortUserMessage(
            dispatcherForms.message,
            "Не удалось загрузить формы.",
          )}
        </p>
      ) : null}
      {isLocalTestMode ? (
        <p className="dispatcher-status-line dispatcher-status-line-local">
          Тестовый режим: данные только на этом устройстве.
        </p>
      ) : null}
      {dispatcherFeed.status === "error" ? (
        <p className="dispatcher-status-line">
          {readShortUserMessage(
            dispatcherFeed.message,
            "Не удалось загрузить историю.",
          )}
        </p>
      ) : null}
      {dispatcherFeed.status === "ready" && filters.group === "production" ? (
        <ProductionReportSummaryTable
          form={productionForm}
          tables={productionTables}
          totals={productionTableTotals}
          bankContents={bankContents}
          submissions={submissions}
        />
      ) : null}
      {dispatcherFeed.status === "ready" && filters.group === "equipment" ? (
        <EquipmentSummaryTable
          range={selectedDateRange}
          rows={equipmentRows}
          submissions={submissions}
        />
      ) : null}
      {dispatcherFeed.status === "ready" && filters.group === "incidents" ? (
        <IncidentSummaryTable
          rows={incidentRows}
          showAllOpen={showAllOpenIncidents}
        />
      ) : null}
      {dispatcherFeed.status === "ready" && filters.group === "visitors" ? (
        <VisitorSummaryTable rows={visitorRows} />
      ) : null}
    </section>
  );
}

const productionReportSectionOptions: readonly {
  id: ProductionReportSection;
  label: string;
}[] = [
  { id: "forming", label: "Формовка" },
  { id: "sorting", label: "Сортировка" },
  { id: "unformed", label: "Неформованная продукция" },
  { id: "chamotte", label: "Цех обжига шамота" },
  { id: "jars", label: "Замеры банок" },
  { id: "granulation", label: "Участок грануляции" },
];

const legacyProductionDetailFields: readonly DispatcherFormField[] = [
  {
    name: "formingPlan",
    label: "Формовка — План (старое поле)",
    type: "number",
    required: false,
  },
  {
    name: "formingProductBrands",
    label: "Формовка — Марки изделий (старое поле)",
    type: "text",
    required: false,
  },
  {
    name: "sortingPlan",
    label: "Сортировка — План (старое поле)",
    type: "number",
    required: false,
  },
  {
    name: "sortingProductBrands",
    label: "Сортировка — Марки изделий (старое поле)",
    type: "text",
    required: false,
  },
  {
    name: "formingMonth",
    label: "Формовка — Месяц (старое поле)",
    type: "number",
    required: false,
  },
  {
    name: "formingDeviation",
    label: "Формовка — Отклонение (старое поле)",
    type: "signed-number",
    required: false,
  },
  {
    name: "sortingMonth",
    label: "Сортировка — Месяц (старое поле)",
    type: "number",
    required: false,
  },
  {
    name: "sortingDeviation",
    label: "Сортировка — Отклонение (старое поле)",
    type: "signed-number",
    required: false,
  },
  ...[1, 2, 3, 4].flatMap(
    (rowNumber): DispatcherFormField[] => [
      {
        name: `unformedPlan${rowNumber}`,
        label: `Неформованная продукция — Строка ${rowNumber}, план (старое поле)`,
        type: "number",
        required: false,
      },
      {
        name: `unformedMonth${rowNumber}`,
        label: `Неформованная продукция — Строка ${rowNumber}, месяц (старое поле)`,
        type: "number",
        required: false,
      },
      {
        name: `unformedDeviation${rowNumber}`,
        label: `Неформованная продукция — Строка ${rowNumber}, отклонение (старое поле)`,
        type: "signed-number",
        required: false,
      },
    ],
  ),
  {
    name: "chamottePlan1",
    label: "Цех обжига шамота — План (старое поле)",
    type: "number",
    required: false,
  },
  {
    name: "chamotteMonth1",
    label: "Цех обжига шамота — Месяц (старое поле)",
    type: "number",
    required: false,
  },
  {
    name: "chamotteDeviation1",
    label: "Цех обжига шамота — Отклонение (старое поле)",
    type: "signed-number",
    required: false,
  },
  {
    name: "granulationRawOutputTons",
    label: "Участок грануляции — Выпуск сырцовой гранулы, тонн (старое поле)",
    type: "number",
    required: false,
  },
  {
    name: "granulationFraction1600Day",
    label: "Участок грануляции — Фракция 16/30, сутки (старое поле)",
    type: "number",
    required: false,
  },
  {
    name: "granulationFraction1600Month",
    label: "Участок грануляции — Фракция 16/30, месяц (старое поле)",
    type: "number",
    required: false,
  },
  {
    name: "granulationSamplesDay",
    label: "Участок грануляции — Фракция 12/18, сутки (старое поле)",
    type: "number",
    required: false,
  },
  {
    name: "granulationSamplesMonth",
    label: "Участок грануляции — Фракция 12/18, месяц (старое поле)",
    type: "number",
    required: false,
  },
  ...[1, 2, 3].map(
    (jarNumber): DispatcherFormField => ({
      name: `jarMeasurement${jarNumber}`,
      label: `Замеры банок — Банка ${jarNumber} (старый замер)`,
      type: "text",
      required: false,
    }),
  ),
];

export function ProductionReportSummaryTable({
  form,
  tables,
  totals,
  bankContents,
  submissions,
}: {
  form: DispatcherFormDefinition | undefined;
  tables: ProductionReportTables;
  totals: ProductionReportTableTotals;
  bankContents: readonly DispatcherProductionBankContent[];
  submissions: DispatcherSubmission[];
}) {
  const firstAvailableSection = productionReportSectionOptions.find(
    (option) => tables[option.id].length > 0,
  )?.id;
  const [section, setSection] = useState<ProductionReportSection>(
    () => firstAvailableSection ?? "forming",
  );
  const [formingBrandQuery, setFormingBrandQuery] = useState("");
  const [sortingBrandQuery, setSortingBrandQuery] = useState("");
  const hadAvailableSectionRef = useRef(firstAvailableSection !== undefined);
  const [detailReportId, setDetailReportId] = useState<string>();
  const filteredFormingRows = filterProductionBrandCategoryRows(
    tables.forming,
    formingBrandQuery,
  );
  const filteredSortingRows = filterProductionBrandCategoryRows(
    tables.sorting,
    sortingBrandQuery,
  );
  const selectedRows = (
    section === "forming"
      ? filteredFormingRows
      : section === "sorting"
        ? filteredSortingRows
        : tables[section]
  ) as ProductionReportBaseRow[];
  const detailRow = selectedRows.find(
    (row) => row.reportId === detailReportId,
  );
  const detailSubmission = submissions.find(
    (submission) =>
      submission.formId === "production" && submission.id === detailReportId,
  );

  useEffect(() => {
    if (
      !hadAvailableSectionRef.current &&
      firstAvailableSection !== undefined &&
      selectedRows.length === 0
    ) {
      setSection(firstAvailableSection);
    }

    hadAvailableSectionRef.current = firstAvailableSection !== undefined;
  }, [firstAvailableSection, selectedRows.length]);

  useEffect(() => {
    if (
      detailReportId !== undefined &&
      !selectedRows.some((row) => row.reportId === detailReportId)
    ) {
      setDetailReportId(undefined);
    }
  }, [detailReportId, selectedRows]);

  useEffect(() => {
    if (detailReportId === undefined) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDetailReportId(undefined);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [detailReportId]);

  if (
    !productionReportSectionOptions.some(
      (option) => tables[option.id].length > 0,
    )
  ) {
    return (
      <p className="dispatcher-status-line">
        Нет отчётов по выработке для выбранного периода.
      </p>
    );
  }

  return (
    <>
      <div
        className="production-dashboard-section-tabs"
        aria-label="Таблицы выработки"
      >
        {productionReportSectionOptions.map((option) => (
          <button
            className={`dispatcher-feed-group-button ${
              section === option.id ? "is-active" : ""
            }`}
            type="button"
            aria-pressed={section === option.id}
            key={option.id}
            onClick={() => setSection(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {section === "forming" || section === "sorting" ? (
        <label className="production-dashboard-brand-filter">
          <span>Фильтр по марке</span>
          <input
            aria-label="Фильтр по марке"
            type="search"
            value={
              section === "forming" ? formingBrandQuery : sortingBrandQuery
            }
            placeholder="Введите марку"
            onChange={(event) => {
              const query = event.currentTarget.value;

              if (section === "forming") {
                setFormingBrandQuery(query);
              } else {
                setSortingBrandQuery(query);
              }
            }}
          />
        </label>
      ) : null}

      <p className="production-dashboard-row-count">
        Строк в таблице: {selectedRows.length}
      </p>

      {selectedRows.length === 0 ? (
        <p className="dispatcher-status-line">
          Нет данных для выбранной таблицы и периода.
        </p>
      ) : section === "forming" ||
        section === "sorting" ||
        section === "unformed" ||
        section === "chamotte" ? (
        <ProductionBrandDashboardTable
          rows={
            section === "forming"
              ? filteredFormingRows
              : section === "sorting"
                ? filteredSortingRows
                : tables[section]
          }
          totals={
            section === "forming" && formingBrandQuery.trim() !== ""
              ? buildProductionBrandCategoryTotals(filteredFormingRows)
              : section === "sorting" && sortingBrandQuery.trim() !== ""
                ? buildProductionBrandCategoryTotals(filteredSortingRows)
              : totals[section]
          }
          formAvailable={form !== undefined}
          onOpen={setDetailReportId}
        />
      ) : section === "jars" ? (
        <ProductionJarDashboardTable
          rows={tables.jars}
          totals={totals.jars}
          bankContents={bankContents}
          formAvailable={form !== undefined}
          onOpen={setDetailReportId}
        />
      ) : (
        <ProductionGranulationDashboardTable
          rows={tables.granulation}
          totals={totals.granulation}
          formAvailable={form !== undefined}
          onOpen={setDetailReportId}
        />
      )}

      {form !== undefined &&
      detailRow !== undefined &&
      detailSubmission !== undefined ? (
        <ProductionReportDetailModal
          form={form}
          row={detailRow}
          submission={detailSubmission}
          onClose={() => setDetailReportId(undefined)}
        />
      ) : null}
    </>
  );
}

function ProductionBrandDashboardTable({
  rows,
  totals,
  formAvailable,
  onOpen,
}: {
  rows: ProductionBrandCategoryRow[];
  totals: ProductionBrandCategoryTotals;
  formAvailable: boolean;
  onOpen: (reportId: string) => void;
}) {
  return (
    <div className="production-dashboard-table-wrap history-table-scroll">
      <table className="production-dashboard-table production-dashboard-brand-table">
        <thead>
          <tr className="production-dashboard-totals-row">
            <th scope="row">Итого:</th>
            <td>—</td>
            <td>{formatOptionalNumber(totals.dayPlan)}</td>
            <td>{formatOptionalNumber(totals.dayFact)}</td>
            <td>{formatOptionalNumber(totals.monthPlan)}</td>
            <td>{formatOptionalNumber(totals.monthFact)}</td>
            <td>{formatOptionalNumber(totals.deviation)}</td>
          </tr>
          <tr className="production-dashboard-headings-row">
            <th scope="col">Дата</th>
            <th scope="col">Марка</th>
            <th scope="col">Сутки, план</th>
            <th scope="col">Сутки, факт</th>
            <th scope="col">Месяц, план</th>
            <th scope="col">Месяц, факт</th>
            <th scope="col">Разница</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.reportId}>
              <td>
                <ProductionReportDateButton
                  row={row}
                  formAvailable={formAvailable}
                  onOpen={onOpen}
                />
              </td>
              <td>
                {row.facts.length === 0
                  ? "—"
                  : row.facts.map((fact) => fact.brand).join("; ")}
              </td>
              <td>{formatOptionalNumber(row.dayPlan)}</td>
              <td>{formatOptionalNumber(row.dayFact)}</td>
              <td>{formatOptionalNumber(row.monthPlan)}</td>
              <td>{formatOptionalNumber(row.monthFact)}</td>
              <td>{formatOptionalNumber(row.deviation)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProductionJarDashboardTable({
  rows,
  totals,
  bankContents,
  formAvailable,
  onOpen,
}: {
  rows: ProductionJarMeasurementRow[];
  totals: ProductionJarMeasurementTotals;
  bankContents: readonly DispatcherProductionBankContent[];
  formAvailable: boolean;
  onOpen: (reportId: string) => void;
}) {
  const materialByBankNumber = new Map<number, string>(
    bankContents.map((content) => [content.bankNumber, content.materialLabel]),
  );
  return (
    <div className="production-dashboard-table-wrap history-table-scroll">
      <table className="production-dashboard-table">
        <thead>
          <tr className="production-dashboard-totals-row">
            <th scope="row">Итого:</th>
            <td>—</td>
            <td>—</td>
            <td>{formatOptionalNumber(totals.start)}</td>
            <td>{formatOptionalNumber(totals.end)}</td>
            <td>{formatOptionalNumber(totals.consumption)}</td>
          </tr>
          <tr className="production-dashboard-headings-row">
            <th scope="col">Дата</th>
            <th scope="col">Банка</th>
            <th scope="col">Содержимое</th>
            <th scope="col">Начало дня</th>
            <th scope="col">Конец дня</th>
            <th scope="col">Расход</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.reportId}-${row.jarNumber}`}>
              <td>
                <ProductionReportDateButton
                  row={row}
                  formAvailable={formAvailable}
                  onOpen={onOpen}
                />
              </td>
              <td>{row.jarNumber}</td>
              <td>
                {materialByBankNumber.get(row.jarNumber) ?? "Не назначено"}
              </td>
              <td>{formatOptionalNumber(row.start)}</td>
              <td>{formatOptionalNumber(row.end)}</td>
              <td>{formatOptionalNumber(row.consumption)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProductionGranulationDashboardTable({
  rows,
  totals,
  formAvailable,
  onOpen,
}: {
  rows: ProductionGranulationRow[];
  totals: ProductionGranulationTotals;
  formAvailable: boolean;
  onOpen: (reportId: string) => void;
}) {
  return (
    <div className="production-dashboard-table-wrap history-table-scroll">
      <table className="production-dashboard-table production-dashboard-granulation-table">
        <thead>
          <tr className="production-dashboard-totals-row">
            <th scope="row">Итого:</th>
            <td>{formatOptionalNumber(totals.platesInOperation)}</td>
            <td>{formatOptionalNumber(totals.millHours)}</td>
            <td>{formatOptionalNumber(totals.fraction1630Day)}</td>
            <td>{formatOptionalNumber(totals.fraction1630Month)}</td>
            <td>{formatOptionalNumber(totals.fraction1218Day)}</td>
            <td>{formatOptionalNumber(totals.fraction1218Month)}</td>
          </tr>
          <tr className="production-dashboard-headings-row">
            <th scope="col">Дата</th>
            <th scope="col">Тарелок в работе</th>
            <th scope="col">Мельница, ч</th>
            <th scope="col">16/30, сутки</th>
            <th scope="col">16/30, месяц</th>
            <th scope="col">12/18, сутки</th>
            <th scope="col">12/18, месяц</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.reportId}>
              <td>
                <ProductionReportDateButton
                  row={row}
                  formAvailable={formAvailable}
                  onOpen={onOpen}
                />
              </td>
              <td>{formatOptionalNumber(row.platesInOperation)}</td>
              <td>{formatOptionalNumber(row.millHours)}</td>
              <td>{formatOptionalNumber(row.fraction1630Day)}</td>
              <td>{formatOptionalNumber(row.fraction1630Month)}</td>
              <td>{formatOptionalNumber(row.fraction1218Day)}</td>
              <td>{formatOptionalNumber(row.fraction1218Month)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProductionReportDateButton({
  row,
  formAvailable,
  onOpen,
}: {
  row: ProductionReportBaseRow;
  formAvailable: boolean;
  onOpen: (reportId: string) => void;
}) {
  return (
    <button
      className="production-detail-trigger"
      type="button"
      aria-haspopup="dialog"
      disabled={!formAvailable}
      title={
        formAvailable
          ? "Открыть полный отчёт"
          : "Форма выработки пока недоступна"
      }
      onClick={() => onOpen(row.reportId)}
    >
      {formatReportDateForDisplay(row.reportDate)}
    </button>
  );
}

function ProductionReportDetailModal({
  form,
  row,
  submission,
  onClose,
}: {
  form: DispatcherFormDefinition;
  row: ProductionReportBaseRow;
  submission: DispatcherSubmission;
  onClose: () => void;
}) {
  const currentFieldNames = new Set(form.fields.map((field) => field.name));
  const visibleFields = [
    ...form.fields,
    ...readDynamicProductionDetailFields(submission.payload),
    ...legacyProductionDetailFields.filter(
      (field) => !currentFieldNames.has(field.name),
    ),
  ].filter((field) => {
    const value = submission.payload[field.name]?.trim();

    return field.name !== "reportDate" && value !== undefined && value.length > 0;
  });

  return (
    <div
      className="admin-db-modal-backdrop equipment-detail-modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <section
        className="equipment-detail-modal production-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="production-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="equipment-detail-header">
          <div>
            <strong id="production-detail-title">
              Отчёт по выработке за {formatReportDateForDisplay(row.reportDate)}
            </strong>
            <small>Обновлено: {formatDateTime(row.receivedAt)}</small>
          </div>
          <button className="secondary-button" type="button" onClick={onClose}>
            Закрыть
          </button>
        </div>

        {visibleFields.length === 0 ? (
          <p className="dispatcher-status-line">
            В отчёте нет заполненных показателей.
          </p>
        ) : (
          <div className="production-detail-grid" aria-label="Показатели выработки">
            {visibleFields.map((field) => (
              <div key={field.name}>
                <small>{field.label}</small>
                <strong>
                  {formatProductionFieldValue(
                    field,
                    submission.payload[field.name],
                  )}
                </strong>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function readDynamicProductionDetailFields(
  payload: DispatcherSubmissionPayload,
): DispatcherFormField[] {
  return Object.keys(payload).flatMap((fieldName) => {
    const match = /^(forming|sorting|unformed|chamotte)(Brand|Fact)([1-9]\d?)$/u.exec(
      fieldName,
    );

    if (match === null || Number(match[3]) > 50) return [];

    const section = productionCategoryLabels[match[1] as ProductionCategory];
    const metric = match[2] === "Brand" ? "Марка" : "Факт";

    return [{
      name: fieldName,
      label: `${section} — ${metric} ${match[3]}`,
      type: match[2] === "Brand" ? "text" as const : "number" as const,
      required: false,
    }];
  });
}

function EquipmentSummaryTable({
  range,
  rows,
  submissions,
}: {
  range: Parameters<typeof buildEquipmentSummaryRows>[1];
  rows: ReturnType<typeof buildEquipmentSummaryRows>;
  submissions: DispatcherSubmission[];
}) {
  const [detailEquipment, setDetailEquipment] = useState<string>();
  const detailSummary =
    detailEquipment === undefined
      ? undefined
      : rows.find((row) => row.equipment === detailEquipment);
  const detailRows =
    detailEquipment === undefined
      ? []
      : buildEquipmentDetailRows(submissions, detailEquipment, range);

  useEffect(() => {
    if (
      detailEquipment !== undefined &&
      !rows.some((row) => row.equipment === detailEquipment)
    ) {
      setDetailEquipment(undefined);
    }
  }, [detailEquipment, rows]);

  useEffect(() => {
    if (detailEquipment === undefined) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDetailEquipment(undefined);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [detailEquipment]);

  if (rows.length === 0) {
    return <p className="dispatcher-status-line">Нет данных по оборудованию.</p>;
  }

  return (
    <>
      <div className="dispatcher-feed-table history-table-scroll" role="table">
        <div className="dispatcher-feed-row dispatcher-feed-row-equipment dispatcher-feed-head history-table-head" role="row">
          <span role="columnheader">Оборудование</span>
          <span role="columnheader">Выработка</span>
          <span role="columnheader">Простой</span>
          <span role="columnheader">Причины простоя</span>
        </div>
        {rows.map((row) => (
          <div
            className="dispatcher-feed-row dispatcher-feed-row-equipment"
            role="row"
            key={row.equipment}
          >
            <span role="cell">
              <button
                className="equipment-detail-trigger"
                type="button"
                aria-haspopup="dialog"
                onClick={() => setDetailEquipment(row.equipment)}
              >
                {row.equipment}
              </button>
            </span>
            <span role="cell">{formatNumber(row.productionTons)} т</span>
            <span role="cell">{formatNumber(row.downtimeHours)} ч</span>
            <span role="cell">{formatDowntimeReasons(row.downtimeReasons)}</span>
          </div>
        ))}
      </div>

      {detailEquipment !== undefined && detailSummary !== undefined ? (
        <EquipmentDetailModal
          equipment={detailEquipment}
          range={range}
          rows={detailRows}
          summary={detailSummary}
          onClose={() => setDetailEquipment(undefined)}
        />
      ) : null}
    </>
  );
}

function EquipmentDetailModal({
  equipment,
  range,
  rows,
  summary,
  onClose,
}: {
  equipment: string;
  range: Parameters<typeof buildEquipmentSummaryRows>[1];
  rows: ReturnType<typeof buildEquipmentDetailRows>;
  summary: ReturnType<typeof buildEquipmentSummaryRows>[number];
  onClose: () => void;
}) {
  return (
    <div
      className="admin-db-modal-backdrop equipment-detail-modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <section
        className="equipment-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="equipment-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="equipment-detail-header">
          <div>
            <strong id="equipment-detail-title">{equipment}</strong>
            <small>{formatEquipmentDetailPeriod(range)}</small>
          </div>
          <button className="secondary-button" type="button" onClick={onClose}>
            Закрыть
          </button>
        </div>

        <div className="equipment-detail-totals" aria-label="Итоги оборудования">
          <span>
            <strong>{formatNumber(summary.productionTons)} т</strong>
            <small>Выработка</small>
          </span>
          <span>
            <strong>{formatNumber(summary.downtimeHours)} ч</strong>
            <small>Простой</small>
          </span>
          <span>
            <strong>{formatDowntimeReasons(summary.downtimeReasons)}</strong>
            <small>Причины</small>
          </span>
        </div>

        {rows.length === 0 ? (
          <p className="dispatcher-status-line">
            Нет дневных строк для выбранного оборудования.
          </p>
        ) : (
          <div className="equipment-detail-table history-table-scroll" role="table">
            <div className="equipment-detail-row equipment-detail-head history-table-head" role="row">
              <span role="columnheader">Дата отчета</span>
              <span role="columnheader">Выработка</span>
              <span role="columnheader">Простой</span>
              <span role="columnheader">Причины</span>
              <span role="columnheader">Примечание</span>
              <span role="columnheader">Обновлено</span>
            </div>
            {rows.map((row) => (
              <div className="equipment-detail-row" role="row" key={row.reportDate}>
                <span role="cell">
                  <strong>{formatReportDateForDisplay(row.reportDate)}</strong>
                  {row.submissionCount > 1 ? (
                    <small>{row.submissionCount} записи</small>
                  ) : null}
                </span>
                <span role="cell">{formatNumber(row.productionTons)} т</span>
                <span role="cell">{formatNumber(row.downtimeHours)} ч</span>
                <span role="cell">{formatDowntimeReasons(row.downtimeReasons)}</span>
                <span role="cell">
                  {row.notes.length === 0 ? "Нет" : row.notes.join(" · ")}
                </span>
                <span role="cell">{formatDateTime(row.receivedAt)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function formatDowntimeReasons(
  reasons: { reason: string; hours: number }[],
) {
  if (reasons.length === 0) {
    return "Нет отмеченных причин";
  }

  return reasons
    .map((item) => `${item.reason}: ${formatNumber(item.hours)} ч`)
    .join(" · ");
}

function formatEquipmentDetailPeriod(
  range: Parameters<typeof buildEquipmentSummaryRows>[1],
) {
  if (range.dateFrom !== undefined && range.dateTo !== undefined) {
    return `Период: ${formatDateOnly(range.dateFrom)} - ${formatDateOnly(range.dateTo)}`;
  }

  if (range.dateFrom !== undefined) {
    return `С даты: ${formatDateOnly(range.dateFrom)}`;
  }

  if (range.dateTo !== undefined) {
    return `По дату: ${formatDateOnly(range.dateTo)}`;
  }

  return "Все доступные даты";
}

function IncidentSummaryTable({
  rows,
  showAllOpen,
}: {
  rows: ReturnType<typeof buildIncidentSummaryRows>;
  showAllOpen: boolean;
}) {
  if (rows.length === 0) {
    return (
      <p className="dispatcher-status-line">
        {showAllOpen
          ? "Незакрытых инцидентов нет."
          : "Нет инцидентов для выбранного периода."}
      </p>
    );
  }

  return (
    <div className="dispatcher-feed-table history-table-scroll" role="table">
      <div className="dispatcher-feed-row dispatcher-feed-row-incidents dispatcher-feed-head history-table-head" role="row">
        <span role="columnheader">№</span>
        <span role="columnheader">Статус</span>
        <span role="columnheader">Открыт</span>
        <span role="columnheader">Закрыт</span>
        <span role="columnheader">Описание</span>
      </div>
      {rows.map((row) => (
        <div
          className="dispatcher-feed-row dispatcher-feed-row-incidents"
          role="row"
          key={row.incidentNumber}
        >
          <span role="cell">{row.incidentNumber}</span>
          <span role="cell">
            {row.status === "closed" ? "Закрыт" : "Открыт"}
          </span>
          <span role="cell">{row.openedAt}</span>
          <span role="cell">{row.closedAt ?? "Ещё не закрыт"}</span>
          <span role="cell">
            {[row.location, row.incidentType, row.criticality, row.description]
              .filter((value): value is string => value !== undefined)
              .join(" · ")}
          </span>
        </div>
      ))}
    </div>
  );
}

function VisitorSummaryTable({ rows }: { rows: ReturnType<typeof buildVisitorVisitRows> }) {
  if (rows.length === 0) {
    return <p className="dispatcher-status-line">Нет входов посетителей за выбранный день.</p>;
  }

  return (
    <div className="dispatcher-feed-table history-table-scroll" role="table">
      <div className="dispatcher-feed-row dispatcher-feed-row-visitors dispatcher-feed-head history-table-head" role="row">
        <span role="columnheader">Посетитель</span>
        <span role="columnheader">Организация</span>
        <span role="columnheader">Кого посещает</span>
        <span role="columnheader">Вход</span>
        <span role="columnheader">Выход</span>
      </div>
      {rows.map((row) => (
        <div
          className="dispatcher-feed-row dispatcher-feed-row-visitors"
          role="row"
          key={row.entryId}
        >
          <span role="cell">{row.fio}</span>
          <span role="cell">{row.organization ?? "Не указана"}</span>
          <span role="cell">{row.whom ?? "Не указано"}</span>
          <span role="cell">{row.entryAt}</span>
          <span role="cell">{row.exitAt ?? "Время выхода не отмечено"}</span>
        </div>
      ))}
    </div>
  );
}

function AdminWorkspace({
  profile,
  activeTab,
  onShowToast,
  onProductionSnapshotSynchronized,
  onSelectAccountView,
}: {
  profile: ServerUserProfile;
  activeTab: AdminTab;
  onShowToast: ShowToast;
  onProductionSnapshotSynchronized: () => void;
  onSelectAccountView: (account: AdminAccountSummary) => void;
}) {
  if (activeTab === "database") {
    return (
      <AdminDatabaseWorkspace
        profile={profile}
        onShowToast={onShowToast}
        onProductionSnapshotSynchronized={
          onProductionSnapshotSynchronized
        }
      />
    );
  }

  if (activeTab === "accounts") {
    return (
      <AdminAccountsWorkspace profile={profile} onShowToast={onShowToast} />
    );
  }

  if (activeTab === "user_actions") {
    return <UserActionsWorkspace profile={profile} />;
  }

  return <AdminAccountPreviewWorkspace onSelectAccountView={onSelectAccountView} />;
}

const adminAuditPageLimit = 50;
const adminAuditCategoryOptions: readonly {
  id: "all" | AuditEventCategory;
  label: string;
}[] = [
  { id: "all", label: "Все действия" },
  { id: "authentication", label: "Входы и выходы" },
  { id: "form_submission", label: "Отправки форм" },
  { id: "data_change", label: "Изменения данных" },
  { id: "administration", label: "Административные" },
  { id: "navigation", label: "Просмотры" },
];

function UserActionsPreviewNotice() {
  return (
    <section className="admin-workspace" aria-label="Действия пользователей">
      <p className="dispatcher-status-line">
        Отчёт доступен после входа в учётную запись руководителя.
      </p>
    </section>
  );
}

function UserActionsWorkspace({ profile }: { profile: ServerUserProfile }) {
  const canViewPlatformAudit = hasCapability(profile, "platform.view_audit");
  const canViewAudit =
    canViewPlatformAudit ||
    hasCapability(profile, "business.view_user_actions");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [selectedCategory, setSelectedCategory] =
    useState<"all" | AuditEventCategory>("all");
  const [offset, setOffset] = useState(0);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [knownActors, setKnownActors] = useState<UserActivityActor[]>([]);
  const [reportState, setReportState] = useState<AdminAuditLoadState>({
    status: "loading",
    message: "Загружаем действия пользователей.",
  });
  const [isReportLoading, setIsReportLoading] = useState(true);
  const preserveReportOnNextLoadRef = useRef(false);

  useEffect(() => {
    if (!canViewAudit) {
      setIsReportLoading(false);
      setReportState({
        status: "error",
        message: "Просмотр действий пользователей недоступен.",
      });
      return;
    }

    const controller = new AbortController();
    const shouldPreserveReport = preserveReportOnNextLoadRef.current;
    preserveReportOnNextLoadRef.current = false;
    setIsReportLoading(true);
    setReportState((current) =>
      shouldPreserveReport && current.status === "ready"
        ? current
        : {
            status: "loading",
            message: "Загружаем действия пользователей.",
          },
    );

    requestAdminAuditReport({
      actorAccountId: selectedAccountId || undefined,
      category: selectedCategory === "all" ? undefined : selectedCategory,
      limit: adminAuditPageLimit,
      offset,
      showTechnicalDetails: canViewPlatformAudit,
      signal: controller.signal,
    }).then((result) => {
      if (controller.signal.aborted) {
        return;
      }

      setIsReportLoading(false);
      setReportState(result);
      if (result.status === "ready") {
        setKnownActors(result.actors);
      }
    });

    return () => controller.abort();
  }, [
    canViewAudit,
    canViewPlatformAudit,
    selectedAccountId,
    selectedCategory,
    offset,
    refreshVersion,
  ]);

  if (!canViewAudit) {
    return (
      <section className="admin-workspace" aria-label="Действия пользователей">
        <p className="dispatcher-status-line">
          Просмотр действий пользователей недоступен.
        </p>
      </section>
    );
  }

  function startReportQueryLoad() {
    setIsReportLoading(true);
    setReportState({
      status: "loading",
      message: "Загружаем действия пользователей.",
    });
  }

  const report = reportState.status === "ready" ? reportState : undefined;
  const total = report?.summary.total ?? 0;
  const canGoForward = report !== undefined && offset + report.events.length < total;

  return (
    <section
      className="admin-workspace admin-audit-workspace"
      aria-label="Действия пользователей"
    >
      <header className="admin-audit-header">
        <div>
          <span>Отчёт</span>
          <h2>Действия пользователей</h2>
          <p>Входы, формы, изменения, административные действия и просмотры.</p>
        </div>
        <div className="admin-audit-window">
          <strong>Последние 3 месяца</strong>
          <small>{formatAuditEventCount(total)}</small>
        </div>
      </header>

      <div className="admin-audit-filters" aria-label="Фильтры отчёта">
        <label>
          <span>Аккаунт</span>
          <select
            disabled={isReportLoading}
            value={selectedAccountId}
            onChange={(event) => {
              const value = event.currentTarget.value;
              startReportQueryLoad();
              setSelectedAccountId(value);
              setOffset(0);
            }}
          >
            <option value="">
              {canViewPlatformAudit ? "Все аккаунты" : "Все аккаунты бизнеса"}
            </option>
            {knownActors.map((actor) => (
              <option value={actor.accountId} key={actor.accountId}>
                {formatAuditActorOption(actor)}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Тип действия</span>
          <select
            disabled={isReportLoading}
            value={selectedCategory}
            onChange={(event) => {
              const value = event.currentTarget.value as "all" | AuditEventCategory;
              startReportQueryLoad();
              setSelectedCategory(value);
              setOffset(0);
            }}
          >
            {adminAuditCategoryOptions.map((option) => (
              <option value={option.id} key={option.id}>{option.label}</option>
            ))}
          </select>
        </label>

        <button
          className="secondary-button admin-audit-refresh"
          type="button"
          disabled={isReportLoading}
          onClick={() => {
            preserveReportOnNextLoadRef.current = true;
            setIsReportLoading(true);
            setRefreshVersion((version) => version + 1);
          }}
        >
          {isReportLoading && report !== undefined ? (
            <LoadingIndicator
              label="Обновляем…"
              variant="button"
            />
          ) : "Обновить"}
        </button>
      </div>

      {report !== undefined ? (
        <p className="admin-audit-range-note">
          Показаны события с {formatAuditWindowDate(report.window.from)}. Более ранние записи не удаляются.
        </p>
      ) : null}

      {isReportLoading && report === undefined ? (
        <LoadingIndicator
          label="Загружаем действия пользователей."
          variant="page"
        />
      ) : null}
      {reportState.status === "error" ? (
        <p className="dispatcher-status-line">{reportState.message}</p>
      ) : null}
      {report !== undefined && report.events.length === 0 ? (
        <div className="admin-audit-empty">
          <strong>Действий не найдено</strong>
          <span>Измените аккаунт или тип действия.</span>
        </div>
      ) : null}
      {report !== undefined && report.events.length > 0 ? (
        <div
          className="admin-audit-list history-table-scroll"
          role="table"
          aria-label="Журнал действий"
        >
          <div className="admin-audit-row admin-audit-row-head history-table-head" role="row">
            <span role="columnheader">Когда</span>
            <span role="columnheader">Кто</span>
            <span role="columnheader">Что сделал</span>
          </div>
          {report.events.map((event) => (
            <AdminAuditEventRow event={event} key={event.id} />
          ))}
        </div>
      ) : null}

      {report !== undefined && (offset > 0 || canGoForward) ? (
        <div className="admin-audit-pagination">
          <button
            className="secondary-button"
            type="button"
            disabled={isReportLoading || offset === 0}
            onClick={() => {
              startReportQueryLoad();
              setOffset((current) => Math.max(0, current - adminAuditPageLimit));
            }}
          >
            Назад
          </button>
          <span>
            {offset + 1}–{Math.min(offset + report.events.length, total)} из {total}
          </span>
          <button
            className="secondary-button"
            type="button"
            disabled={isReportLoading || !canGoForward}
            onClick={() => {
              startReportQueryLoad();
              setOffset((current) => current + adminAuditPageLimit);
            }}
          >
            Дальше
          </button>
        </div>
      ) : null}
    </section>
  );
}

function AdminAuditEventRow({ event }: { event: UserActivityEvent }) {
  return (
    <article className="admin-audit-row" role="row">
      <time dateTime={event.occurredAt} role="cell">
        {formatAuditOccurredAt(event.occurredAt)}
      </time>
      <div className="admin-audit-actor" role="cell">
        <strong>{event.actor.displayName}</strong>
        <small>
          {event.actor.positionDisplayName}
          {event.actor.login ? ` · ${event.actor.login}` : ""}
        </small>
      </div>
      <div className="admin-audit-action" role="cell">
        <span className={`admin-audit-category admin-audit-category-${event.category}`}>
          {readAuditCategoryLabel(event.category)}
        </span>
        <strong>{event.summary}</strong>
        {event.details.length > 0 ? (
          <details>
            <summary>Введённые данные ({event.details.length})</summary>
            <dl>
              {event.details.map((detail, index) => (
                <div key={`${detail.label}-${index}`}>
                  <dt>{detail.label}</dt>
                  <dd>{detail.value}</dd>
                </div>
              ))}
            </dl>
          </details>
        ) : null}
      </div>
    </article>
  );
}

function readAuditCategoryLabel(category: AuditEventCategory) {
  return adminAuditCategoryOptions.find((option) => option.id === category)?.label ?? category;
}

function formatAuditActorOption(actor: UserActivityActor) {
  const status = actor.status === "archived"
    ? " · архив"
    : actor.status === "suspended"
      ? " · вход отключён"
      : "";
  const login = actor.login.length > 0 ? ` · ${actor.login}` : "";

  return `${actor.displayName} — ${actor.positionDisplayName}${login}${status}`;
}

function formatAuditOccurredAt(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatAuditWindowDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function formatAuditEventCount(value: number) {
  const mod100 = value % 100;
  const mod10 = value % 10;
  const suffix = mod100 >= 11 && mod100 <= 14
    ? "событий"
    : mod10 === 1
      ? "событие"
      : mod10 >= 2 && mod10 <= 4
        ? "события"
        : "событий";

  return `${value} ${suffix}`;
}

function AdminAccountPreviewWorkspace({
  onSelectAccountView,
}: {
  onSelectAccountView: (account: AdminAccountSummary) => void;
}) {
  const [accountsState, setAccountsState] = useState<AdminAccountsLoadState>({
    status: "loading",
    message: "Загружаем учётные записи.",
  });
  const [positionsState, setPositionsState] = useState<AdminPositionsLoadState>({
    status: "loading",
    message: "Загружаем должности.",
  });
  useEffect(() => {
    const controller = new AbortController();
    requestAdminAccounts({ signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted) setAccountsState(result);
    });
    requestAdminPositions({ signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted) setPositionsState(result);
    });
    return () => controller.abort();
  }, []);

  const accounts =
    accountsState.status === "ready"
      ? accountsState.accounts
      : [];
  const accountTypePreviews = positionsState.status === "ready"
    ? positionsState.positions.map(buildAdminPreviewAccountForDefinition)
    : positionsState.status === "error"
      ? adminAccountPositionOptions.map(buildAdminPreviewAccountForPosition)
      : [];

  return (
    <section className="admin-workspace" aria-label="Просмотр аккаунта">
      <div className="admin-account-preview-group">
        <h3>Типы аккаунтов</h3>
        {positionsState.status === "loading" ? (
          <LoadingIndicator label={positionsState.message} variant="panel" />
        ) : null}
        {positionsState.status === "error" ? (
          <p className="dispatcher-status-line">{positionsState.message}</p>
        ) : null}
        <div className="admin-account-switcher" aria-label="Типы аккаунтов">
          {accountTypePreviews.map((account) => (
            <AdminAccountPreviewButton
              account={account}
              isTypePreview
              key={account.accessId}
              onSelectAccountView={onSelectAccountView}
            />
          ))}
        </div>
      </div>

      <div className="admin-account-preview-group">
        <h3>Созданные аккаунты</h3>
        {accountsState.status === "loading" ? (
          <LoadingIndicator label={accountsState.message} variant="panel" />
        ) : null}
        {accountsState.status === "error" ? (
          <p className="dispatcher-status-line">{accountsState.message}</p>
        ) : null}
        {accountsState.status === "ready" && accounts.length === 0 ? (
          <p className="dispatcher-status-line">Созданных аккаунтов пока нет.</p>
        ) : null}
        <div className="admin-account-switcher" aria-label="Созданные аккаунты">
          {accounts.map((account) => (
            <AdminAccountPreviewButton
              account={account}
              isTypePreview={false}
              key={account.accessId}
              onSelectAccountView={onSelectAccountView}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function AdminAccountPreviewButton({
  account,
  isTypePreview,
  onSelectAccountView,
}: {
  account: AdminAccountSummary;
  isTypePreview: boolean;
  onSelectAccountView: (account: AdminAccountSummary) => void;
}) {
  const hasBusinessNavigation = account.navigationItems.some((item) =>
    item.startsWith("business."),
  );

  return (
    <button
      className="admin-account-button"
      type="button"
      disabled={!hasBusinessNavigation}
      title={
        !hasBusinessNavigation
          ? "У аккаунта нет рабочих вкладок для превью."
          : undefined
      }
      onClick={() => {
        if (hasBusinessNavigation) onSelectAccountView(account);
      }}
    >
      <span>{account.positionDisplayName}</span>
      {!isTypePreview ? <strong>{account.userDisplayName}</strong> : null}
      {isTypePreview ? (
        !hasBusinessNavigation ? <small>Без превью</small> : null
      ) : (
        <small>{account.login}</small>
      )}
    </button>
  );
}

function AdminDatabaseWorkspace({
  profile,
  onShowToast,
  onProductionSnapshotSynchronized,
}: {
  profile: ServerUserProfile;
  onShowToast: ShowToast;
  onProductionSnapshotSynchronized: () => void;
}) {
  const canManageDatabase = canManageAnalyticsDatabase(profile);
  const [tablesState, setTablesState] = useState<AdminDatabaseTablesLoadState>({
    status: "loading",
    message: "Запрашиваем таблицы БД.",
  });
  const [rowsState, setRowsState] = useState<AdminDatabaseRowsLoadState>({
    status: "idle",
    message: "Выберите таблицу.",
  });
  const [selectedTableName, setSelectedTableName] = useState("");
  const [rowsOffset, setRowsOffset] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [editor, setEditor] = useState<
    | {
        row: AdminDatabaseRow;
        values: Record<string, AdminDatabaseCellValue>;
      }
    | undefined
  >(undefined);
  const [deleteCandidate, setDeleteCandidate] =
    useState<AdminDatabaseRow | undefined>(undefined);
  const [mergeCandidate, setMergeCandidate] = useState<
    | {
        row: AdminDatabaseRow;
        targetKey: string;
      }
    | undefined
  >(undefined);
  const [clearCandidate, setClearCandidate] =
    useState<AdminDatabaseTable | undefined>(undefined);
  const [mutationStatus, setMutationStatus] = useState("");
  const [isMutating, setIsMutating] = useState(false);

  useEffect(() => {
    if (!canManageDatabase) {
      setTablesState({
        status: "error",
        message: "Серверный профиль не разрешает управление БД.",
        code: "access_denied",
      });
      return;
    }

    const controller = new AbortController();

    setTablesState((current) =>
      current.status === "ready"
        ? current
        : {
            status: "loading",
            message: "Запрашиваем таблицы БД.",
          },
    );

    requestAdminDatabaseTables({
      signal: controller.signal,
    }).then((result) => {
      if (!controller.signal.aborted) {
        setTablesState(result);
      }
    });

    return () => {
      controller.abort();
    };
  }, [canManageDatabase, refreshVersion]);

  useEffect(() => {
    if (tablesState.status !== "ready") {
      return;
    }

    const tables = tablesState.tables;

    if (tables.length === 0) {
      setSelectedTableName("");
      return;
    }

    if (!tables.some((table) => table.name === selectedTableName)) {
      setSelectedTableName(tables[0].name);
    }
  }, [selectedTableName, tablesState]);

  useEffect(() => {
    setRowsOffset(0);
    setSearchInput("");
    setSearchTerm("");
  }, [selectedTableName]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(searchInput.trim());
    }, 300);

    return () => {
      clearTimeout(timer);
    };
  }, [searchInput]);

  useEffect(() => {
    setRowsOffset(0);
  }, [searchTerm]);

  useEffect(() => {
    if (!canManageDatabase || selectedTableName.length === 0) {
      setRowsState({
        status: "idle",
        message: "Выберите таблицу.",
      });
      return;
    }

    const controller = new AbortController();

    setRowsState((current) =>
      current.status === "ready" &&
      current.table.name === selectedTableName &&
      current.offset === rowsOffset
        ? current
        : {
            status: "loading",
            message: "Запрашиваем строки таблицы.",
          },
    );
    setEditor(undefined);
    setDeleteCandidate(undefined);
    setMergeCandidate(undefined);
    setClearCandidate(undefined);

    requestAdminDatabaseRows(selectedTableName, {
      limit: 100,
      offset: rowsOffset,
      search: searchTerm,
      signal: controller.signal,
    }).then((result) => {
      if (!controller.signal.aborted) {
        setRowsState(result);
      }
    });

    return () => {
      controller.abort();
    };
  }, [
    canManageDatabase,
    selectedTableName,
    rowsOffset,
    searchTerm,
    refreshVersion,
  ]);

  const tables = tablesState.status === "ready" ? tablesState.tables : [];
  const selectedTable =
    rowsState.status === "ready" ? rowsState.table : undefined;

  function handleStartEdit(row: AdminDatabaseRow) {
    setMutationStatus("");
    setDeleteCandidate(undefined);
    setMergeCandidate(undefined);
    setClearCandidate(undefined);
    setEditor({
      row,
      values: readInitialAdminDatabaseEditorValues(row),
    });
  }

  function handleEditValue(
    columnName: string,
    value: AdminDatabaseCellValue,
  ) {
    setEditor((current) =>
      current === undefined
        ? current
        : {
            ...current,
            values: {
              ...current.values,
              [columnName]: value,
            },
          },
    );
  }

  async function handleSaveEdit() {
    if (editor === undefined || selectedTableName.length === 0) {
      return;
    }

    setIsMutating(true);
    setMutationStatus("Сохраняем строку БД.");

    const result = await updateAdminDatabaseRow(selectedTableName, {
      primaryKey: editor.row.primaryKey,
      values: editor.values,
    });

    setIsMutating(false);

    if (result.status === "ready") {
      setMutationStatus("");
      onShowToast("Сохранено", "Строка БД обновлена.", "success");
      setEditor(undefined);
      setRefreshVersion((version) => version + 1);
      return;
    }

    setMutationStatus(result.message);
  }

  function handleStartDelete(row: AdminDatabaseRow) {
    setMutationStatus("");
    setEditor(undefined);
    setMergeCandidate(undefined);
    setClearCandidate(undefined);
    setDeleteCandidate(row);
  }

  function handleStartClear(table: AdminDatabaseTable) {
    setMutationStatus("");
    setEditor(undefined);
    setDeleteCandidate(undefined);
    setMergeCandidate(undefined);
    setClearCandidate(table);
  }

  async function handleConfirmDelete() {
    if (deleteCandidate === undefined || selectedTableName.length === 0) {
      return;
    }

    setIsMutating(true);
    setMutationStatus("Удаляем строку БД.");

    const result = await deleteAdminDatabaseRow(selectedTableName, {
      primaryKey: deleteCandidate.primaryKey,
    });

    setIsMutating(false);

    if (result.status === "ready") {
      setMutationStatus("");
      onShowToast("Удалено", "Строка БД удалена.", "success");
      setDeleteCandidate(undefined);
      setRefreshVersion((version) => version + 1);
      return;
    }

    setMutationStatus(result.message);
  }

  function handleStartMerge(row: AdminDatabaseRow) {
    setMutationStatus("");
    setEditor(undefined);
    setDeleteCandidate(undefined);
    setClearCandidate(undefined);
    setMergeCandidate({ row, targetKey: "" });
  }

  async function handleConfirmMerge() {
    if (
      mergeCandidate === undefined ||
      selectedTableName.length === 0 ||
      rowsState.status !== "ready"
    ) {
      return;
    }

    const target = rowsState.mergeTargets.find(
      (item) => formatDatabasePrimaryKey(item.primaryKey) === mergeCandidate.targetKey,
    );

    if (target === undefined) {
      setMutationStatus("Выберите целевую марку.");
      return;
    }

    const sourceLabel = mergeCandidate.row.values.label ?? "Марка";
    setIsMutating(true);
    setMutationStatus("Объединяем марки.");

    const result = await mergeAdminDatabaseRows(selectedTableName, {
      sourcePrimaryKey: mergeCandidate.row.primaryKey,
      targetPrimaryKey: target.primaryKey,
    });

    setIsMutating(false);

    if (result.status === "ready") {
      setMutationStatus("");
      onShowToast(
        "Марки объединены",
        `${sourceLabel} → ${target.label}`,
        "success",
      );
      setMergeCandidate(undefined);
      setRowsOffset(0);
      setRefreshVersion((version) => version + 1);
      return;
    }

    setMutationStatus(result.message);
  }

  async function handleConfirmClear() {
    if (clearCandidate === undefined) {
      return;
    }

    setIsMutating(true);
    setMutationStatus("Очищаем раздел БД.");

    const result = await clearAdminDatabaseTable(clearCandidate.name);

    setIsMutating(false);

    if (result.status === "ready") {
      setMutationStatus("");
      onShowToast(
        "Раздел очищен",
        `Удалено записей: ${result.deleted}.`,
        "success",
      );
      setClearCandidate(undefined);
      setRowsOffset(0);
      setRefreshVersion((version) => version + 1);
      return;
    }

    setMutationStatus(result.message);
  }

  if (!canManageDatabase) {
    return (
      <section className="admin-workspace" aria-label="БД">
        <p className="dispatcher-status-line">
          Серверный профиль не разрешает управление БД.
        </p>
      </section>
    );
  }

  return (
    <section className="admin-workspace" aria-label="БД">
      {!isProductionApp ? (
        <AdminProductionSnapshotPanel
          onShowToast={onShowToast}
          onSynchronized={onProductionSnapshotSynchronized}
        />
      ) : null}
      <AdminDispatcherImportPanel
        onShowToast={onShowToast}
        onImported={() => setRefreshVersion((version) => version + 1)}
      />
      <div className="admin-db-layout">
        <div className="admin-db-sidebar" aria-label="Разделы БД">
          {tablesState.status === "loading" ? (
            <LoadingIndicator label={tablesState.message} variant="panel" />
          ) : null}
          {tablesState.status === "error" ? (
            <p className="dispatcher-status-line">{tablesState.message}</p>
          ) : null}
          {tables.map((table) => (
            <button
              className={`admin-db-table-button ${
                table.name === selectedTableName ? "is-active" : ""
              }`}
              type="button"
              aria-pressed={table.name === selectedTableName}
              key={table.name}
              onClick={() => setSelectedTableName(table.name)}
            >
              <span>{table.label}</span>
              <small>{formatTableRowCount(table.rowCount)}</small>
            </button>
          ))}
        </div>

        <div className="admin-db-main">
          <label className="admin-db-search">
            <span>Поиск по всем столбцам</span>
            <input
              maxLength={120}
              placeholder="Например: INC-2026-51, Открытие инцидента, Соколова"
              value={searchInput}
              onChange={(event) => setSearchInput(event.currentTarget.value)}
            />
          </label>

          <AdminDatabaseRowsTable
            rowsState={rowsState}
            search={searchTerm}
            onEdit={handleStartEdit}
            onMerge={handleStartMerge}
            onDelete={handleStartDelete}
            onClear={handleStartClear}
            onNextPage={() =>
              setRowsOffset((current) =>
                rowsState.status === "ready"
                  ? current + rowsState.limit
                  : current,
              )
            }
            onPreviousPage={() =>
              setRowsOffset((current) =>
                rowsState.status === "ready"
                  ? Math.max(current - rowsState.limit, 0)
                  : current,
              )
            }
          />

          {selectedTable !== undefined && editor !== undefined ? (
            <AdminDatabaseEditorModal
              table={selectedTable}
              editor={editor}
              isMutating={isMutating}
              onCancel={() => setEditor(undefined)}
              onSave={handleSaveEdit}
              onValueChange={handleEditValue}
            />
          ) : null}

          {deleteCandidate !== undefined ? (
            <div className="admin-db-danger-panel" role="alert">
              <span>Удалить выбранную запись без возможности восстановления?</span>
              <div className="admin-db-actions">
                <button
                  className="secondary-button"
                  type="button"
                  disabled={isMutating}
                  onClick={() => setDeleteCandidate(undefined)}
                >
                  Отмена
                </button>
                <button
                  className="secondary-button secondary-button-danger"
                  type="button"
                  disabled={isMutating}
                  onClick={handleConfirmDelete}
                >
                  {isMutating ? (
                    <LoadingIndicator
                      label="Удаляем…"
                      variant="button"
                    />
                  ) : "Удалить"}
                </button>
              </div>
            </div>
          ) : null}

          {selectedTable !== undefined &&
          rowsState.status === "ready" &&
          mergeCandidate !== undefined ? (
            <AdminDatabaseMergeModal
              table={selectedTable}
              source={mergeCandidate.row}
              targets={rowsState.mergeTargets}
              targetKey={mergeCandidate.targetKey}
              isMutating={isMutating}
              onCancel={() => setMergeCandidate(undefined)}
              onConfirm={handleConfirmMerge}
              onTargetChange={(targetKey) =>
                setMergeCandidate((current) =>
                  current === undefined ? current : { ...current, targetKey },
                )
              }
            />
          ) : null}

          {clearCandidate !== undefined ? (
            <AdminDatabaseClearModal
              table={clearCandidate}
              isMutating={isMutating}
              onCancel={() => setClearCandidate(undefined)}
              onConfirm={handleConfirmClear}
            />
          ) : null}

          {mutationStatus.length > 0 ? (
            <p className="dispatcher-status-line">{mutationStatus}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function AdminProductionSnapshotPanel({
  onSynchronized,
  onShowToast,
}: {
  onSynchronized: () => void;
  onShowToast: ShowToast;
}) {
  const [status, setStatus] = useState<
    ProductionSnapshotStatusResult | { status: "loading"; message: string }
  >({
    status: "loading",
    message: "Проверяем синхронизацию с production.",
  });
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [isSynchronizing, setIsSynchronizing] = useState(false);
  const [mutationStatus, setMutationStatus] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    setStatus({
      status: "loading",
      message: "Проверяем синхронизацию с production.",
    });
    requestProductionSnapshotStatus({ signal: controller.signal }).then(
      (result) => {
        if (!controller.signal.aborted) {
          setStatus(result);
        }
      },
    );

    return () => controller.abort();
  }, [refreshVersion]);

  function handleOpenConfirmation() {
    setConfirmation("");
    setMutationStatus("");
    setIsConfirming(true);
  }

  async function handleSynchronize() {
    if (
      status.status !== "ready" ||
      confirmation !== status.confirmationPhrase
    ) {
      return;
    }

    setIsSynchronizing(true);
    setMutationStatus("Создаём снимок production и заменяем тестовую БД.");

    const result = await replaceTestDatabaseWithProductionSnapshot(
      confirmation,
    );

    setIsSynchronizing(false);

    if (result.status === "error") {
      setMutationStatus(result.message);
      return;
    }

    setMutationStatus("");
    setConfirmation("");
    setIsConfirming(false);
    onShowToast(
      "Тестовая БД обновлена",
      `${result.tableCount} таблиц · ${result.rowCount.toLocaleString("ru-RU")} строк. Активные сессии очищены.`,
      "success",
    );
    onSynchronized();
    setRefreshVersion((version) => version + 1);
  }

  return (
    <section
      className="admin-production-snapshot"
      aria-labelledby="admin-production-snapshot-title"
    >
      <div className="admin-production-snapshot-heading">
        <div>
          <span>Только тестовая версия</span>
          <strong id="admin-production-snapshot-title">
            Синхронизация с production
          </strong>
          <small>
            Полностью заменяет состояние тестовой БД актуальным снимком.
          </small>
        </div>

        {status.status === "loading" ? (
          <LoadingIndicator label="Проверяем…" variant="button" />
        ) : status.status === "ready" && status.available ? (
          <button
            className="secondary-button secondary-button-danger"
            type="button"
            disabled={status.inProgress || isSynchronizing}
            onClick={handleOpenConfirmation}
          >
            {status.inProgress ? "Синхронизация идёт" : "Заменить тестовую БД"}
          </button>
        ) : (
          <button
            className="secondary-button"
            type="button"
            onClick={() => setRefreshVersion((version) => version + 1)}
          >
            Проверить снова
          </button>
        )}
      </div>

      <p>
        Пользователи, хеши паролей, права, формы, планы, марки и история теста
        будут удалены и заменены данными production. Production остаётся
        неизменной; перенесённые активные сессии будут очищены.
      </p>

      {status.status === "error" ? (
        <p className="dispatcher-status-line">{status.message}</p>
      ) : null}
      {status.status === "ready" && !status.available ? (
        <p className="dispatcher-status-line">
          Сервер ещё не настроен для чтения снимка production.
        </p>
      ) : null}

      {isConfirming && status.status === "ready" ? (
        <div
          className="admin-db-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isSynchronizing) {
              setIsConfirming(false);
            }
          }}
        >
          <section
            className="admin-db-editor admin-production-snapshot-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="production-snapshot-confirm-title"
          >
            <div>
              <span className="form-kicker">Необратимое действие</span>
              <h3 id="production-snapshot-confirm-title">
                Полностью заменить тестовую БД?
              </h3>
              <p>
                Замена выполняется одной транзакцией. Если перенос завершится
                ошибкой, сервер целиком откатит её и сохранит прежние данные.
              </p>
            </div>

            <label className="admin-production-snapshot-confirmation">
              <span>Введите фразу подтверждения</span>
              <strong>{status.confirmationPhrase}</strong>
              <input
                autoFocus
                type="text"
                value={confirmation}
                disabled={isSynchronizing}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setConfirmation(event.currentTarget.value)}
              />
            </label>

            {mutationStatus.length > 0 ? (
              <p className="dispatcher-status-line">{mutationStatus}</p>
            ) : null}

            <div className="admin-db-actions">
              <button
                className="secondary-button"
                type="button"
                disabled={isSynchronizing}
                onClick={() => setIsConfirming(false)}
              >
                Отмена
              </button>
              <button
                className="secondary-button secondary-button-danger"
                type="button"
                disabled={
                  isSynchronizing ||
                  confirmation !== status.confirmationPhrase
                }
                onClick={handleSynchronize}
              >
                {isSynchronizing ? (
                  <LoadingIndicator label="Заменяем…" variant="button" />
                ) : "Заменить полностью"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function AdminDispatcherImportPanel({
  onImported,
  onShowToast,
}: {
  onImported: () => void;
  onShowToast: ShowToast;
}) {
  const [spreadsheetUrl, setSpreadsheetUrl] = useState("");
  const [preview, setPreview] =
    useState<AdminDispatcherImportPreviewResponse | undefined>(undefined);
  const [statusMessage, setStatusMessage] = useState("");
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  function handleSourceChange(value: string) {
    setSpreadsheetUrl(value);
    setPreview(undefined);
    setStatusMessage("");
  }

  async function handlePreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPreviewing(true);
    setPreview(undefined);
    setStatusMessage("Проверяем таблицу.");

    const result = await previewAdminDispatcherImport({
      spreadsheetUrl,
    });

    setIsPreviewing(false);

    if (result.status === "error") {
      setStatusMessage(result.message);
      return;
    }

    setPreview(result);
    setStatusMessage("Предпросмотр готов. Данные в БД ещё не изменены.");
  }

  async function handleExecuteImport() {
    if (preview === undefined) {
      return;
    }

    setIsImporting(true);
    setStatusMessage("Переносим записи в БД.");

    const result = await executeAdminDispatcherImport({
      spreadsheetUrl,
      previewToken: preview.previewToken,
    });

    setIsImporting(false);

    if (result.status === "error") {
      setStatusMessage(result.message);
      return;
    }

    setPreview(undefined);
    setStatusMessage("");
    onShowToast(
      "Импорт завершён",
      `Импорт завершён: добавлено ${result.inserted}, пропущено ${result.skipped}.`,
      "success",
    );
    onImported();
  }

  return (
    <section className="admin-db-import" aria-labelledby="admin-db-import-title">
      <div className="admin-db-import-heading">
        <div>
          <span>Google Sheets</span>
          <strong id="admin-db-import-title">Импорт диспетчерских таблиц</strong>
        </div>
        <small>Оборудование · Инциденты · Посетители</small>
      </div>

      <form className="admin-db-import-form" onSubmit={handlePreview}>
        <label>
          <span>Ссылка на таблицу</span>
          <input
            type="url"
            required
            placeholder="https://docs.google.com/spreadsheets/d/..."
            value={spreadsheetUrl}
            onChange={(event) => {
              const value = event.currentTarget.value;
              handleSourceChange(value);
            }}
          />
        </label>
        <button
          className="secondary-button"
          type="submit"
          disabled={
            isPreviewing ||
            isImporting ||
            spreadsheetUrl.trim().length === 0
          }
        >
          {isPreviewing ? (
            <LoadingIndicator
              label="Проверяем…"
              variant="button"
            />
          ) : "Проверить таблицу"}
        </button>
      </form>

      {preview !== undefined ? (
        <div className="admin-db-import-preview">
          <div className="admin-db-import-totals">
            <div>
              <span>Всего записей</span>
              <strong>{preview.totalRecords}</strong>
            </div>
            <div>
              <span>Будет добавлено</span>
              <strong>{preview.newRecords}</strong>
            </div>
            <div>
              <span>Уже существует</span>
              <strong>{preview.existingRecords}</strong>
            </div>
            <div>
              <span>Предупреждения</span>
              <strong>{preview.warnings.length}</strong>
            </div>
          </div>

          <div className="admin-db-import-sheets">
            {preview.sheets.map((sheet) => (
              <div key={sheet.sheetName}>
                <strong>{sheet.sheetName}</strong>
                <span>
                  строк: {sheet.sourceRows} · записей: {sheet.importRecords}
                </span>
                {sheet.skippedRows > 0 ? (
                  <small>пропущено строк: {sheet.skippedRows}</small>
                ) : null}
              </div>
            ))}
          </div>

          {preview.warnings.length > 0 ? (
            <details className="admin-db-import-warnings">
              <summary>Показать предупреждения</summary>
              <ul>
                {preview.warnings.slice(0, 20).map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
              {preview.warnings.length > 20 ? (
                <small>Ещё предупреждений: {preview.warnings.length - 20}</small>
              ) : null}
            </details>
          ) : null}

          <div className="admin-db-import-confirm">
            <span>
              Импорт добавит только новые записи. Существующие строки не
              перезаписываются, уведомления не отправляются.
            </span>
            <button
              className="primary-button"
              type="button"
              disabled={isImporting || preview.newRecords === 0}
              onClick={handleExecuteImport}
            >
              {isImporting ? (
                <LoadingIndicator
                  label="Переносим…"
                  variant="button"
                />
              ) : "Перенести в БД"}
            </button>
          </div>
        </div>
      ) : null}

      {statusMessage.length > 0 ? (
        <p className="dispatcher-status-line">{statusMessage}</p>
      ) : null}
    </section>
  );
}

function AdminDatabaseRowsTable({
  rowsState,
  search,
  onEdit,
  onMerge,
  onDelete,
  onClear,
  onNextPage,
  onPreviousPage,
}: {
  rowsState: AdminDatabaseRowsLoadState;
  search: string;
  onEdit: (row: AdminDatabaseRow) => void;
  onMerge: (row: AdminDatabaseRow) => void;
  onDelete: (row: AdminDatabaseRow) => void;
  onClear: (table: AdminDatabaseTable) => void;
  onNextPage: () => void;
  onPreviousPage: () => void;
}) {
  if (rowsState.status === "loading") {
    return <LoadingIndicator label={rowsState.message} variant="page" />;
  }

  if (rowsState.status !== "ready") {
    return <p className="dispatcher-status-line">{rowsState.message}</p>;
  }

  if (rowsState.rows.length === 0) {
    return (
      <div className="admin-db-meta">
        <span>{rowsState.table.label}</span>
        <strong>
          {rowsState.offset > 0
            ? "Страницы дальше нет"
            : search.length > 0
            ? "Ничего не найдено"
            : "Строк нет"}
        </strong>
        {rowsState.offset > 0 ? (
          <div className="admin-db-pager">
            <button
              className="secondary-button"
              type="button"
              onClick={onPreviousPage}
            >
              Назад
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  const hasPreviousPage = rowsState.offset > 0;
  const hasNextPage =
    rowsState.rows.length === rowsState.limit &&
    (rowsState.table.rowCount === null ||
      rowsState.offset + rowsState.rows.length < rowsState.table.rowCount);
  const hasActions = hasAdminDatabaseRowActions(rowsState.table);
  const canEdit = rowsState.table.columns.some((column) => column.editable);

  return (
    <>
      <div className="admin-db-meta">
        <span>{rowsState.table.label}</span>
        <strong>{formatRowsPage(rowsState)}</strong>
        <div className="admin-db-meta-actions">
          {rowsState.table.canClear ? (
            <button
              className="secondary-button secondary-button-danger"
              type="button"
              onClick={() => onClear(rowsState.table)}
            >
              Очистить раздел
            </button>
          ) : null}
          <div className="admin-db-pager">
            <button
              className="secondary-button"
              type="button"
              disabled={!hasPreviousPage}
              onClick={onPreviousPage}
            >
              Назад
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={!hasNextPage}
              onClick={onNextPage}
            >
              Дальше
            </button>
          </div>
        </div>
      </div>
      <div className="admin-db-table-scroll">
        <table className="admin-db-data-table">
          <thead>
            <tr>
              {rowsState.table.columns.map((column) => (
                <th
                  className={readDatabaseCellClassName(column)}
                  scope="col"
                  key={column.name}
                >
                  {column.label}
                </th>
              ))}
              {hasActions ? (
                <th className="admin-db-actions-column" scope="col">
                  Действия
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rowsState.rows.map((row) => (
              <tr key={formatPrimaryKey(row)}>
                {rowsState.table.columns.map((column) => (
                  <td
                    className={readDatabaseCellClassName(column)}
                    title={row.values[column.name] ?? "NULL"}
                    key={column.name}
                  >
                    {formatAdminDatabaseCellValue(
                      row.values[column.name],
                      column.format,
                    )}
                  </td>
                ))}
                {hasActions ? (
                  <td className="admin-db-actions-column">
                    <div className="admin-db-actions">
                      {canEdit ? (
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => onEdit(row)}
                        >
                          Править
                        </button>
                      ) : null}
                      {rowsState.table.canMerge ? (
                        <button
                          className="secondary-button"
                          type="button"
                          disabled={rowsState.mergeTargets.length < 2}
                          onClick={() => onMerge(row)}
                        >
                          Слить
                        </button>
                      ) : null}
                      {rowsState.table.canDelete ? (
                        <button
                          className="secondary-button secondary-button-danger"
                          type="button"
                          onClick={() => onDelete(row)}
                        >
                          Удалить
                        </button>
                      ) : null}
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function AdminDatabaseMergeModal({
  table,
  source,
  targets,
  targetKey,
  isMutating,
  onCancel,
  onConfirm,
  onTargetChange,
}: {
  table: AdminDatabaseTable;
  source: AdminDatabaseRow;
  targets: AdminDatabaseMergeTarget[];
  targetKey: string;
  isMutating: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onTargetChange: (targetKey: string) => void;
}) {
  const sourceKey = formatDatabasePrimaryKey(source.primaryKey);
  const availableTargets = targets.filter(
    (target) => formatDatabasePrimaryKey(target.primaryKey) !== sourceKey,
  );
  const sourceLabel = source.values.label ?? "Выбранная марка";
  const titleId = "admin-db-merge-title";

  return (
    <div
      className="admin-db-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isMutating) {
          onCancel();
        }
      }}
    >
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="admin-db-editor admin-db-clear-dialog"
        role="dialog"
      >
        <div className="admin-db-clear-copy">
          <span>Слияние марок</span>
          <strong id={titleId}>Куда перенести «{sourceLabel}»?</strong>
          <p>
            Все сохранённые факты исходной марки перейдут к выбранной марке из раздела
            «{table.label}». Исходная марка исчезнет из справочника. Прошлая история аудита
            не переписывается, слияние будет записано отдельно.
          </p>
        </div>
        <div className="admin-db-editor-field">
          <label htmlFor="admin-db-merge-target">Целевая марка</label>
          <select
            id="admin-db-merge-target"
            value={targetKey}
            disabled={isMutating}
            onChange={(event) => {
              const nextTargetKey = event.currentTarget.value;
              onTargetChange(nextTargetKey);
            }}
          >
            <option value="">Выберите существующую марку</option>
            {availableTargets.map((target) => {
              const key = formatDatabasePrimaryKey(target.primaryKey);
              return (
                <option value={key} key={key}>
                  {target.label}
                </option>
              );
            })}
          </select>
        </div>
        <div className="admin-db-actions">
          <button
            className="secondary-button"
            type="button"
            disabled={isMutating}
            onClick={onCancel}
          >
            Отмена
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={isMutating || targetKey.length === 0}
            onClick={onConfirm}
          >
            {isMutating ? (
              <LoadingIndicator
                label="Объединяем…"
                variant="button"
              />
            ) : "Слить марки"}
          </button>
        </div>
      </section>
    </div>
  );
}

function AdminDatabaseClearModal({
  table,
  isMutating,
  onCancel,
  onConfirm,
}: {
  table: AdminDatabaseTable;
  isMutating: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = "admin-db-clear-title";

  return (
    <div
      className="admin-db-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isMutating) {
          onCancel();
        }
      }}
    >
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="admin-db-editor admin-db-clear-dialog"
        role="dialog"
      >
        <div className="admin-db-clear-copy">
          <span>Необратимое действие</span>
          <strong id={titleId}>Очистить раздел «{table.label}»?</strong>
          <p>
            Будут удалены все записи этого раздела — {formatTableRowCount(table.rowCount)}.
            Другие разделы БД не изменятся.
          </p>
        </div>
        <div className="admin-db-actions">
          <button
            className="secondary-button"
            type="button"
            disabled={isMutating}
            onClick={onCancel}
          >
            Отмена
          </button>
          <button
            className="secondary-button secondary-button-danger"
            type="button"
            disabled={isMutating}
            onClick={onConfirm}
          >
            {isMutating ? (
              <LoadingIndicator
                label="Очищаем…"
                variant="button"
              />
            ) : "Удалить все записи"}
          </button>
        </div>
      </section>
    </div>
  );
}

function AdminDatabaseEditorModal({
  table,
  editor,
  isMutating,
  onCancel,
  onSave,
  onValueChange,
}: {
  table: AdminDatabaseTable;
  editor: {
    row: AdminDatabaseRow;
    values: Record<string, AdminDatabaseCellValue>;
  };
  isMutating: boolean;
  onCancel: () => void;
  onSave: () => void;
  onValueChange: (columnName: string, value: AdminDatabaseCellValue) => void;
}) {
  const editableFields = editor.row.editorFields;
  const hasMissingRequiredValue = editableFields.some(
    (field) =>
      field.required &&
      (editor.values[field.name] ?? "").trim().length === 0,
  );
  const editorTitleId = "admin-db-editor-title";

  return (
    <div
      className="admin-db-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isMutating) {
          onCancel();
        }
      }}
    >
      <section
        aria-labelledby={editorTitleId}
        aria-modal="true"
        className="admin-db-editor"
        role="dialog"
      >
        <div className="admin-db-editor-header">
          <div>
            <span id={editorTitleId}>Изменить данные</span>
            <strong>{table.label}</strong>
          </div>
          <div className="admin-db-actions">
            <button
              className="secondary-button"
              type="button"
              disabled={isMutating}
              onClick={onCancel}
            >
              Отмена
            </button>
            <button
              className="primary-button"
              type="button"
              disabled={
                isMutating ||
                editableFields.length === 0 ||
                hasMissingRequiredValue
              }
              onClick={onSave}
            >
              {isMutating ? (
                <LoadingIndicator
                  label="Сохраняем…"
                  variant="button"
                />
              ) : "Сохранить"}
            </button>
          </div>
        </div>
        <div className="admin-db-editor-grid">
          {editableFields.map((field) => {
            const value = editor.values[field.name] ?? "";
            const inputId = `admin-db-editor-${field.name.replace(/[^a-z0-9_-]/gi, "-")}`;

            return (
              <div className="admin-db-editor-field" key={field.name}>
                <label htmlFor={inputId}>
                  <span>
                    {field.label}
                    {field.required ? <em>Обязательно</em> : null}
                  </span>
                </label>
                {field.inputType === "production_brand" ? (
                  <ProductBrandPicker
                    ariaLabel={field.label}
                    disabled={isMutating}
                    id={inputId}
                    labels={field.options.map((option) => option.value)}
                    name={field.name}
                    value={value}
                    onChange={(nextValue) =>
                      onValueChange(field.name, nextValue)
                    }
                  />
                ) : field.inputType === "textarea" ? (
                  <textarea
                    id={inputId}
                    rows={5}
                    required={field.required}
                    value={value}
                    onChange={(event) =>
                      onValueChange(field.name, event.currentTarget.value)
                    }
                  />
                ) : field.inputType === "select" ? (
                  <select
                    id={inputId}
                    required={field.required}
                    value={value}
                    onChange={(event) =>
                      onValueChange(field.name, event.currentTarget.value)
                    }
                  >
                    {!field.required ? <option value="">Не выбрано</option> : null}
                    {field.options.map((option) => (
                      <option value={option.value} key={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={inputId}
                    type={field.inputType}
                    required={field.required}
                    step={field.inputType === "number" ? "any" : undefined}
                    value={value}
                    onChange={(event) =>
                      onValueChange(field.name, event.currentTarget.value)
                    }
                  />
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

type AdminAccountFormState = {
  login: string;
  password: string;
  displayName: string;
  email: string;
  maxUserId: string;
  position: AccountPosition;
};

type AdminPasswordResetFormState = {
  login: string;
  password: string;
};

const emptyAdminAccountForm: AdminAccountFormState = {
  login: "",
  password: "",
  displayName: "",
  email: "",
  maxUserId: "",
  position: "worker",
};

type AdminPositionFormState = {
  id?: string;
  displayName: string;
  navigationItems: AccountNavigationItem[];
  boardAssignmentAccess: BoardAssignmentAccess;
  showAdminNavigation: boolean;
  requireNotificationSettings: boolean;
};

const emptyAdminPositionForm: AdminPositionFormState = {
  displayName: "",
  navigationItems: nonAdminNavigationItems
    .filter(
      ({ id }) =>
        id !== "business.dispatcher_form" &&
        id !== "business.user_actions" &&
        id !== "business.production_plan",
    )
    .map(({ id }) => id),
  boardAssignmentAccess: "view",
  showAdminNavigation: false,
  requireNotificationSettings: true,
};

const positionOrderAutosaveDelayMs = 5_000;

function isAdminNavigationItemId(itemId: AccountNavigationItem) {
  return navigationItemsByAccountType.admin.some((item) => item.id === itemId);
}

function hasAdminPositionNavigation(position: AdminPositionSummary) {
  return position.navigationItems.some(isAdminNavigationItemId);
}

const adminAccountPositionOptions: AccountPosition[] = [
  "administrator",
  "business_owner",
  "board_chair",
  "board_member",
  "general_director",
  "economist",
  "laboratory_assistant",
  "worker",
  "dispatcher",
];

const accountTypeByPosition: Record<AccountPosition, AccountType> = {
  administrator: "admin",
  business_owner: "business_owner",
  board_chair: "business_owner",
  board_member: "business_owner",
  general_director: "business_owner",
  economist: "business_owner",
  laboratory_assistant: "business_owner",
  worker: "worker",
  dispatcher: "dispatcher",
};

function getNavigationOptionsForPosition(position: AccountPosition) {
  return accountTypeByPosition[position] === "admin"
    ? navigationItemsByAccountType.admin
    : nonAdminNavigationItems;
}

function formatNavigationItemLabel(item: NavigationItem) {
  return `${item.label} (${item.description})`;
}

function formatPositionNavigationItem(
  position: AdminPositionSummary,
  navigationItemId: AccountNavigationItem,
) {
  if (navigationItemId === "business.board_assignments") {
    return boardAssignmentAccessOptions.find(
      ({ id }) => id === position.boardAssignmentAccess,
    )?.label ?? "Поручения Совета директоров";
  }

  return [
    ...navigationItemsByAccountType.admin,
    ...nonAdminNavigationItems,
  ].find(({ id }) => id === navigationItemId)?.label ?? navigationItemId;
}

function moveAdminPosition(
  positions: AdminPositionSummary[],
  positionId: string,
  direction: -1 | 1,
) {
  const currentIndex = positions.findIndex(
    (position) => position.id === positionId,
  );
  const nextIndex = currentIndex + direction;
  if (
    currentIndex < 0 ||
    nextIndex < 0 ||
    nextIndex >= positions.length
  ) {
    return positions;
  }

  const next = [...positions];
  [next[currentIndex], next[nextIndex]] = [
    next[nextIndex],
    next[currentIndex],
  ];
  return next;
}

function buildAdminPreviewAccountForPosition(
  position: AccountPosition,
): AdminAccountSummary {
  const accountType = accountTypeByPosition[position];
  const label = accountPositionLabels[position];
  const isAdmin = accountType === "admin";
  const navigationItems = getNavigationOptionsForPosition(position).map(({ id }) => id);

  return {
    accessId: `admin-preview-${position}`,
    userId: `admin-preview-user-${position}`,
    login: "Ручная настройка",
    userDisplayName: "Типовой кабинет",
    userStatus: "active",
    isProtected: false,
    accessDisplayName: `Превью: ${label}`,
    accountType,
    position,
    positionDisplayName: label,
    scope: isAdmin
      ? { kind: "platform" }
      : { kind: "organization" },
    capabilities: isAdmin
      ? []
      : accountCapabilities.filter((capability) => capability.startsWith("business.")),
    navigationItems,
    createdAt: new Date().toISOString(),
  };
}

function buildAdminPreviewAccountForDefinition(
  position: AdminPositionSummary,
): AdminAccountSummary {
  const isAdmin = position.accountType === "admin";
  return {
    accessId: `admin-preview-${position.id}`,
    userId: `admin-preview-user-${position.id}`,
    login: "Типовой кабинет",
    userDisplayName: position.displayName,
    userStatus: "active",
    isProtected: false,
    accessDisplayName: `Превью: ${position.displayName}`,
    accountType: position.accountType,
    position: position.id,
    positionDisplayName: position.displayName,
    scope: isAdmin
      ? { kind: "platform" }
      : { kind: "organization" },
    capabilities: [...position.capabilities],
    navigationItems: [...position.navigationItems],
    createdAt: position.createdAt,
  };
}

function AdminAccountsWorkspace({
  profile,
  onShowToast,
}: {
  profile: ServerUserProfile;
  onShowToast: ShowToast;
}) {
  const canManage = canManageUsers(profile);
  const canManageAccess = hasCapability(profile, "platform.manage_access");
  const [accountsState, setAccountsState] = useState<AdminAccountsLoadState>({
    status: "loading",
    message: "Загружаем учётные записи.",
  });
  const [positionsState, setPositionsState] = useState<AdminPositionsLoadState>({
    status: "loading",
    message: "Загружаем должности.",
  });
  const [positionOrderDraft, setPositionOrderDraft] = useState<
    AdminPositionSummary[]
  >();
  const [positionOrderAutosaveRetryVersion, setPositionOrderAutosaveRetryVersion] =
    useState(0);
  const [isSavingPositionOrder, setIsSavingPositionOrder] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [revealedPasswords, setRevealedPasswords] = useState<
    Record<string, string>
  >({});
  const [form, setForm] = useState<AdminAccountFormState>(emptyAdminAccountForm);
  const [formStatus, setFormStatus] = useState("");
  const [workspaceStatus, setWorkspaceStatus] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isNotificationModalOpen, setIsNotificationModalOpen] = useState(false);
  const [positionForm, setPositionForm] = useState<AdminPositionFormState>(emptyAdminPositionForm);
  const [positionFormStatus, setPositionFormStatus] = useState("");
  const [isPositionModalOpen, setIsPositionModalOpen] = useState(false);
  const [deletingPositionId, setDeletingPositionId] = useState<string>();
  const [passwordResetForm, setPasswordResetForm] =
    useState<AdminPasswordResetFormState>();
  const [passwordResetStatus, setPasswordResetStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resettingLogin, setResettingLogin] = useState<string | undefined>(
    undefined,
  );
  const [updatingUserId, setUpdatingUserId] = useState<string | undefined>(
    undefined,
  );
  const [protectingUserId, setProtectingUserId] = useState<string>();
  const [protectingPositionId, setProtectingPositionId] = useState<string>();
  const [updatingPositionAccessId, setUpdatingPositionAccessId] = useState<
    string | undefined
  >(undefined);
  const [accountPositionDrafts, setAccountPositionDrafts] = useState<
    Record<string, AccountPosition>
  >({});
  const [deletingUserId, setDeletingUserId] = useState<string>();
  const canAssignAdminNavigation =
    positionsState.status === "ready" &&
    positionsState.canAssignAdminNavigation;
  const canManageProtectedAccounts =
    accountsState.status === "ready" &&
    accountsState.canManageProtectedAccounts;
  const canManageProtectedPositions =
    positionsState.status === "ready" &&
    positionsState.canManageProtectedPositions;
  const createAccountButtonRef = useRef<HTMLButtonElement>(null);
  const createLoginInputRef = useRef<HTMLInputElement>(null);
  const passwordResetButtonRef = useRef<HTMLButtonElement>(null);
  const passwordResetInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!canManage) {
      setAccountsState({
        status: "error",
        message: "Серверный профиль не разрешает управление учётными записями.",
        code: "access_denied",
      });
      return;
    }

    const controller = new AbortController();

    setAccountsState((current) =>
      current.status === "ready"
        ? current
        : {
            status: "loading",
            message: "Загружаем учётные записи.",
          },
    );

    requestAdminAccounts({ signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted) {
        setAccountsState(result);
      }
    });
    requestAdminPositions({ signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted) {
        setPositionsState(result);
      }
    });

    return () => {
      controller.abort();
    };
  }, [canManage, refreshVersion]);

  useEffect(() => {
    if (positionOrderDraft === undefined) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void savePositionOrder(positionOrderDraft);
    }, positionOrderAutosaveDelayMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [positionOrderDraft, positionOrderAutosaveRetryVersion]);

  useEffect(() => {
    if (!isCreateModalOpen) {
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      createLoginInputRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [isCreateModalOpen]);

  useEffect(() => {
    if (!isCreateModalOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSubmitting) {
        event.preventDefault();
        closeCreateModal();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isCreateModalOpen, isSubmitting]);

  useEffect(() => {
    if (passwordResetForm === undefined) {
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      passwordResetInputRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [passwordResetForm?.login]);

  useEffect(() => {
    if (passwordResetForm === undefined) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && resettingLogin === undefined) {
        event.preventDefault();
        closePasswordResetModal();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [passwordResetForm?.login, resettingLogin]);

  function openCreateModal() {
    const firstPosition = positionsState.status === "ready"
      ? positionsState.positions.find(
          (position) =>
            positionsState.canAssignAdminNavigation ||
            !hasAdminPositionNavigation(position),
        )
      : undefined;
    setForm((current) => ({
      ...emptyAdminAccountForm,
      position: firstPosition?.id ?? current.position,
    }));
    setFormStatus("");
    setIsCreateModalOpen(true);
  }

  function openPositionModal(position?: AdminPositionSummary) {
    if (
      positionOrderDraft !== undefined ||
      isSavingPositionOrder ||
      (position?.isAdminProtected === true && !canManageProtectedPositions)
    ) {
      return;
    }

    setPositionForm(position === undefined
      ? {
          ...emptyAdminPositionForm,
          navigationItems: [...emptyAdminPositionForm.navigationItems],
        }
      : {
          id: position.id,
          displayName: position.displayName,
          navigationItems: Array.from(new Set([
            ...position.navigationItems.filter((id) =>
              [...nonAdminNavigationItems, ...navigationItemsByAccountType.admin]
                .some((item) => item.id === id),
            ),
            ...(position.accountType === "business_owner"
              ? ["business.settings" as const]
              : []),
          ])),
          boardAssignmentAccess: position.boardAssignmentAccess,
          showAdminNavigation: position.navigationItems.some(
            isAdminNavigationItemId,
          ),
          requireNotificationSettings: position.accountType === "business_owner",
        });
    setPositionFormStatus("");
    setIsPositionModalOpen(true);
  }

  async function handlePositionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      positionForm.displayName.trim().length === 0 ||
      positionForm.navigationItems.length === 0
    ) {
      setPositionFormStatus("Укажите название и выберите хотя бы одну вкладку.");
      return;
    }
    setIsSubmitting(true);
    const value = {
      displayName: positionForm.displayName.trim(),
      navigationItems: positionForm.navigationItems,
      boardAssignmentAccess: positionForm.boardAssignmentAccess,
    };
    const result = positionForm.id === undefined
      ? await createAdminPosition(value)
      : await updateAdminPosition(positionForm.id, value);
    setIsSubmitting(false);
    if (result.status !== "ready") {
      setPositionFormStatus(result.message);
      return;
    }
    setIsPositionModalOpen(false);
    setWorkspaceStatus("");
    onShowToast(
      "Сохранено",
      `Должность «${result.position.displayName}» сохранена.`,
      "success",
    );
    setRefreshVersion((version) => version + 1);
  }

  async function handleDeletePosition(position: AdminPositionSummary) {
    if (
      !canDeleteAdminPosition(position) ||
      (position.isAdminProtected && !canManageProtectedPositions) ||
      deletingPositionId !== undefined ||
      positionOrderDraft !== undefined ||
      isSavingPositionOrder
    ) {
      return;
    }
    if (!window.confirm(`Удалить должность «${position.displayName}»?`)) {
      return;
    }

    setDeletingPositionId(position.id);
    setWorkspaceStatus("");
    const result = await deleteAdminPosition(position.id);
    setDeletingPositionId(undefined);
    if (result.status !== "ready") {
      setWorkspaceStatus(result.message);
      return;
    }
    setWorkspaceStatus("");
    onShowToast(
      "Удалено",
      `Должность «${position.displayName}» удалена.`,
      "success",
    );
    setRefreshVersion((version) => version + 1);
  }

  function handleMovePosition(positionId: string, direction: -1 | 1) {
    if (
      positionsState.status !== "ready" ||
      isSavingPositionOrder ||
      deletingPositionId !== undefined ||
      isSubmitting
    ) {
      return;
    }

    const currentPositions = positionOrderDraft ?? positionsState.positions;
    const currentIndex = currentPositions.findIndex(
      (position) => position.id === positionId,
    );
    const movedPositions = [
      currentPositions[currentIndex],
      currentPositions[currentIndex + direction],
    ];
    if (
      !canManageProtectedPositions &&
      movedPositions.some((position) => position?.isAdminProtected === true)
    ) {
      return;
    }

    setPositionOrderDraft((current) =>
      moveAdminPosition(
        current ?? positionsState.positions,
        positionId,
        direction,
      )
    );
    setWorkspaceStatus("");
  }

  async function savePositionOrder(positions: AdminPositionSummary[]) {
    setIsSavingPositionOrder(true);
    setWorkspaceStatus("");
    const result = await saveAdminPositionOrder(
      positions.map((position) => position.id),
    );
    setIsSavingPositionOrder(false);
    if (result.status !== "ready") {
      setWorkspaceStatus(result.message);
      if (
        result.code === "network_error" ||
        (result.statusCode !== undefined && result.statusCode >= 500)
      ) {
        setPositionOrderAutosaveRetryVersion((version) => version + 1);
      }
      return;
    }

    setPositionsState(result);
    setPositionOrderDraft(undefined);
    setPositionOrderAutosaveRetryVersion(0);
    onShowToast(
      "Порядок сохранён",
      "Списки должностей и учётных записей обновлены.",
      "success",
    );
    setRefreshVersion((version) => version + 1);
  }

  async function handleSetPositionProtected(
    position: AdminPositionSummary,
    isProtected: boolean,
  ) {
    if (
      !canManageProtectedPositions ||
      protectingPositionId !== undefined ||
      (position.accountType === "admin" && !isProtected)
    ) {
      return;
    }
    setProtectingPositionId(position.id);
    setWorkspaceStatus("");
    const result = await setAdminPositionProtected({
      id: position.id,
      isProtected,
    });
    setProtectingPositionId(undefined);
    if (result.status !== "ready") {
      setWorkspaceStatus(result.message);
      return;
    }
    onShowToast(
      "Защита изменена",
      isProtected
        ? `Должность «${position.displayName}» защищена.`
        : `Защита должности «${position.displayName}» отключена.`,
      "success",
    );
    setRefreshVersion((version) => version + 1);
  }

  function closeCreateModal() {
    if (isSubmitting) {
      return;
    }

    setIsCreateModalOpen(false);
    window.requestAnimationFrame(() => createAccountButtonRef.current?.focus());
  }

  function finishCreateModal() {
    setIsCreateModalOpen(false);
    window.requestAnimationFrame(() => createAccountButtonRef.current?.focus());
  }

  function openPasswordResetModal(
    login: string,
    trigger: HTMLButtonElement,
  ) {
    passwordResetButtonRef.current = trigger;
    setPasswordResetForm({ login, password: "" });
    setPasswordResetStatus("");
    setWorkspaceStatus("");
  }

  function closePasswordResetModal() {
    if (resettingLogin !== undefined) {
      return;
    }

    setPasswordResetForm(undefined);
    setPasswordResetStatus("");
    window.requestAnimationFrame(() => passwordResetButtonRef.current?.focus());
  }

  function finishPasswordResetModal() {
    setPasswordResetForm(undefined);
    setPasswordResetStatus("");
    window.requestAnimationFrame(() => passwordResetButtonRef.current?.focus());
  }

  function handleFormFieldChange(patch: Partial<AdminAccountFormState>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function handleGeneratePassword() {
    handleFormFieldChange({ password: generateStrongPassword() });
  }

  async function handleCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const submittedLogin = form.login.trim();

    if (
      submittedLogin.length === 0 ||
      form.password.length < 8 ||
      form.displayName.trim().length === 0
    ) {
      setFormStatus("Заполните логин, пароль (от 8 символов) и имя.");
      return;
    }

    if (
      accountsState.status === "ready" &&
      hasAdminAccountLogin(accountsState.accounts, submittedLogin)
    ) {
      setFormStatus("Учётная запись с таким логином уже существует.");
      return;
    }

    const selectedPosition = positionsState.status === "ready"
      ? positionsState.positions.find((position) => position.id === form.position)
      : undefined;
    if (
      selectedPosition !== undefined &&
      hasAdminPositionNavigation(selectedPosition) &&
      !canAssignAdminNavigation
    ) {
      setFormStatus(
        "Должность с административными вкладками может назначать только аккаунт admin.",
      );
      return;
    }

    setIsSubmitting(true);
    setFormStatus("Создаём учётную запись.");

    const submittedPassword = form.password;
    const result = await createAdminAccount({
      login: submittedLogin,
      password: submittedPassword,
      displayName: form.displayName.trim(),
      email: form.email.trim(),
      maxUserId: form.maxUserId.trim(),
      position: form.position,
    });

    setIsSubmitting(false);

    if (result.status !== "ready") {
      setFormStatus(result.message);
      return;
    }

    setRevealedPasswords((current) => ({
      ...current,
      [submittedLogin]: submittedPassword,
    }));
    setWorkspaceStatus("");
    onShowToast(
      "Аккаунт создан",
      `Учётная запись «${result.account.login}» создана.`,
      "success",
    );
    setForm({
      ...emptyAdminAccountForm,
      position: form.position,
    });
    finishCreateModal();
    setRefreshVersion((version) => version + 1);
  }

  function handleGenerateResetPassword() {
    setPasswordResetStatus("");
    setPasswordResetForm((current) =>
      current === undefined
        ? current
        : { ...current, password: generateStrongPassword() },
    );
  }

  async function handleResetPasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (passwordResetForm === undefined || resettingLogin !== undefined) {
      return;
    }

    if (passwordResetForm.password.length < 8) {
      setPasswordResetStatus("Введите новый пароль — минимум 8 символов.");
      return;
    }

    const submittedLogin = passwordResetForm.login;
    const submittedPassword = passwordResetForm.password;

    setResettingLogin(submittedLogin);
    setPasswordResetStatus("Сохраняем новый пароль.");

    const result = await resetAdminAccountPassword({
      login: submittedLogin,
      password: submittedPassword,
    });

    setResettingLogin(undefined);

    if (result.status !== "ready") {
      setPasswordResetStatus(result.message);
      return;
    }

    setRevealedPasswords((current) => ({
      ...current,
      [submittedLogin]: submittedPassword,
    }));
    setWorkspaceStatus("");
    onShowToast(
      "Пароль изменён",
      `Пароль для «${submittedLogin}» изменён.`,
      "success",
    );
    finishPasswordResetModal();
  }

  async function handleSetAccountLoginEnabled(account: AdminAccountSummary) {
    const isEnabled = account.userStatus !== "active";

    setUpdatingUserId(account.userId);
    setWorkspaceStatus("");

    const result = await setAdminAccountLoginEnabled({
      userId: account.userId,
      isEnabled,
    });

    setUpdatingUserId(undefined);

    if (result.status !== "ready") {
      setWorkspaceStatus(result.message);
      return;
    }

    onShowToast(
      "Доступ изменён",
      isEnabled
        ? `Доступ для «${account.login}» включён.`
        : `Доступ для «${account.login}» отключён.`,
      "success",
    );
    setRefreshVersion((version) => version + 1);
  }

  async function handleSetAccountProtected(
    account: AdminAccountSummary,
    isProtected: boolean,
  ) {
    if (!canManageProtectedAccounts || protectingUserId !== undefined) {
      return;
    }

    setProtectingUserId(account.userId);
    setWorkspaceStatus("");
    const result = await setAdminAccountProtected({
      userId: account.userId,
      isProtected,
    });
    setProtectingUserId(undefined);

    if (result.status !== "ready") {
      setWorkspaceStatus(result.message);
      return;
    }

    onShowToast(
      "Защита изменена",
      isProtected
        ? `Учётная запись «${account.login}» защищена.`
        : `Защита учётной записи «${account.login}» отключена.`,
      "success",
    );
    setRefreshVersion((version) => version + 1);
  }

  async function handleSetAccountPosition(account: AdminAccountSummary) {
    const position = accountPositionDrafts[account.accessId] ?? account.position;

    if (
      position === account.position ||
      updatingPositionAccessId !== undefined
    ) {
      return;
    }
    const selectedPosition = positionsState.status === "ready"
      ? positionsState.positions.find((candidate) => candidate.id === position)
      : undefined;
    if (
      selectedPosition !== undefined &&
      hasAdminPositionNavigation(selectedPosition) &&
      !canAssignAdminNavigation
    ) {
      setWorkspaceStatus(
        "Должность с административными вкладками может назначать только аккаунт admin.",
      );
      return;
    }

    setUpdatingPositionAccessId(account.accessId);
    setWorkspaceStatus("");

    const result = await setAdminAccountPosition({
      accessId: account.accessId,
      position,
    });

    setUpdatingPositionAccessId(undefined);

    if (result.status !== "ready") {
      setWorkspaceStatus(result.message);
      return;
    }

    setAccountPositionDrafts((current) => {
      const next = { ...current };
      delete next[account.accessId];
      return next;
    });
    onShowToast(
      "Должность изменена",
      `Должность для «${account.login}» изменена на «${result.account.positionDisplayName}». Пользователю нужно войти заново.`,
      "success",
    );
    setRefreshVersion((version) => version + 1);
  }

  async function handleDeleteAccount(account: AdminAccountSummary) {
    if (account.userId === profile.userId || deletingUserId !== undefined) {
      return;
    }
    if (!window.confirm(
      `Удалить учётную запись «${account.login}»? Вход будет закрыт, сохранённая история останется.`,
    )) {
      return;
    }

    setDeletingUserId(account.userId);
    setWorkspaceStatus("");
    const result = await deleteAdminAccount(account.userId);
    setDeletingUserId(undefined);
    if (result.status !== "ready") {
      setWorkspaceStatus(result.message);
      return;
    }
    setWorkspaceStatus("");
    onShowToast(
      "Аккаунт удалён",
      `Учётная запись «${account.login}» удалена.`,
      "success",
    );
    setRefreshVersion((version) => version + 1);
  }

  if (!canManage) {
    return (
      <section className="admin-workspace" aria-label="Учётные записи">
        <p className="dispatcher-status-line">
          Серверный профиль не разрешает управление учётными записями.
        </p>
      </section>
    );
  }

  const accounts = accountsState.status === "ready" ? accountsState.accounts : [];
  const displayedPositions = positionOrderDraft ??
    (positionsState.status === "ready" ? positionsState.positions : []);

  return (
    <section className="admin-workspace" aria-label="Учётные записи">
      <div className="admin-accounts-list">
        <div className="admin-accounts-toolbar">
          <button
            ref={createAccountButtonRef}
            aria-controls="admin-account-create-dialog"
            aria-expanded={isCreateModalOpen}
            aria-haspopup="dialog"
            className="primary-button"
            type="button"
            disabled={
              positionsState.status !== "ready" ||
              !positionsState.positions.some(
                (position) =>
                  positionsState.canAssignAdminNavigation ||
                  !hasAdminPositionNavigation(position),
              )
            }
            onClick={openCreateModal}
          >
            Новая учётная запись
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={
              !canManageAccess ||
              positionOrderDraft !== undefined ||
              isSavingPositionOrder
            }
            onClick={() => openPositionModal()}
          >
            Новая должность
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => setIsNotificationModalOpen(true)}
          >
            Рассылки
          </button>
        </div>

        {workspaceStatus.length > 0 ? (
          <p className="admin-accounts-status-message" role="status">
            {workspaceStatus}
          </p>
        ) : null}
        {accountsState.status === "loading" ? (
          <LoadingIndicator label={accountsState.message} variant="page" />
        ) : null}
        {accountsState.status === "error" ? (
          <p className="dispatcher-status-line">{accountsState.message}</p>
        ) : null}

        {accountsState.status === "ready" ? (
          <div className="admin-db-table-scroll">
            <table className="admin-db-data-table admin-accounts-table">
              <thead>
                <tr>
                  <th scope="col">Должность</th>
                  <th scope="col">Имя</th>
                  <th scope="col">Логин</th>
                  <th scope="col">Email</th>
                  <th scope="col">MAX</th>
                  <th scope="col">Защита</th>
                  <th scope="col">Пароль</th>
                  <th scope="col">Вкладки слева</th>
                  <th scope="col">Статус</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => {
                  const isLoginEnabled = account.userStatus === "active";
                  const isCurrentAccount = account.userId === profile.userId;
                  const isArchived = account.userStatus === "archived";
                  const isOriginalAdmin =
                    account.login.trim().toLocaleLowerCase("en-US") === "admin";
                  const isProtectedMutationRestricted =
                    account.isProtected && !canManageProtectedAccounts;
                  const isUpdating = updatingUserId === account.userId;
                  const isUpdatingPosition =
                    updatingPositionAccessId === account.accessId;
                  const selectedPosition =
                    accountPositionDrafts[account.accessId] ?? account.position;
                  const selectedPositionDefinition =
                    positionsState.status === "ready"
                      ? positionsState.positions.find(
                          (position) => position.id === selectedPosition,
                        )
                      : undefined;
                  const isSelectedPositionRestricted =
                    positionsState.status === "ready" &&
                    !positionsState.canAssignAdminNavigation &&
                    selectedPositionDefinition !== undefined &&
                    hasAdminPositionNavigation(selectedPositionDefinition);
                  const isPositionChangeDisabled =
                    !canManageAccess ||
                    isCurrentAccount ||
                    isProtectedMutationRestricted ||
                    isArchived ||
                    positionsState.status !== "ready" ||
                    updatingPositionAccessId !== undefined ||
                    updatingUserId !== undefined;
                  const isToggleDisabled =
                    !canManageAccess ||
                    isCurrentAccount ||
                    isProtectedMutationRestricted ||
                    isArchived ||
                    isUpdating ||
                    updatingPositionAccessId !== undefined;
                  const toggleTitle = !canManageAccess
                    ? "Нет права изменять доступ."
                    : isCurrentAccount
                      ? "Нельзя отключить текущую учётную запись."
                      : isProtectedMutationRestricted
                        ? "Защищённую учётную запись может отключить только исходный аккаунт admin."
                      : isArchived
                        ? "Архивную учётную запись нельзя включить."
                        : undefined;

                  return (
                    <tr key={account.accessId}>
                      <td>
                        <div className="admin-account-position-cell">
                          <select
                            aria-label={`Должность для ${account.login}`}
                            value={selectedPosition}
                            disabled={isPositionChangeDisabled}
                            title={
                              isCurrentAccount
                                ? "Нельзя менять должность текущей учётной записи."
                                : isProtectedMutationRestricted
                                  ? "Должность защищённой учётной записи может менять только исходный аккаунт admin."
                                : undefined
                            }
                            onChange={(event) => {
                              const position = event.currentTarget
                                .value as AccountPosition;
                              setAccountPositionDrafts((current) => ({
                                ...current,
                                [account.accessId]: position,
                              }));
                            }}
                          >
                            {positionsState.status !== "ready" ||
                            !positionsState.positions.some(
                              (position) => position.id === account.position,
                            ) ? (
                              <option value={account.position}>
                                {account.positionDisplayName}
                              </option>
                            ) : null}
                            {(positionsState.status === "ready"
                              ? positionsState.positions
                              : []
                            ).map((position) => (
                              <option
                                key={position.id}
                                value={position.id}
                                disabled={
                                  !canAssignAdminNavigation &&
                                  hasAdminPositionNavigation(position)
                                }
                              >
                                {position.displayName}
                              </option>
                            ))}
                          </select>
                          <button
                            className="secondary-button"
                            type="button"
                            disabled={
                              isPositionChangeDisabled ||
                              isSelectedPositionRestricted ||
                              selectedPosition === account.position
                            }
                            onClick={() => handleSetAccountPosition(account)}
                          >
                            {isUpdatingPosition ? (
                              <LoadingIndicator
                                label="Сохраняем…"
                                variant="button"
                              />
                            ) : "Сохранить"}
                          </button>
                        </div>
                      </td>
                      <td>{account.userDisplayName}</td>
                      <td>{account.login}</td>
                      <td>{account.email ?? "—"}</td>
                      <td>{account.maxUserId ?? "—"}</td>
                      <td>
                        <label
                          className="admin-account-protection-control"
                          title={
                            isOriginalAdmin
                              ? "Защиту исходного аккаунта admin нельзя отключить."
                              : !canManageProtectedAccounts
                                ? "Защиту может изменять только исходный аккаунт admin."
                                : undefined
                          }
                        >
                          <input
                            aria-label={`Защитить аккаунт ${account.login}`}
                            type="checkbox"
                            checked={account.isProtected}
                            disabled={
                              !canManageProtectedAccounts ||
                              isOriginalAdmin ||
                              protectingUserId !== undefined
                            }
                            onChange={(event) => {
                              const isProtected = event.currentTarget.checked;
                              void handleSetAccountProtected(
                                account,
                                isProtected,
                              );
                            }}
                          />
                          <span>
                            {protectingUserId === account.userId
                              ? "Сохраняем…"
                              : account.isProtected
                                ? "Защищён"
                                : "Обычный"}
                          </span>
                        </label>
                      </td>
                      <td>
                        <AdminAccountPasswordCell
                          revealedPassword={revealedPasswords[account.login]}
                          isResetting={resettingLogin === account.login}
                          isResetDisabled={isProtectedMutationRestricted}
                          resetTitle={
                            isProtectedMutationRestricted
                              ? "Пароль защищённой учётной записи может менять только исходный аккаунт admin."
                              : undefined
                          }
                          onReset={(trigger) =>
                            openPasswordResetModal(account.login, trigger)
                          }
                        />
                      </td>
                      <td>
                        <div className="admin-account-navigation-cell">
                          <details className="admin-account-access-details">
                            <summary>
                              Доступы должности ({account.navigationItems.length})
                            </summary>
                            <div className="admin-account-access-grid">
                              {[...navigationItemsByAccountType.admin, ...nonAdminNavigationItems]
                                .filter((item) => account.navigationItems.includes(item.id))
                                .map((item) => <span key={item.id}>{formatNavigationItemLabel(item)}</span>)}
                            </div>
                          </details>
                        </div>
                      </td>
                      <td>
                        <div className="admin-accounts-access-cell">
                          <span
                            className={`admin-accounts-status-badge ${
                              isLoginEnabled ? "is-enabled" : "is-disabled"
                            }`}
                          >
                            {formatAdminAccountStatus(account.userStatus)}
                          </span>
                          <button
                            aria-label={`${
                              isLoginEnabled ? "Отключить" : "Включить"
                            } вход для ${account.login}`}
                            className="secondary-button"
                            type="button"
                            title={toggleTitle}
                            disabled={isToggleDisabled}
                            onClick={() => handleSetAccountLoginEnabled(account)}
                          >
                            {isUpdating
                              ? (
                                  <LoadingIndicator
                                    label="Сохраняем…"
                                    variant="button"
                                  />
                                )
                              : isLoginEnabled
                                ? "Отключить"
                                : "Включить"}
                          </button>
                          <button
                            className="secondary-button secondary-button-danger"
                            type="button"
                            title={
                              isCurrentAccount
                                ? "Нельзя удалить текущую учётную запись."
                                : isProtectedMutationRestricted
                                  ? "Защищённую учётную запись может удалить только исходный аккаунт admin."
                                  : undefined
                            }
                            disabled={
                              !canManageAccess ||
                              isCurrentAccount ||
                              isProtectedMutationRestricted ||
                              updatingPositionAccessId !== undefined ||
                              deletingUserId === account.userId
                            }
                            onClick={() => handleDeleteAccount(account)}
                          >
                            {deletingUserId === account.userId ? (
                              <LoadingIndicator
                                label="Удаляем…"
                                variant="button"
                              />
                            ) : "Удалить"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {accounts.length === 0 ? (
                  <tr>
                    <td colSpan={9}>Учётных записей пока нет.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="admin-positions-heading">
          <div>
            <h3 className="admin-positions-title">Должности и доступы</h3>
            <p>
              Перемещайте должности кнопками — порядок сохраняется автоматически
              через 5 секунд после последнего изменения.
            </p>
          </div>
          <div className="admin-position-order-actions">
            <button
              className="secondary-button"
              type="button"
              disabled={
                positionOrderDraft === undefined ||
                isSavingPositionOrder
              }
              onClick={() => {
                setPositionOrderDraft(undefined);
                setPositionOrderAutosaveRetryVersion(0);
              }}
            >
              Отменить
            </button>
          </div>
        </div>
        {positionsState.status === "ready" ? (
          <div className="admin-db-table-scroll">
            <table className="admin-db-data-table admin-positions-table">
              <thead>
                <tr>
                  <th>Порядок</th>
                  <th>Должность</th>
                  <th>Защита</th>
                  <th>Вкладки слева</th>
                  <th>Аккаунты</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {displayedPositions.map((position, index) => {
                  const isProtectedMutationRestricted =
                    position.isAdminProtected &&
                    !canManageProtectedPositions;
                  const previousPosition = displayedPositions[index - 1];
                  const nextPosition = displayedPositions[index + 1];
                  const isMoveUpProtected =
                    !canManageProtectedPositions &&
                    (position.isAdminProtected ||
                      previousPosition?.isAdminProtected === true);
                  const isMoveDownProtected =
                    !canManageProtectedPositions &&
                    (position.isAdminProtected ||
                      nextPosition?.isAdminProtected === true);
                  return (
                  <tr key={position.id}>
                    <td>
                      <div className="admin-position-order-cell">
                        <span aria-label={`Позиция ${index + 1}`}>
                          {index + 1}
                        </span>
                        <button
                          className="secondary-button"
                          type="button"
                          aria-label={`Поднять должность «${position.displayName}» выше`}
                          disabled={
                            !canManageAccess ||
                            index === 0 ||
                            isMoveUpProtected ||
                            isSavingPositionOrder ||
                            deletingPositionId !== undefined ||
                            isSubmitting
                          }
                          onClick={() => handleMovePosition(position.id, -1)}
                        >
                          Выше
                        </button>
                        <button
                          className="secondary-button"
                          type="button"
                          aria-label={`Опустить должность «${position.displayName}» ниже`}
                          disabled={
                            !canManageAccess ||
                            index === displayedPositions.length - 1 ||
                            isMoveDownProtected ||
                            isSavingPositionOrder ||
                            deletingPositionId !== undefined ||
                            isSubmitting
                          }
                          onClick={() => handleMovePosition(position.id, 1)}
                        >
                          Ниже
                        </button>
                      </div>
                    </td>
                    <td>{position.displayName}</td>
                    <td>
                      <label
                        className="admin-account-protection-control"
                        title={
                          position.accountType === "admin"
                            ? "Защиту должности администратора нельзя отключить."
                            : !canManageProtectedPositions
                              ? "Защиту может изменять только исходный аккаунт admin."
                              : undefined
                        }
                      >
                        <input
                          aria-label={`Защитить должность ${position.displayName}`}
                          type="checkbox"
                          checked={position.isAdminProtected}
                          disabled={
                            !canManageProtectedPositions ||
                            position.accountType === "admin" ||
                            protectingPositionId !== undefined
                          }
                          onChange={(event) => {
                            const isProtected = event.currentTarget.checked;
                            void handleSetPositionProtected(
                              position,
                              isProtected,
                            );
                          }}
                        />
                        <span>
                          {protectingPositionId === position.id
                            ? "Сохраняем…"
                            : position.isAdminProtected
                              ? "Защищена"
                              : "Обычная"}
                        </span>
                      </label>
                    </td>
                    <td>{position.navigationItems
                      .map((id) => formatPositionNavigationItem(position, id))
                      .join(", ")}</td>
                    <td>{position.usageCount}</td>
                    <td>
                      <div className="admin-position-actions">
                        <button
                          className="secondary-button"
                          type="button"
                          disabled={
                            !canManageAccess ||
                            position.accountType === "admin" ||
                            isProtectedMutationRestricted ||
                            positionOrderDraft !== undefined ||
                            isSavingPositionOrder
                          }
                          onClick={() => openPositionModal(position)}
                        >
                          Изменить
                        </button>
                        <button
                          className="secondary-button secondary-button-danger"
                          type="button"
                          title={
                            position.accountType === "admin"
                              ? "Должность администратора удалить нельзя."
                              : isProtectedMutationRestricted
                                ? "Защищённую должность может удалить только исходный аккаунт admin."
                              : position.usageCount > 0
                                ? "Сначала назначьте этим аккаунтам другую должность."
                                : undefined
                          }
                          disabled={
                            !canManageAccess ||
                            !canDeleteAdminPosition(position) ||
                            isProtectedMutationRestricted ||
                            deletingPositionId === position.id ||
                            positionOrderDraft !== undefined ||
                            isSavingPositionOrder
                          }
                          onClick={() => handleDeletePosition(position)}
                        >
                          {deletingPositionId === position.id ? (
                            <LoadingIndicator
                              label="Удаляем…"
                              variant="button"
                            />
                          ) : "Удалить"}
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : positionsState.status === "loading" ? (
          <LoadingIndicator label={positionsState.message} variant="panel" />
        ) : (
          <p className="dispatcher-status-line">{positionsState.message}</p>
        )}
      </div>

      <AdminNotificationSettingsModal
        isOpen={isNotificationModalOpen}
        canManageProtectedAccounts={canManageProtectedAccounts}
        onClose={() => setIsNotificationModalOpen(false)}
        onContactsUpdated={() => setRefreshVersion((current) => current + 1)}
        onShowToast={onShowToast}
      />

      {isCreateModalOpen ? (
        <div
          className="admin-db-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeCreateModal();
            }
          }}
        >
          <section
            aria-labelledby="admin-account-create-title"
            aria-modal="true"
            className="admin-account-modal"
            id="admin-account-create-dialog"
            role="dialog"
            onKeyDown={keepFocusInsideDialog}
          >
            <div className="admin-account-modal-header">
              <h3 id="admin-account-create-title">Новая учётная запись</h3>
              <button
                className="secondary-button"
                type="button"
                disabled={isSubmitting}
                onClick={closeCreateModal}
              >
                Закрыть
              </button>
            </div>

            <form
              className="data-entry-form admin-accounts-form"
              onSubmit={handleCreateSubmit}
            >
              <label>
                <span>Логин</span>
                <input
                  ref={createLoginInputRef}
                  type="text"
                  value={form.login}
                  autoComplete="off"
                  onChange={(event) =>
                    handleFormFieldChange({ login: event.currentTarget.value })
                  }
                  required
                />
              </label>

              <label>
                <span>Пароль</span>
                <div className="admin-accounts-password-field">
                  <input
                    type="text"
                    value={form.password}
                    autoComplete="off"
                    minLength={8}
                    onChange={(event) =>
                      handleFormFieldChange({ password: event.currentTarget.value })
                    }
                    required
                  />
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={handleGeneratePassword}
                  >
                    Сгенерировать
                  </button>
                </div>
              </label>

              <label>
                <span>Отображаемое имя</span>
                <input
                  type="text"
                  value={form.displayName}
                  onChange={(event) =>
                    handleFormFieldChange({
                      displayName: event.currentTarget.value,
                    })
                  }
                  required
                />
              </label>

              <label>
                <span>Email</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    handleFormFieldChange({ email: event.currentTarget.value })
                  }
                />
              </label>

              <label>
                <span>MAX</span>
                <input
                  type="text"
                  value={form.maxUserId}
                  onChange={(event) =>
                    handleFormFieldChange({ maxUserId: event.currentTarget.value })
                  }
                />
              </label>

              <label>
                <span>Должность</span>
                <select
                  value={form.position}
                  onChange={(event) =>
                    handleFormFieldChange({
                      position: event.currentTarget.value as AccountPosition,
                    })
                  }
                >
                  {(positionsState.status === "ready" ? positionsState.positions : []).map((position) => (
                    <option
                      key={position.id}
                      value={position.id}
                      disabled={
                        !canAssignAdminNavigation &&
                        hasAdminPositionNavigation(position)
                      }
                    >
                      {position.displayName}
                    </option>
                  ))}
                </select>
              </label>

              <div className="form-actions">
                <button
                  className="primary-button"
                  type="submit"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <LoadingIndicator
                      label="Создаём…"
                      variant="button"
                    />
                  ) : "Создать"}
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={isSubmitting}
                  onClick={closeCreateModal}
                >
                  Отмена
                </button>
                {formStatus.length > 0 ? (
                  <p className="form-status" role="status">
                    {formStatus}
                  </p>
                ) : null}
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {isPositionModalOpen && positionsState.status === "ready" ? (
        <div className="admin-db-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !isSubmitting) setIsPositionModalOpen(false);
        }}>
          <section aria-labelledby="admin-position-title" aria-modal="true" className="admin-account-modal" role="dialog" onKeyDown={keepFocusInsideDialog}>
            <div className="admin-account-modal-header">
              <div className="admin-position-modal-heading">
                <h3 id="admin-position-title">{positionForm.id === undefined ? "Новая должность" : "Настройка должности"}</h3>
                <label
                  className="admin-position-admin-toggle"
                  title={
                    positionsState.canAssignAdminNavigation
                      ? undefined
                      : "Административные вкладки может назначать только аккаунт admin."
                  }
                >
                  <input
                    type="checkbox"
                    checked={positionForm.showAdminNavigation}
                    disabled={isSubmitting || !positionsState.canAssignAdminNavigation}
                    onChange={(event) => {
                      const isChecked = event.currentTarget.checked;
                      setPositionForm((current) => ({
                        ...current,
                        showAdminNavigation: isChecked,
                        navigationItems: isChecked
                          ? current.navigationItems
                          : current.navigationItems.filter(
                              (itemId) => !isAdminNavigationItemId(itemId),
                            ),
                      }));
                    }}
                  />
                  <span>Админ</span>
                </label>
              </div>
              <button className="secondary-button" type="button" disabled={isSubmitting} onClick={() => setIsPositionModalOpen(false)}>Закрыть</button>
            </div>
            {!positionsState.canAssignAdminNavigation &&
            !positionForm.showAdminNavigation ? (
              <p className="dispatcher-status-line">
                Административные вкладки может назначать только аккаунт admin.
              </p>
            ) : null}
            <form className="data-entry-form admin-accounts-form" onSubmit={handlePositionSubmit}>
              <label>
                <span>Название должности</span>
                <input value={positionForm.displayName} onChange={(event) => {
                  const displayName = event.currentTarget.value;
                  setPositionForm((current) => ({ ...current, displayName }));
                }} required />
              </label>
              <fieldset className="admin-account-navigation-fieldset">
                <legend>Рабочие вкладки</legend>
                <div className="admin-account-navigation-grid">
                  {nonAdminNavigationItems
                    .filter(
                      (item) => item.id !== "business.board_assignments",
                    )
                    .map((item) => (
                      <label key={item.id} className="admin-account-navigation-option">
                        <input type="checkbox" disabled={
                          isSubmitting ||
                          (
                            item.id === "business.settings" &&
                            positionForm.requireNotificationSettings
                          )
                        } checked={positionForm.navigationItems.includes(item.id)} onChange={(event) => {
                          const isChecked = event.currentTarget.checked;
                          setPositionForm((current) => ({
                            ...current,
                            navigationItems: isChecked
                              ? Array.from(new Set([...current.navigationItems, item.id]))
                              : current.navigationItems.filter((id) => id !== item.id),
                          }));
                        }} />
                        <span>{formatNavigationItemLabel(item)}</span>
                      </label>
                    ))}
                  {boardAssignmentAccessOptions.map((option) => (
                    <label
                      key={option.id}
                      className="admin-account-navigation-option"
                    >
                      <input
                        type="checkbox"
                        disabled={isSubmitting}
                        checked={
                          positionForm.boardAssignmentAccess === option.id
                        }
                        onChange={(event) => {
                          const isChecked = event.currentTarget.checked;
                          setPositionForm((current) => ({
                            ...current,
                            navigationItems: isChecked
                              ? Array.from(new Set([
                                  ...current.navigationItems,
                                  "business.board_assignments",
                                ]))
                              : current.navigationItems.filter(
                                  (id) =>
                                    id !== "business.board_assignments",
                                ),
                            boardAssignmentAccess: isChecked
                              ? option.id
                              : "none",
                          }));
                        }}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              {positionForm.showAdminNavigation ? (
                <fieldset className="admin-account-navigation-fieldset">
                  <legend>Административные вкладки</legend>
                  {!positionsState.canAssignAdminNavigation ? (
                    <p className="dispatcher-status-line">
                      Административные вкладки может назначать только аккаунт admin.
                    </p>
                  ) : null}
                  <div className="admin-account-navigation-grid">
                    {navigationItemsByAccountType.admin.map((item) => (
                      <label
                        key={item.id}
                        className="admin-account-navigation-option"
                      >
                        <input
                          type="checkbox"
                          checked={positionForm.navigationItems.includes(item.id)}
                          disabled={isSubmitting || !positionsState.canAssignAdminNavigation}
                          onChange={(event) => {
                            const isChecked = event.currentTarget.checked;
                            setPositionForm((current) => ({
                              ...current,
                              navigationItems: isChecked
                                ? Array.from(new Set([
                                    ...current.navigationItems,
                                    item.id,
                                  ]))
                                : current.navigationItems.filter(
                                    (itemId) => itemId !== item.id,
                                  ),
                            }));
                          }}
                        />
                        <span>{formatNavigationItemLabel(item)}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : null}
              <div className="form-actions">
                <button className="primary-button" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <LoadingIndicator
                      label="Сохраняем…"
                      variant="button"
                    />
                  ) : "Сохранить"}
                </button>
                <button className="secondary-button" type="button" disabled={isSubmitting} onClick={() => setIsPositionModalOpen(false)}>Отмена</button>
                {positionFormStatus ? <p className="form-status" role="status">{positionFormStatus}</p> : null}
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {passwordResetForm !== undefined ? (
        <div
          className="admin-db-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closePasswordResetModal();
            }
          }}
        >
          <section
            aria-labelledby="admin-account-password-reset-title"
            aria-modal="true"
            className="admin-account-modal"
            id="admin-account-password-reset-dialog"
            role="dialog"
            onKeyDown={keepFocusInsideDialog}
          >
            <div className="admin-account-modal-header">
              <h3 id="admin-account-password-reset-title">Новый пароль</h3>
              <button
                className="secondary-button"
                type="button"
                disabled={resettingLogin !== undefined}
                onClick={closePasswordResetModal}
              >
                Закрыть
              </button>
            </div>

            <p className="admin-account-password-reset-copy">
              Учётная запись: <strong>{passwordResetForm.login}</strong>. Введите
              новый пароль самостоятельно или сгенерируйте случайный.
            </p>

            <form
              className="data-entry-form admin-accounts-form"
              onSubmit={handleResetPasswordSubmit}
            >
              <label>
                <span>Новый пароль</span>
                <div className="admin-accounts-password-field">
                  <input
                    ref={passwordResetInputRef}
                    aria-describedby="admin-account-password-reset-hint"
                    type="text"
                    value={passwordResetForm.password}
                    autoComplete="new-password"
                    minLength={8}
                    readOnly={resettingLogin !== undefined}
                    spellCheck={false}
                    onChange={(event) => {
                      const password = event.currentTarget.value;

                      setPasswordResetStatus("");
                      setPasswordResetForm((current) =>
                        current === undefined
                          ? current
                          : {
                              ...current,
                              password,
                            },
                      );
                    }}
                    required
                  />
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={resettingLogin !== undefined}
                    onClick={handleGenerateResetPassword}
                  >
                    Сгенерировать
                  </button>
                </div>
              </label>

              <p
                className="admin-account-password-reset-hint"
                id="admin-account-password-reset-hint"
              >
                Минимум 8 символов.
              </p>

              <div className="form-actions">
                <button
                  className="primary-button"
                  type="submit"
                  disabled={resettingLogin !== undefined}
                >
                  {resettingLogin !== undefined
                    ? (
                        <LoadingIndicator
                          label="Сохраняем…"
                          variant="button"
                        />
                      )
                    : "Сохранить пароль"}
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={resettingLogin !== undefined}
                  onClick={closePasswordResetModal}
                >
                  Отмена
                </button>
                {passwordResetStatus.length > 0 ? (
                  <p className="form-status" role="status">
                    {passwordResetStatus}
                  </p>
                ) : null}
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function keepFocusInsideDialog(event: ReactKeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab") {
    return;
  }

  const focusableElements = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])",
    ),
  );
  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  if (firstElement === undefined || lastElement === undefined) {
    return;
  }

  if (event.shiftKey && document.activeElement === firstElement) {
    event.preventDefault();
    lastElement.focus();
  } else if (!event.shiftKey && document.activeElement === lastElement) {
    event.preventDefault();
    firstElement.focus();
  }
}

function CopyIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </svg>
  );
}

function AdminAccountPasswordCell({
  revealedPassword,
  isResetting,
  isResetDisabled,
  resetTitle,
  onReset,
}: {
  revealedPassword: string | undefined;
  isResetting: boolean;
  isResetDisabled: boolean;
  resetTitle?: string;
  onReset: (trigger: HTMLButtonElement) => void;
}) {
  const [isVisible, setIsVisible] = useState(true);
  const [didCopy, setDidCopy] = useState(false);

  useEffect(() => {
    if (revealedPassword !== undefined) {
      setIsVisible(true);
      setDidCopy(false);
    }
  }, [revealedPassword]);

  async function handleCopy() {
    const didWrite = await copyTextToClipboard(revealedPassword ?? "");

    if (!didWrite) {
      return;
    }

    setDidCopy(true);
    window.setTimeout(() => setDidCopy(false), 1500);
  }

  return (
    <div className="admin-accounts-password-cell">
      {revealedPassword === undefined ? (
        <span
          className="admin-accounts-password-hidden"
          title="Сервер хранит только хеш пароля — сам пароль нигде не сохранён и его нельзя показать или скопировать. Нажмите «Сбросить», чтобы задать новый пароль — он появится здесь и будет доступен для копирования."
        >
          Скрыт
        </span>
      ) : (
        <>
          <span className="admin-accounts-password-value">
            {isVisible
              ? revealedPassword
              : "•".repeat(Math.min(revealedPassword.length, 12))}
          </span>
          <button
            className="secondary-button"
            type="button"
            onClick={() => setIsVisible((value) => !value)}
          >
            {isVisible ? "Скрыть" : "Показать"}
          </button>
          <button
            className="secondary-button admin-accounts-copy-button"
            type="button"
            title="Скопировать пароль"
            onClick={handleCopy}
          >
            <CopyIcon />
            {didCopy ? "Скопировано" : "Копировать"}
          </button>
        </>
      )}
      <button
        key="password-reset"
        aria-controls="admin-account-password-reset-dialog"
        aria-haspopup="dialog"
        className="secondary-button"
        type="button"
        title={resetTitle}
        disabled={isResetting || isResetDisabled}
        onClick={(event) => onReset(event.currentTarget)}
      >
        {isResetting ? (
          <LoadingIndicator
            label="Сбрасываем…"
            variant="button"
          />
        ) : "Сбросить"}
      </button>
    </div>
  );
}

function formatAdminAccountStatus(status: string) {
  if (status === "active") {
    return "Активен";
  }

  if (status === "suspended") {
    return "Отключён";
  }

  if (status === "archived") {
    return "В архиве";
  }

  return status;
}

function generateStrongPassword() {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const randomValues = new Uint32Array(16);

  crypto.getRandomValues(randomValues);

  return Array.from(randomValues, (value) => alphabet[value % alphabet.length]).join(
    "",
  );
}

async function copyTextToClipboard(value: string) {
  if (navigator.clipboard?.writeText !== undefined) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Fall through to the legacy fallback below.
    }
  }

  const textarea = document.createElement("textarea");

  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();

  let didCopy = false;

  try {
    didCopy = document.execCommand("copy");
  } catch {
    didCopy = false;
  }

  document.body.removeChild(textarea);

  return didCopy;
}

function buildAdminPreviewProfile(
  account: AdminAccountSummary,
): ServerUserProfile {
  const scope = account.scope;
  const businessCapabilities = account.capabilities.filter((capability) =>
    capability.startsWith("business."),
  );
  const businessNavigationItems = account.navigationItems.filter((item) =>
    item.startsWith("business."),
  );

  return {
    userId: account.userId,
    displayName: account.userDisplayName,
    accountType: account.accountType,
    activeAccess: {
      accountId: account.accessId,
      accountType: account.accountType,
      position: account.position,
      positionDisplayName: account.positionDisplayName,
      displayName: account.accessDisplayName,
      scope,
      capabilities: businessCapabilities,
      navigationItems: businessNavigationItems,
      issuedAt: account.createdAt,
    },
    receivedAt: new Date().toISOString(),
  };
}

function formatTableRowCount(rowCount: number | null) {
  return rowCount === null ? "строк: неизвестно" : `${rowCount} строк`;
}

function formatRowsPage(rowsState: Extract<AdminDatabaseRowsLoadState, { status: "ready" }>) {
  const firstRowNumber = rowsState.offset + 1;
  const lastRowNumber = rowsState.offset + rowsState.rows.length;
  const total = rowsState.table.rowCount ?? "неизвестно";

  return `Показано ${firstRowNumber}-${lastRowNumber} из ${total}`;
}

function formatPrimaryKey(row: AdminDatabaseRow) {
  return formatDatabasePrimaryKey(row.primaryKey);
}

function formatDatabasePrimaryKey(
  primaryKey: Record<string, AdminDatabaseCellValue>,
) {
  const entries = Object.entries(primaryKey);

  if (entries.length === 0) {
    return "без primary key";
  }

  return entries
    .map(([name, value]) => `${name}=${value ?? "NULL"}`)
    .join(", ");
}

function readDatabaseCellClassName(column: AdminDatabaseColumn) {
  if (column.multiline) {
    return "admin-db-cell admin-db-cell-wide";
  }

  if (column.format === "date" || column.format === "date_time") {
    return "admin-db-cell admin-db-cell-date";
  }

  return "admin-db-cell";
}

function readInitialAdminDatabaseEditorValues(
  row: AdminDatabaseRow,
) {
  return Object.fromEntries(
    row.editorFields.map((field) => [field.name, field.value]),
  );
}

export function readDispatcherSubmissionPayload(
  formData: FormData,
  formDefinition: DispatcherFormDefinition,
): DispatcherSubmissionPayload {
  const payload: DispatcherSubmissionPayload = {};

  for (const field of formDefinition.fields) {
    const value = readOptionalFormValue(formData.get(field.name));
    const normalizedValue =
      value === undefined ? undefined : normalizeFormValue(value, field);

    if (normalizedValue !== undefined && normalizedValue.length > 0) {
      payload[field.name] = normalizedValue;
    }
  }

  if (formDefinition.id === "production") {
    for (const [fieldName, rawValue] of formData.entries()) {
      if (!isProductionBrandColumnFieldName(fieldName)) {
        continue;
      }

      const value = readOptionalFormValue(rawValue);

      if (value === undefined || value.length === 0) continue;

      payload[fieldName] = fieldName.includes("Fact")
        ? normalizeDecimalNumberForPayload(value) ?? value
        : value.trim().replace(/\s+/gu, " ");
    }
  }

  if (formDefinition.id === "visitor_exit") {
    const visitorEntryId = readOptionalFormValue(formData.get("visitorEntryId"));

    if (visitorEntryId !== undefined && visitorEntryId.length > 0) {
      payload.visitorEntryId = visitorEntryId;
    }
  }

  return payload;
}

function resetDispatcherForm(
  form: HTMLFormElement,
  formId: DispatcherFormId,
) {
  form.reset();

  const formIdControl = form.elements.namedItem("formId");

  if (formIdControl instanceof HTMLSelectElement) {
    formIdControl.value = formId;
  }
}

function readSubmissionSuccessMessage(result: {
  submission: DispatcherSubmission;
  source?: "remote" | "local_test";
}) {
  if (result.source === "local_test") {
    return "Сохранено в тестовом режиме.";
  }

  switch (result.submission.formId) {
    case "production":
      return "Выработка отправлена.";
    case "incident":
      return "Инцидент открыт.";
    case "incident_close":
      return "Инцидент закрыт.";
    case "visitor":
      return "Вход посетителя отмечен.";
    case "visitor_exit":
      return "Выход посетителя отмечен.";
    default:
      return "Данные отправлены.";
  }
}

function readEquipmentReportSuccessMessage(result: {
  submissions: DispatcherSubmission[];
  reportStatus: "created" | "updated";
  source?: "remote" | "local_test";
}) {
  const prefix =
    result.reportStatus === "updated"
      ? "Отчёт оборудования обновлён."
      : "Отчёт оборудования отправлен.";

  if (result.source === "local_test") {
    return "Отчёт сохранён в тестовом режиме.";
  }

  return prefix;
}

function readInputType(field: DispatcherFormField) {
  if (
    field.type === "number" ||
    field.type === "signed-number" ||
    field.type === "integer"
  ) {
    return "text";
  }

  if (
    field.type === "date" ||
    field.type === "month" ||
    field.type === "datetime-local"
  ) {
    return field.type;
  }

  return "text";
}

function readInputMode(field: DispatcherFormField) {
  if (field.type === "number" || field.type === "signed-number") {
    return "decimal";
  }

  if (field.type === "integer" || field.type === "month") {
    return "numeric";
  }

  return undefined;
}

function readInputPattern(field: DispatcherFormField) {
  if (field.type === "number") {
    return decimalNumberInputPattern;
  }

  if (field.type === "signed-number") {
    return signedDecimalNumberInputPattern;
  }

  if (field.type === "integer") {
    return integerInputPattern;
  }

  if (field.type === "month") {
    return "\\d{4}-\\d{1,2}|\\d{1,2}[./-]\\d{4}|\\d{4}[./]\\d{1,2}";
  }

  return undefined;
}

function readInputTitle(field: DispatcherFormField) {
  if (field.type === "number") {
    return decimalNumberInputTitle;
  }

  if (field.type === "signed-number") {
    return signedDecimalNumberInputTitle;
  }

  if (field.type === "integer") {
    return integerInputTitle;
  }

  return undefined;
}

function readInputPlaceholder(field: DispatcherFormField) {
  if (field.type === "month") {
    return "2026-06";
  }

  if (
    field.type === "number" ||
    field.type === "signed-number" ||
    field.type === "integer"
  ) {
    return "0";
  }

  return undefined;
}

function readInputMaxLength(field: DispatcherFormField) {
  if (field.maxLength !== undefined) {
    return field.maxLength;
  }

  if (field.type === "text") {
    return 240;
  }

  if (
    field.type === "number" ||
    field.type === "signed-number" ||
    field.type === "integer"
  ) {
    return 32;
  }

  if (field.type === "month") {
    return 10;
  }

  return undefined;
}

function readInputDefaultValue(field: DispatcherFormField) {
  if (field.type === "date") {
    return getTodayDateValue();
  }

  if (field.type === "datetime-local") {
    return getCurrentDateTimeLocalValue();
  }

  return undefined;
}

function buildInitialEquipmentFormPayload(
  form: DispatcherFormDefinition,
  equipmentOptions: readonly string[],
) {
  const storage = readBrowserEquipmentDraftStorage();
  const reportDate = getTodayDateValue();
  const equipment =
    readLastEquipmentOption({
      equipmentOptions,
      storage,
    }) ?? "";
  const reportPayload =
    equipment.length === 0
      ? {}
      : readEquipmentReportEntryPayload({
          equipment,
          form,
          reportDate,
          storage,
        });
  const draftPayload =
    equipment.length === 0
      ? {}
      : readEquipmentDraftPayload({
          equipment,
          form,
          reportDate,
          storage,
        });
  const savedDraft =
    hasEquipmentReportData(reportPayload) &&
    (!hasEquipmentReportData(draftPayload) ||
      !isEquipmentReportEntryDirty({
        currentPayload: draftPayload,
        form,
        reportPayload,
      }))
      ? reportPayload
      : draftPayload;

  return buildEquipmentFormPayload({
    equipment,
    form,
    savedDraft,
    todayDate: reportDate,
  });
}

function normalizeControlledFieldInput(value: string, field: DispatcherFormField) {
  if (field.type === "number") {
    return normalizeDecimalNumberInput(value);
  }

  if (field.type === "signed-number") {
    return normalizeSignedDecimalNumberInput(value);
  }

  if (field.type === "integer") {
    return normalizeIntegerInput(value);
  }

  return value;
}

function readBrowserEquipmentDraftStorage():
  | DispatcherEquipmentDraftStorage
  | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function normalizeFormValue(value: string, field: DispatcherFormField) {
  if (field.type === "month") {
    return normalizeMonthValue(value);
  }

  if (field.type === "number") {
    const normalized = normalizeDecimalNumberForPayload(value);

    return normalized === undefined || normalized.length === 0
      ? undefined
      : normalized;
  }

  if (field.type === "signed-number") {
    const normalized = normalizeSignedDecimalNumberForPayload(value);

    return normalized === undefined || normalized.length === 0
      ? undefined
      : normalized;
  }

  if (field.type === "integer") {
    return normalizeIntegerForPayload(value);
  }

  return value;
}

function normalizeMonthValue(value: string) {
  const trimmed = value.trim();
  const isoDateMatch = /^(\d{4})-(\d{1,2})-\d{1,2}$/.exec(trimmed);
  const isoMonthMatch = /^(\d{4})-(\d{1,2})$/.exec(trimmed);
  const monthYearMatch = /^(\d{1,2})[./-](\d{4})$/.exec(trimmed);
  const yearMonthMatch = /^(\d{4})[./](\d{1,2})$/.exec(trimmed);
  const match = isoDateMatch ?? isoMonthMatch ?? monthYearMatch ?? yearMonthMatch;

  if (match === null) {
    return trimmed;
  }

  const year =
    match === monthYearMatch ? readMonthYearYear(match[2]) : readMonthYearYear(match[1]);
  const month =
    match === monthYearMatch ? readMonthYearMonth(match[1]) : readMonthYearMonth(match[2]);

  if (year === undefined || month === undefined) {
    return trimmed;
  }

  return `${year}-${String(month).padStart(2, "0")}`;
}

function formatMonthDisplayInput(value: string) {
  const normalized = normalizeMonthValue(value);

  if (isCanonicalMonthValue(normalized)) {
    return formatCanonicalMonthForDisplay(normalized) ?? value;
  }

  const digits = value.replace(/\D/g, "").slice(0, 6);

  if (digits.length <= 2) {
    return digits;
  }

  return `${digits.slice(0, 2)}.${digits.slice(2)}`;
}

function formatCanonicalMonthForDisplay(value: string) {
  if (!isCanonicalMonthValue(value)) {
    return undefined;
  }

  return `${value.slice(5, 7)}.${value.slice(0, 4)}`;
}

function shiftMonthValue(value: string, offset: number) {
  const year = Number(value.slice(0, 4));
  const monthIndex = Number(value.slice(5, 7)) - 1;
  const date = new Date(year, monthIndex + offset, 1);

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getCurrentMonthValue() {
  const date = new Date();

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function isCanonicalMonthValue(value: string) {
  return /^\d{4}-\d{2}$/.test(value);
}

function getTodayDateValue() {
  const date = new Date();

  return formatDateInputValue(date);
}

function getCurrentDateTimeLocalValue() {
  const date = new Date();

  return `${formatDateInputValue(date)}T${formatTimeInputValue(date)}`;
}

function formatDateInputValue(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatTimeInputValue(date: Date) {
  return [
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
  ].join(":");
}

function readMonthYearYear(value: string | undefined) {
  return value !== undefined && /^\d{4}$/.test(value) ? value : undefined;
}

function readMonthYearMonth(value: string | undefined) {
  if (value === undefined || !/^\d{1,2}$/.test(value)) {
    return undefined;
  }

  const month = Number(value);

  return month >= 1 && month <= 12 ? month : undefined;
}

function formatDispatcherPayload(
  submission: DispatcherSubmission,
  forms: DispatcherFormDefinition[],
) {
  const form = forms.find((item) => item.id === submission.formId);

  if (form === undefined) {
    return Object.entries(submission.payload)
      .map(([name, value]) => `${name}: ${value}`)
      .join(" · ");
  }

  return form.fields
    .map((field) => {
      const value = submission.payload[field.name];

      return value === undefined ? undefined : `${field.label}: ${value}`;
    })
    .filter((value): value is string => value !== undefined)
    .join(" · ");
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function readCurrentMonthInputValue() {
  const now = new Date();

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function readPositiveDecimalInput(value: string) {
  const normalized = normalizeDecimalNumberForPayload(value);

  if (
    normalized === undefined ||
    !/^\d+(?:\.\d{1,2})?$/u.test(normalized)
  ) {
    return undefined;
  }

  const number = Number(normalized);

  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function normalizeProductionPlanInput(value: string) {
  const normalized = normalizeDecimalNumberInput(value);
  const [integerPart, fractionPart] = normalized.split(".");

  return fractionPart === undefined
    ? integerPart
    : `${integerPart}.${fractionPart.slice(0, 2)}`;
}

function areSameProductionPlanDates(left: string[], right: string[]) {
  return left.length === right.length &&
    left.every((date, index) => date === right[index]);
}

function readProductionPlanScheduleDates(plan: ProductionPlanRevision) {
  return Array.from(
    new Set(
      productionCategories.flatMap((category) =>
        plan.schedules[category]?.dailyPlans.map((item) => item.date) ?? [],
      ),
    ),
  ).sort();
}

function readProductionPlanMonthParts(value: string) {
  const match = /^(\d{4})-(\d{2})$/u.exec(value);
  const year = Number(match?.[1]);
  const month = Number(match?.[2]);

  if (
    Number.isInteger(year) &&
    year >= 2000 &&
    year <= 2100 &&
    Number.isInteger(month) &&
    month >= 1 &&
    month <= 12
  ) {
    return { year, month };
  }

  const current = new Date();

  return { year: current.getFullYear(), month: current.getMonth() + 1 };
}

function formatProductionPlanMonthValue(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function shiftProductionPlanMonth(value: string, offset: -1 | 1) {
  const current = readProductionPlanMonthParts(value);
  const minimum = 2000 * 12;
  const maximum = 2100 * 12 + 11;
  const shifted = Math.min(
    maximum,
    Math.max(minimum, current.year * 12 + current.month - 1 + offset),
  );

  return formatProductionPlanMonthValue(
    Math.floor(shifted / 12),
    shifted % 12 + 1,
  );
}

function formatProductionPlanMonth(value: string) {
  const { year, month } = readProductionPlanMonthParts(value);

  return `${productionPlanMonthLabels[month - 1]} ${year}`;
}

function buildProductionPlanMonthDates(month: string) {
  const match = /^(\d{4})-(\d{2})$/u.exec(month);

  if (match === null) {
    return [];
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const dayCount = new Date(year, monthIndex + 1, 0).getDate();
  const weekdayFormatter = new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
  });

  return Array.from({ length: dayCount }, (_, index) => {
    const dayNumber = index + 1;
    const date = new Date(year, monthIndex, dayNumber);
    const weekday = date.getDay();

    return {
      date: `${month}-${String(dayNumber).padStart(2, "0")}`,
      dayNumber,
      weekdayLabel: weekdayFormatter.format(date).replace(".", ""),
      isWeekend: weekday === 0 || weekday === 6,
      calendarColumn: weekday === 0 ? 7 : weekday,
    };
  });
}

function formatDateOnly(value: string) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (parts !== null) {
    return `${parts[3]}.${parts[2]}.${parts[1]}`;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 2,
  }).format(value);
}

function readBankMeasurementValue(value: number | undefined) {
  return value === undefined ? "" : String(value);
}

function formatOptionalNumber(value: number | undefined) {
  return value === undefined ? "—" : formatNumber(value);
}

function formatProductionFieldValue(
  field: DispatcherFormField,
  value: string | undefined,
) {
  const text = value?.trim();

  if (text === undefined || text.length === 0) {
    return "—";
  }

  if (
    field.type === "number" ||
    field.type === "signed-number" ||
    field.type === "integer"
  ) {
    const numberValue = Number(text);

    if (Number.isFinite(numberValue)) {
      return formatNumber(numberValue);
    }
  }

  return text;
}

function readOptionalFormValue(value: FormDataEntryValue | null) {
  const text = typeof value === "string" ? value.trim() : "";

  return text.length > 0 ? text : undefined;
}
