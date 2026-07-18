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
import { createPortal } from "react-dom";
import {
  accountCapabilities,
  productionCategories,
  type AccountNavigationItem,
  type AccountPosition,
  type AccountType,
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
  type DispatcherSubmission,
  type DispatcherSubmissionPayload,
  type ProductionBrandCategoryRow,
  type ProductionBrandCategory,
  type ProductionBrandLabel,
  type ProductionCategory,
  type ProductionCategoryPlans,
  type ProductionGranulationRow,
  type ProductionJarMeasurementRow,
  type ProductionMetricRow,
  type ProductionReportBaseRow,
  type ProductionReportTables,
  type ProductionPlanRevision,
  type ProductionPlanPreviewResponse,
  type DevAccessOption,
  type ServerUserProfile,
  type UserActivityActor,
  type UserActivityEvent,
} from "./contracts";
import {
  accountPositionLabels,
  authOptions,
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
} from "./services/accessGuards";
import {
  clearAdminDatabaseTable,
  deleteAdminDatabaseRow,
  mergeAdminDatabaseRows,
  requestAdminDatabaseRows,
  requestAdminDatabaseTables,
  updateAdminDatabaseRow,
  type AdminDatabaseRowsResult,
  type AdminDatabaseTablesResult,
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
  createAdminAccount,
  createAdminPosition,
  deleteAdminPosition,
  deleteAdminAccount,
  hasAdminAccountLogin,
  requestAdminAccounts,
  requestAdminPositions,
  resetAdminAccountPassword,
  setAdminAccountLoginEnabled,
  setAdminAccountPosition,
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
  buildOpenVisitorOptions,
  filterProductionReportTables,
  buildVisitorVisitRows,
  type OwnerDispatcherOverview,
  type DispatcherFeedGroup,
  type DispatcherFeedPeriod,
} from "./services/dispatcherFeedViews";
import { readShortUserMessage } from "./services/userFacingMessages";
import {
  requestProductionDailyPlan,
  requestProductionPlan,
  requestProductionPlanPreview,
  saveProductionPlan,
} from "./services/productionPlans";
import {
  createProductionBrand,
  requestProductionBrands,
} from "./services/productionBrands";
import { formatUserShortName } from "./services/userDisplayName";
import {
  markToastExiting,
  prependToast,
  removeToast,
  type AppToast,
} from "./services/toastStack";

type BusinessTab =
  | "overview"
  | "dispatcher"
  | "work"
  | "production_plan"
  | "user_actions"
  | "dispatcher_form";
type AdminTab = "account_preview" | "accounts" | "database" | "user_actions";

const navigationByBusinessTab: Record<BusinessTab, AccountNavigationItem> = {
  overview: "business.overview",
  dispatcher: "business.dispatcher",
  work: "business.work",
  production_plan: "business.production_plan",
  user_actions: "business.user_actions",
  dispatcher_form: "business.dispatcher_form",
};

type DataEntrySubmitStateControls = {
  setStatus: (message: string) => void;
  setIsSubmitting: (isSubmitting: boolean) => void;
};

type DataEntrySubmitCallbacks = {
  onSuccess?: (message: string) => void;
};

type ShowToast = (title: string, message: string) => void;

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

const toastVisibleDurationMs = 4_000;
const toastExitDurationMs = 260;
const toastShiftDurationMs = 220;
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

const emptyProductionReportTables: ProductionReportTables = {
  forming: [],
  sorting: [],
  unformed: [],
  chamotte: [],
  jars: [],
  granulation: [],
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
): NavigationItem[] {
  const accountType = profile.accountType;
  const navigationItems = (
    accountType === "admin" ? navigationItemsByAccountType.admin : nonAdminNavigationItems
  ).filter((item) => profile.activeAccess.navigationItems.includes(item.id));

  if (accountType === "admin") {
    return navigationItems
      .filter((item) => getAdminTabForNavigationItem(item) !== undefined)
      .map((item) => {
        const target = getAdminTabForNavigationItem(item);

        return {
          ...item,
          state: target === adminTab ? "active" : "pending",
        };
      });
  }

  const effectiveBusinessTab = resolveAllowedNavigationTab(
    businessTab,
    navigationByBusinessTab,
    profile.activeAccess.navigationItems,
  );

  return navigationItems
    .filter((item) => getBusinessTabForNavigationItem(item) !== undefined)
    .map((item) => {
      const target = getBusinessTabForNavigationItem(item);

      return {
        ...item,
        state: target === effectiveBusinessTab ? "active" : "pending",
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
  const navigationByTab: Record<AdminTab, AccountNavigationItem> = {
    account_preview: "admin.account_preview",
    accounts: "admin.accounts",
    database: "admin.database",
    user_actions: "admin.user_actions",
  };

  return navigationByTab[tab];
}

function getBusinessAuditScreenId(
  accountType: AccountType,
  activeTab: BusinessTab,
): AccountNavigationItem | undefined {
  if (accountType === "dispatcher") {
    return "business.dispatcher_form";
  }

  if (accountType !== "business_owner") {
    return undefined;
  }

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
  const [dispatcherForms, setDispatcherForms] =
    useState<DispatcherFormsLoadState>(initialDispatcherFormsState);
  const [dispatcherSubmissionVersion, setDispatcherSubmissionVersion] = useState(0);
  const [dispatcherFeedFilters, setDispatcherFeedFilters] =
    useState<DispatcherFeedFilterState>(initialDispatcherFeedFilters);
  const [adminViewedDispatcherFeedFilters, setAdminViewedDispatcherFeedFilters] =
    useState<DispatcherFeedFilterState>(initialDispatcherFeedFilters);
  const [isWelcomePending, setIsWelcomePending] = useState(false);
  const [isMobileNavigation, setIsMobileNavigation] = useState(() =>
    window.matchMedia(mobileNavigationMediaQuery).matches,
  );
  const [isNavigationOpen, setIsNavigationOpen] = useState(() =>
    !window.matchMedia(mobileNavigationMediaQuery).matches,
  );
  const [toasts, setToasts] = useState<AppToast[]>([]);
  const nextToastIdRef = useRef(0);
  const toastTimeoutIdsRef = useRef<Set<number>>(new Set());
  const lastRecordedScreenRef = useRef("");

  useEffect(() => {
    const timeoutIds = toastTimeoutIdsRef.current;

    return () => {
      timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
      timeoutIds.clear();
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
    if (
      accessProfile.status !== "ready" ||
      !hasCapability(accessProfile.profile, "business.view_dispatcher_feed")
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
    dispatcherSubmissionVersion,
  ]);

  useEffect(() => {
    if (
      accessProfile.status !== "ready" ||
      !canRequestDispatcherForms(accessProfile.profile)
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
  }, [accessProfile]);

  useEffect(() => {
    if (
      accessProfile.status !== "ready" ||
      accessProfile.profile.accountType !== "admin" ||
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

    handleShowToast(
      "Добро пожаловать",
      shortName.length > 0 ? `Здравствуйте, ${shortName}!` : "Здравствуйте!",
    );
    setIsWelcomePending(false);
  }, [accessProfile, isWelcomePending]);

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
    const screenId = profile.accountType === "admin"
      ? adminTab === "account_preview" &&
        adminViewedAccount !== undefined &&
        previewTab !== undefined
        ? getBusinessAuditScreenId(adminViewedAccount.accountType, previewTab)
        : getAdminNavigationItem(adminTab)
      : activeBusinessTab === undefined
        ? undefined
        : getBusinessAuditScreenId(profile.accountType, activeBusinessTab);

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
  ]);

  function scheduleToastTimeout(callback: () => void, delayMs: number) {
    const timeoutId = window.setTimeout(() => {
      toastTimeoutIdsRef.current.delete(timeoutId);
      callback();
    }, delayMs);

    toastTimeoutIdsRef.current.add(timeoutId);
  }

  function handleShowToast(title: string, message: string) {
    const toastId = nextToastIdRef.current + 1;
    nextToastIdRef.current = toastId;

    setToasts((current) =>
      prependToast(current, {
        id: toastId,
        title,
        message,
        state: "visible",
      }),
    );

    scheduleToastTimeout(() => {
      setToasts((current) => markToastExiting(current, toastId));
      scheduleToastTimeout(() => {
        setToasts((current) => removeToast(current, toastId));
      }, toastExitDurationMs);
    }, toastVisibleDurationMs);
  }

  function clearToastStack() {
    toastTimeoutIdsRef.current.forEach((timeoutId) =>
      window.clearTimeout(timeoutId),
    );
    toastTimeoutIdsRef.current.clear();
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
    setIsWelcomePending(false);
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
    setIsWelcomePending(false);
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

  function handleStartAdminAccountView(account: AdminAccountSummary) {
    setAdminViewedAccount(account);
    setAdminViewedOwnerTab("overview");
    setAdminViewedDataEntryStatus("");
    setIsAdminViewedDataEntrySubmitting(false);
    setAdminViewedDispatcherFeedFilters(initialDispatcherFeedFilters);
  }

  function handleStopAdminAccountView() {
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
    profile.accountType === "admin" &&
    adminTab === "account_preview" &&
    adminViewedAccount !== undefined
      ? buildAdminPreviewProfile(adminViewedAccount)
      : undefined;
  const isAdminPreviewMode = viewedProfile !== undefined;
  const visibleProfile = viewedProfile ?? profile;
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
        onOwnerTabChange={
          viewedProfile !== undefined
            ? setAdminViewedOwnerTab
            : setOwnerTab
        }
        adminTab={adminTab}
        onAdminTabChange={setAdminTab}
      />

      {isMobileNavigation && isNavigationOpen ? (
        <button
          aria-label="Закрыть меню"
          className="rail-backdrop"
          type="button"
          onClick={() => setIsNavigationOpen(false)}
        />
      ) : null}

      <ToastViewport toasts={toasts} />

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
          profile={visibleProfile}
          isAdminPreviewMode={isAdminPreviewMode}
          dataEntryStatus={visibleDataEntryStatus}
          isDataEntrySubmitting={isVisibleDataEntrySubmitting}
          onDataEntrySubmit={handleVisibleDataEntrySubmit}
          ownerTab={visibleOwnerTab}
          adminTab={adminTab}
          dispatcherFeed={dispatcherFeed}
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
          onSelectAdminAccountView={handleStartAdminAccountView}
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
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [devAccessOptions, setDevAccessOptions] =
    useState<DevAccessOptionsLoadState>({
      status: "loading",
      message: "Загружаем тестовые аккаунты.",
    });
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
    <main className="auth-shell">
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

type LoadingIndicatorVariant = "page" | "panel" | "inline" | "button";

function LoadingIndicator({
  announce = true,
  className,
  label,
  variant = "panel",
}: {
  announce?: boolean;
  className?: string;
  label: string;
  variant?: LoadingIndicatorVariant;
}) {
  const isButtonIndicator = variant === "button";
  const visualIndicator = (
    <span
      className={[
        "loading-indicator",
        `loading-indicator-${variant}`,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-live={announce && !isButtonIndicator ? "polite" : undefined}
      role={announce && !isButtonIndicator ? "status" : undefined}
    >
      <span className="loading-indicator-mark" aria-hidden="true" />
      <span className="loading-indicator-label">{label}</span>
    </span>
  );

  if (!announce || !isButtonIndicator || typeof document === "undefined") {
    return visualIndicator;
  }

  return (
    <>
      {visualIndicator}
      {createPortal(
        <span
          aria-atomic="true"
          aria-live="polite"
          className="loading-indicator-announcement"
          role="status"
        >
          {label}
        </span>,
        document.body,
      )}
    </>
  );
}

function ToastViewport({ toasts }: { toasts: readonly AppToast[] }) {
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
        nextPositions.set(toast.id, element.offsetTop);
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
          className={`app-toast app-toast-${toast.state}`}
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
        </div>
      ))}
    </div>
  );
}

function SideRail({
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
  onOwnerTabChange,
  adminTab,
  onAdminTabChange,
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
  onOwnerTabChange: (tab: BusinessTab) => void;
  adminTab: AdminTab;
  onAdminTabChange: (tab: AdminTab) => void;
}) {
  const railRef = useRef<HTMLElement>(null);
  const railBrandButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerMenuButtonRef = useRef<HTMLButtonElement>(null);
  const navigationItems = buildNavigationItems(
    profile,
    ownerTab,
    adminTab,
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
          <button
            aria-controls="primary-navigation"
            aria-expanded={isOpen}
            aria-label={isOpen ? "Свернуть меню" : "Открыть меню"}
            className="rail-brand-button"
            ref={railBrandButtonRef}
            title={isOpen ? "Свернуть меню" : "Открыть меню"}
            type="button"
            onClick={onToggle}
          >
            <span className="brand-mark" aria-hidden="true">
              <img alt="" src="/nmou-vector-icon.png" />
            </span>
          </button>
          {isAdminPreviewMode ? (
            <div className="admin-preview-mode-badge" role="status">
              АДМИН ПРЕВЬЮ МОД
            </div>
          ) : null}
          <button
            aria-controls="primary-navigation"
            aria-expanded={isOpen}
            aria-label={isOpen ? "Свернуть меню" : "Открыть меню"}
            className="rail-menu-toggle"
            ref={drawerMenuButtonRef}
            type="button"
            onClick={() => {
              onToggle();
              if (!isMobile && isOpen) {
                window.requestAnimationFrame(() =>
                  railBrandButtonRef.current?.focus(),
                );
              }
            }}
          >
            <span aria-hidden="true" />
            <span aria-hidden="true" />
            <span aria-hidden="true" />
          </button>
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
            const ownerTarget =
              profile.accountType === "admin"
                ? undefined
                : getBusinessTabForNavigationItem(item);
            const adminTarget =
              profile.accountType === "admin"
                ? getAdminTabForNavigationItem(item)
                : undefined;

            return (
              <button
                className={`nav-item nav-item-${item.state}`}
                type="button"
                aria-current={item.state === "active" ? "page" : undefined}
                disabled={ownerTarget === undefined && adminTarget === undefined}
                key={item.label}
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
                <span>{item.label}</span>
                <small>{item.description}</small>
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
  dispatcherFeed,
  dispatcherForms,
  dispatcherSubmissionVersion,
  dispatcherFeedFilters,
  onDispatcherFeedFiltersChange,
  onDataEntryStatusReset,
  onShowToast,
  onSelectAdminAccountView,
}: {
  profile: ServerUserProfile;
  isAdminPreviewMode: boolean;
  dataEntryStatus: string;
  isDataEntrySubmitting: boolean;
  onDataEntrySubmit: DataEntrySubmitHandler;
  ownerTab: BusinessTab;
  adminTab: AdminTab;
  dispatcherFeed: DispatcherFeedLoadState;
  dispatcherForms: DispatcherFormsLoadState;
  dispatcherSubmissionVersion: number;
  dispatcherFeedFilters: DispatcherFeedFilterState;
  onDispatcherFeedFiltersChange: (
    patch: Partial<DispatcherFeedFilterState>,
  ) => void;
  onDataEntryStatusReset: () => void;
  onShowToast: ShowToast;
  onSelectAdminAccountView: (account: AdminAccountSummary) => void;
}) {
  const effectiveOwnerTab = resolveAllowedNavigationTab(
    ownerTab,
    navigationByBusinessTab,
    profile.activeAccess.navigationItems,
  );
  const adminNavigationByTab: Record<AdminTab, AccountNavigationItem> = {
    account_preview: "admin.account_preview",
    accounts: "admin.accounts",
    database: "admin.database",
    user_actions: "admin.user_actions",
  };
  const effectiveAdminTab = profile.activeAccess.navigationItems.includes(
    adminNavigationByTab[adminTab],
  )
    ? adminTab
    : ((Object.keys(adminNavigationByTab) as AdminTab[]).find((tab) =>
        profile.activeAccess.navigationItems.includes(adminNavigationByTab[tab]),
      ) ?? adminTab);

  switch (profile.accountType) {
    case "admin":
      return (
        <AdminWorkspace
          profile={profile}
          activeTab={effectiveAdminTab}
          onShowToast={onShowToast}
          onSelectAccountView={onSelectAdminAccountView}
        />
      );
    default:
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
            currentUserDisplayName={profile.displayName}
            isAdminPreviewMode={isAdminPreviewMode}
            refreshVersion={dispatcherSubmissionVersion}
            onResetStatus={onDataEntryStatusReset}
            onShowToast={onShowToast}
          />
        );
      }
      return (
        <OwnerWorkspace
          activeTab={effectiveOwnerTab}
          dispatcherFeed={dispatcherFeed}
          dispatcherForms={dispatcherForms}
          dispatcherFeedFilters={dispatcherFeedFilters}
          onDispatcherFeedFiltersChange={onDispatcherFeedFiltersChange}
        />
      );
  }
}

function OwnerWorkspace({
  activeTab,
  dispatcherFeed,
  dispatcherForms,
  dispatcherFeedFilters,
  onDispatcherFeedFiltersChange,
}: {
  activeTab: Extract<BusinessTab, "overview" | "dispatcher">;
  dispatcherFeed: DispatcherFeedLoadState;
  dispatcherForms: DispatcherFormsLoadState;
  dispatcherFeedFilters: DispatcherFeedFilterState;
  onDispatcherFeedFiltersChange: (
    patch: Partial<DispatcherFeedFilterState>,
  ) => void;
}) {
  if (activeTab === "overview") {
    const overview = buildOwnerDispatcherOverview(
      dispatcherFeed.status === "ready" ? dispatcherFeed.submissions : [],
    );

    return (
      <OwnerOverviewPanel
        dispatcherFeed={dispatcherFeed}
        overview={overview}
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

function OwnerOverviewPanel({
  dispatcherFeed,
  overview,
}: {
  dispatcherFeed: DispatcherFeedLoadState;
  overview: OwnerDispatcherOverview;
}) {
  const hasDispatcherData =
    overview.equipment !== undefined ||
    overview.latestIncident !== undefined ||
    overview.latestIncidentClosure !== undefined ||
    overview.visitors.latestDate !== undefined ||
    overview.visitors.openCount > 0;
  const isLocalTestMode =
    dispatcherFeed.status === "ready" && dispatcherFeed.source === "local_test";

  return (
    <section className="owner-overview" aria-label="Обзор">
      <div className="owner-overview-header">
        <h2>Диспетчер</h2>
        {dispatcherFeed.status === "ready" ? (
          <span>Обновлено: {formatDateTime(dispatcherFeed.receivedAt)}</span>
        ) : null}
      </div>
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
            "Не удалось загрузить сводку.",
          )}
        </p>
      ) : null}
      {isLocalTestMode ? (
        <p className="owner-overview-status owner-overview-status-local">
          Тестовый режим: данные только на этом устройстве.
        </p>
      ) : null}
      {dispatcherFeed.status === "ready" && !hasDispatcherData ? (
        <p className="owner-overview-status">
          Пока нет внесённых диспетчерских отчётов.
        </p>
      ) : null}
      {dispatcherFeed.status === "ready" && hasDispatcherData ? (
        <div className="owner-overview-stack">
          <OwnerEquipmentOverviewBlock overview={overview} />
          <OwnerIncidentOverviewBlock overview={overview} />
          <OwnerIncidentClosureOverviewBlock overview={overview} />
          <OwnerVisitorsOverviewBlock overview={overview} />
        </div>
      ) : null}
    </section>
  );
}

function OwnerEquipmentOverviewBlock({
  overview,
}: {
  overview: OwnerDispatcherOverview;
}) {
  return (
    <section className="owner-overview-block" aria-label="Оборудование">
      <h3>Оборудование</h3>
      {overview.equipment === undefined ? (
        <p className="owner-overview-status">Нет отчётов по оборудованию.</p>
      ) : (
        <p className="owner-overview-lead">
          Последняя дата обновления отчета по оборудованию -{" "}
          <strong>{formatDateTime(overview.equipment.updatedAt)}</strong>.
          Работало {formatEquipmentWorkingCounts(overview.equipment.workingCounts)}.
        </p>
      )}
    </section>
  );
}

export function OwnerIncidentOverviewBlock({
  overview,
}: {
  overview: OwnerDispatcherOverview;
}) {
  const incident = overview.latestIncident;

  return (
    <OwnerIncidentOverviewCard
      ariaLabel="Последний инцидент"
      dateLabel="Дата последнего инцидента"
      emptyMessage="Нет зарегистрированных инцидентов."
      incident={incident === undefined
        ? undefined
        : {
            updatedAt: incident.updatedAt,
            incidentNumber: incident.incidentNumber,
            incidentType: incident.incidentType,
            location: incident.location,
            status: incident.status,
            details: [
              ["Описание", incident.description],
              ["Критичность", incident.criticality],
              ["Ответственный за регистрацию", incident.responsible],
              ["Оперативные меры", incident.immediateActions],
            ],
          }}
      title="Последний инцидент"
    />
  );
}

export function OwnerIncidentClosureOverviewBlock({
  overview,
}: {
  overview: OwnerDispatcherOverview;
}) {
  const closure = overview.latestIncidentClosure;

  return (
    <OwnerIncidentOverviewCard
      ariaLabel="Последнее закрытие инцидента"
      dateLabel="Дата последнего закрытия инцидента"
      emptyMessage="Нет закрытых инцидентов."
      incident={closure === undefined
        ? undefined
        : {
            updatedAt: closure.updatedAt,
            incidentNumber: closure.incidentNumber,
            incidentType: closure.incidentType,
            location: closure.location,
            status: closure.status,
            details: [
              ["Корневые причины", closure.rootCauses],
              ["Предотвращающие меры", closure.preventiveMeasures],
              ["Затраты (убытки), руб", closure.costs],
              ["Кто утвердил закрытие", closure.approvedBy],
              ["Примечание", closure.closureNote],
            ],
          }}
      title="Последнее закрытие инцидента"
    />
  );
}

type OwnerIncidentOverviewCardData = {
  updatedAt: string;
  incidentNumber: string;
  incidentType?: string;
  location?: string;
  status: string;
  details: [label: string, value: string | undefined][];
};

function OwnerIncidentOverviewCard({
  ariaLabel,
  dateLabel,
  emptyMessage,
  incident,
  title,
}: {
  ariaLabel: string;
  dateLabel: string;
  emptyMessage: string;
  incident?: OwnerIncidentOverviewCardData;
  title: string;
}) {
  const age = incident === undefined
    ? undefined
    : formatOwnerIncidentAge(incident.updatedAt);

  return (
    <section
      className="owner-overview-block owner-incident-overview-block"
      aria-label={ariaLabel}
    >
      <h3>{title}</h3>
      {incident === undefined ? (
        <p className="owner-overview-status">{emptyMessage}</p>
      ) : (
        <>
          <p className="owner-overview-lead owner-incident-date">
            {dateLabel}
            {age === undefined ? null : (
              <> <span className="owner-incident-age">({age})</span></>
            )}{" "}
            — <strong>{formatDateTime(incident.updatedAt)}</strong>.
          </p>
          <div className="owner-incident-card">
            <dl className="owner-incident-summary">
              <div className="owner-incident-summary-primary">
                <dt>Номер инцидента</dt>
                <dd>{readOverviewDetailValue(incident.incidentNumber)}</dd>
              </div>
              <div>
                <dt>Тип инцидента</dt>
                <dd>{readOverviewDetailValue(incident.incidentType)}</dd>
              </div>
              <div>
                <dt>Место (цех/участок)</dt>
                <dd>{readOverviewDetailValue(incident.location)}</dd>
              </div>
              <div className="owner-incident-summary-status">
                <dt>Статус</dt>
                <dd>{readOverviewDetailValue(incident.status)}</dd>
              </div>
            </dl>
            <OwnerOverviewDetails rows={incident.details} />
          </div>
        </>
      )}
    </section>
  );
}

export function formatOwnerIncidentAge(
  value: string,
  currentDate = new Date(),
) {
  const eventDate = new Date(value);

  if (Number.isNaN(eventDate.getTime())) {
    return undefined;
  }

  const eventDay = Date.UTC(
    eventDate.getFullYear(),
    eventDate.getMonth(),
    eventDate.getDate(),
  );
  const currentDay = Date.UTC(
    currentDate.getFullYear(),
    currentDate.getMonth(),
    currentDate.getDate(),
  );
  const daysAgo = Math.max(
    0,
    Math.floor((currentDay - eventDay) / (24 * 60 * 60 * 1000)),
  );

  if (daysAgo === 0) {
    return "сегодня";
  }

  const lastTwoDigits = daysAgo % 100;
  const lastDigit = daysAgo % 10;
  const dayWord = lastTwoDigits >= 11 && lastTwoDigits <= 14
    ? "дней"
    : lastDigit === 1
      ? "день"
      : lastDigit >= 2 && lastDigit <= 4
        ? "дня"
        : "дней";

  return `${daysAgo} ${dayWord} назад`;
}

function OwnerVisitorsOverviewBlock({
  overview,
}: {
  overview: OwnerDispatcherOverview;
}) {
  const visitors = overview.visitors;

  return (
    <section className="owner-overview-block" aria-label="Посетители">
      <h3>Посетители</h3>
      {visitors.latestDate === undefined ? (
        <p className="owner-overview-status">Нет входов посетителей.</p>
      ) : (
        <>
          <p className="owner-overview-lead">
            Последние посетители были {formatDateOnly(visitors.latestDate)}.
            Было посетителей - {visitors.count} чел.
          </p>
          <p className="owner-overview-line">
            Приходили к{" "}
            {visitors.hosts.length === 0
              ? "не указано"
              : visitors.hosts.join(", ")}.
          </p>
        </>
      )}
      <p className="owner-overview-line">
        Количество невышедших посетителей на данный момент -{" "}
        {visitors.openCount} чел.
      </p>
    </section>
  );
}

function OwnerOverviewDetails({
  rows,
}: {
  rows: [label: string, value: string | undefined][];
}) {
  return (
    <dl className="owner-overview-details">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{readOverviewDetailValue(value)}</dd>
        </div>
      ))}
    </dl>
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

function ProductionPlanWorkspace({
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
    const nextValue = event.currentTarget.value;

    setMonthlyPlanInputs((current) => ({
      ...current,
      [category]: nextValue,
    }));
    setStatus("");
  }

  async function handleSaveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const category = productionCategories[activeCategoryIndex];
    const monthlyPlan = readPositiveIntegerInput(monthlyPlanInputs[category]);

    if (monthlyPlan === undefined) {
      setStatus(
        `Введите целый месячный план больше нуля для категории «${productionCategoryLabels[category]}».`,
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
            inputMode="numeric"
            min="1"
            pattern="[0-9]+"
            required
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

function DataEntryWorkspace({
  ariaLabel,
  status,
  isSubmitting,
  onSubmit,
  dispatcherForms,
  currentUserDisplayName,
  isAdminPreviewMode,
  refreshVersion,
  onResetStatus,
  onShowToast,
}: {
  ariaLabel: string;
  status: string;
  isSubmitting: boolean;
  onSubmit: DataEntrySubmitHandler;
  dispatcherForms: DispatcherFormsLoadState;
  currentUserDisplayName: string;
  isAdminPreviewMode: boolean;
  refreshVersion: number;
  onResetStatus: () => void;
  onShowToast: ShowToast;
}) {
  const forms = dispatcherForms.status === "ready" ? dispatcherForms.forms : [];
  const [selectedFormId, setSelectedFormId] = useState("");
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

  useEffect(() => {
    if (
      selectedFormId.length > 0 &&
      !forms.some((form) => form.id === selectedFormId)
    ) {
      formLeaveGuardRef.current = undefined;
      setSelectedFormId("");
    }
  }, [forms, selectedFormId]);

  function handleSelectForm(formId: string) {
    const continueSelection = () => {
      formLeaveGuardRef.current = undefined;
      onResetStatus();
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
    onShowToast("Отправлено", message);
    setSelectedFormId("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    onSubmit(event, undefined, undefined, {
      onSuccess: handleSuccessfulSubmit,
    });
  }

  if (dispatcherForms.status !== "ready" || forms.length === 0) {
    return (
      <section className="data-entry-surface" aria-label={ariaLabel}>
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
      <form className="data-entry-form" onSubmit={handleSubmit}>
        <input name="formId" type="hidden" value={currentForm.id} readOnly />
        {isLocalTestMode ? (
          <p className="form-status form-status-local">{localTestModeMessage}</p>
        ) : null}
        <div className="dispatcher-form-toolbar">
          <strong>{currentForm.title}</strong>
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

function DispatcherProductionReportFormBody({
  form,
  isAdminPreviewMode,
  isSubmitting,
  status,
}: {
  form: DispatcherFormDefinition;
  isAdminPreviewMode: boolean;
  isSubmitting: boolean;
  status: string;
}) {
  const reportDateField = form.fields.find(
    (field) => field.name === "reportDate",
  );
  const [reportDate, setReportDate] = useState(getTodayDateValue);
  const [dailyPlanState, setDailyPlanState] = useState<
    | { status: "loading" }
    | { status: "ready"; values?: Partial<ProductionCategoryPlans> }
    | { status: "error"; message: string }
  >({ status: "loading" });
  const [brandLabels, setBrandLabels] = useState<ProductionBrandLabel[]>([]);
  const [brandLoadState, setBrandLoadState] = useState<
    | { status: "loading" }
    | { status: "ready" }
    | { status: "error"; message: string }
  >({ status: "loading" });
  const [brandRefreshVersion, setBrandRefreshVersion] = useState(0);

  useEffect(() => {
    if (isAdminPreviewMode || reportDate.length === 0) {
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
          setDailyPlanState({ status: "ready", values: result.plan?.values });
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

  useEffect(() => {
    if (isAdminPreviewMode) {
      setBrandLabels([]);
      setBrandLoadState({ status: "ready" });
      return;
    }

    const controller = new AbortController();

    setBrandLoadState({ status: "loading" });
    requestProductionBrands({ signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;

      if (result.status === "ready") {
        setBrandLabels(result.labels);
        setBrandLoadState({ status: "ready" });
        return;
      }

      setBrandLoadState({
        status: "error",
        message: readShortUserMessage(
          result.message,
          "Не удалось загрузить марки.",
        ),
      });
    });

    return () => controller.abort();
  }, [brandRefreshVersion, isAdminPreviewMode]);

  async function handleCreateBrand(
    category: ProductionBrandCategory,
    label: string,
  ): Promise<ProductionBrandCreateOutcome> {
    if (isAdminPreviewMode) {
      return { message: "В режиме просмотра добавление отключено." };
    }

    const result = await createProductionBrand({ category, label });

    if (result.status === "error") {
      return {
        message: readShortUserMessage(
          result.message,
          "Не удалось сохранить марку.",
        ),
      };
    }

    setBrandLabels((current) =>
      [...current.filter((item) => item.id !== result.label.id), result.label]
        .sort((left, right) => left.label.localeCompare(right.label, "ru-RU")),
    );
    return { label: result.label };
  }

  const dailyPlanValues =
    dailyPlanState.status === "ready" ? dailyPlanState.values : undefined;

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
            onChange={setReportDate}
          />
        )}
      </div>

      <div className="production-report-daily-plan" aria-live="polite">
        <span>Планы на выбранную дату</span>
        {isAdminPreviewMode ? (
          <strong>Не загружаются в режиме просмотра</strong>
        ) : dailyPlanState.status === "loading" ? (
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

      {brandLoadState.status === "loading" ? (
        <LoadingIndicator label="Загружаем марки…" variant="panel" />
      ) : brandLoadState.status === "error" ? (
        <div className="production-brand-load-error" role="alert">
          <span>{brandLoadState.message}</span>
          <button
            type="button"
            onClick={() => setBrandRefreshVersion((current) => current + 1)}
          >
            Повторить
          </button>
        </div>
      ) : null}

      <fieldset className="production-report-section">
        <legend>Огнеупорный цех</legend>
        <ProductionSummaryTable
          brandLabels={brandLabels}
          categoryPlan={dailyPlanValues?.forming}
          form={form}
          isAdminPreviewMode={isAdminPreviewMode}
          prefix="forming"
          title="Формовка"
          onCreateBrand={handleCreateBrand}
        />
        <ProductionSummaryTable
          brandLabels={brandLabels}
          categoryPlan={dailyPlanValues?.sorting}
          form={form}
          isAdminPreviewMode={isAdminPreviewMode}
          prefix="sorting"
          title="Сортировка"
          onCreateBrand={handleCreateBrand}
        />
      </fieldset>

      <div className="production-report-split">
        <fieldset className="production-report-section">
          <legend>Неформованная продукция, контейнеры</legend>
          <ProductionBrandColumnsTable
            brandLabels={brandLabels}
            category="unformed"
            categoryPlan={dailyPlanValues?.unformed}
            isAdminPreviewMode={isAdminPreviewMode}
            prefix="unformed"
            onCreateBrand={handleCreateBrand}
          />
        </fieldset>

        <fieldset className="production-report-section">
          <legend>Цех обжига шамота</legend>
          <span className="production-report-section-note">
            Выпуск шамота по маркам
          </span>
          <ProductionBrandColumnsTable
            brandLabels={brandLabels}
            category="chamotte"
            categoryPlan={dailyPlanValues?.chamotte}
            isAdminPreviewMode={isAdminPreviewMode}
            prefix="chamotte"
            onCreateBrand={handleCreateBrand}
          />
        </fieldset>
      </div>

      <div className="production-report-split production-report-split-bottom">
        <fieldset className="production-report-section">
          <legend>Замеры банок</legend>
          <div className="production-report-table-wrap">
            <table className="production-report-table production-report-jar-table">
              <thead>
                <tr>
                  <th scope="col">Банка</th>
                  <th scope="col">Начало дня</th>
                  <th scope="col">Конец дня</th>
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3].map((jarNumber) => (
                  <tr key={jarNumber}>
                    <th scope="row">{jarNumber}</th>
                    <td>
                      <ProductionReportCell
                        fieldName={`jarStart${jarNumber}`}
                        form={form}
                      />
                    </td>
                    <td>
                      <ProductionReportCell
                        fieldName={`jarEnd${jarNumber}`}
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
          <ProductionGranulationTable form={form} />
        </fieldset>
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
  );
}

function ProductionSummaryTable({
  brandLabels,
  categoryPlan,
  form,
  isAdminPreviewMode,
  prefix,
  title,
  onCreateBrand,
}: {
  brandLabels: ProductionBrandLabel[];
  categoryPlan?: number;
  form: DispatcherFormDefinition;
  isAdminPreviewMode: boolean;
  prefix: "forming" | "sorting";
  title: string;
  onCreateBrand: ProductionBrandCreator;
}) {
  const [brand, setBrand] = useState("");

  return (
    <section className="production-report-subsection">
      <h3>{title}</h3>
      <div className="production-report-table-wrap">
        <table className="production-report-table production-report-summary-table">
          <thead>
            <tr>
              <th scope="col">План</th>
              <th scope="col">Факт за сутки</th>
              <th scope="col">Марка изделия</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="production-report-plan-cell">
                {categoryPlan === undefined
                  ? "Не задан"
                  : formatNumber(categoryPlan)}
              </td>
              <td>
                <ProductionReportCell
                  fieldName={`${prefix}Day`}
                  form={form}
                  required={brand.length > 0}
                />
              </td>
              <td>
                <ProductionBrandPicker
                  brandLabels={brandLabels}
                  category="product"
                  disabled={isAdminPreviewMode}
                  name={`${prefix}ProductBrand`}
                  selectedLabels={[]}
                  value={brand}
                  onChange={setBrand}
                  onCreateBrand={onCreateBrand}
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

type ProductionBrandCreateOutcome = {
  label?: ProductionBrandLabel;
  message?: string;
};

type ProductionBrandCreator = (
  category: ProductionBrandCategory,
  label: string,
) => Promise<ProductionBrandCreateOutcome>;

type ProductionBrandColumn = {
  id: number;
  brand: string;
};

function ProductionBrandColumnsTable({
  brandLabels,
  category,
  categoryPlan,
  isAdminPreviewMode,
  prefix,
  onCreateBrand,
}: {
  brandLabels: ProductionBrandLabel[];
  category: "unformed" | "chamotte";
  categoryPlan?: number;
  isAdminPreviewMode: boolean;
  prefix: "unformed" | "chamotte";
  onCreateBrand: ProductionBrandCreator;
}) {
  const [columns, setColumns] = useState<ProductionBrandColumn[]>([
    { id: 1, brand: "" },
  ]);

  function addColumn() {
    if (columns.length >= 50) return;

    const usedIds = new Set(columns.map((column) => column.id));
    const id = Array.from({ length: 50 }, (_, index) => index + 1).find(
      (candidate) => !usedIds.has(candidate),
    );

    if (id === undefined) return;

    setColumns((current) => [...current, { id, brand: "" }]);
  }

  function removeColumn(id: number) {
    setColumns((current) => current.filter((column) => column.id !== id));
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

  return (
    <div className="production-brand-columns">
      <div className="production-report-table-wrap">
        <table className="production-report-table production-report-brand-columns-table">
          <thead>
            <tr>
              {columns.map((column, index) => (
                <th scope="col" key={column.id}>
                  <ProductionBrandPicker
                    brandLabels={brandLabels}
                    category={category}
                    disabled={isAdminPreviewMode}
                    name={`${prefix}Brand${column.id}`}
                    selectedLabels={selectedLabels.filter(
                      (label) => label !== column.brand,
                    )}
                    value={column.brand}
                    onChange={(brand) => changeColumnBrand(column.id, brand)}
                    onCreateBrand={onCreateBrand}
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
                      inputMode="decimal"
                      name={`${prefix}Fact${column.id}`}
                      pattern={decimalNumberInputPattern}
                      required={column.brand.length > 0}
                      title={decimalNumberInputTitle}
                      type="text"
                      onBlur={(event) => {
                        const normalizedFact =
                          normalizeDecimalNumberForPayload(
                            event.currentTarget.value,
                          ) ?? "";

                        event.currentTarget.value = normalizedFact;
                      }}
                      onChange={(event) => {
                        const normalizedFact = normalizeDecimalNumberInput(
                          event.currentTarget.value,
                        );

                        event.currentTarget.value = normalizedFact;
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
}

function ProductionBrandPicker({
  brandLabels,
  category,
  disabled,
  name,
  selectedLabels,
  value,
  onChange,
  onCreateBrand,
}: {
  brandLabels: ProductionBrandLabel[];
  category: ProductionBrandCategory;
  disabled: boolean;
  name: string;
  selectedLabels: string[];
  value: string;
  onChange: (value: string) => void;
  onCreateBrand: ProductionBrandCreator;
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [status, setStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const categoryLabels = brandLabels.filter(
    (label) => label.category === category,
  );
  const selectedKeys = new Set(
    selectedLabels.map((label) => normalizeProductionBrandKey(label)),
  );

  async function saveNewBrand() {
    const normalizedLabel = newLabel.trim().replace(/\s+/gu, " ");

    if (normalizedLabel.length === 0) {
      setStatus("Введите марку.");
      return;
    }

    setIsSaving(true);
    setStatus("Сохраняем…");
    const result = await onCreateBrand(category, normalizedLabel);
    setIsSaving(false);

    if (result.label === undefined) {
      setStatus(result.message ?? "Не удалось сохранить марку.");
      return;
    }

    onChange(result.label.label);
    setNewLabel("");
    setStatus("");
    setIsAdding(false);
  }

  return (
    <div className="production-brand-picker">
      <select
        aria-label="Марка"
        disabled={disabled || isSaving}
        name={name}
        value={value}
        onChange={(event) => {
          const nextValue = event.currentTarget.value;

          if (nextValue === "__add_brand__") {
            setIsAdding(true);
            setStatus("");
            return;
          }

          onChange(nextValue);
        }}
      >
        <option value="">Выберите марку</option>
        {categoryLabels.map((label) => (
          <option
            disabled={selectedKeys.has(normalizeProductionBrandKey(label.label))}
            key={label.id}
            value={label.label}
          >
            {label.label}
          </option>
        ))}
        {!disabled ? <option value="__add_brand__">+ Новая марка</option> : null}
      </select>
      {isAdding ? (
        <div className="production-brand-create">
          <input
            aria-label="Новая марка"
            disabled={isSaving}
            maxLength={120}
            placeholder="Название марки"
            type="text"
            value={newLabel}
            onChange={(event) => setNewLabel(event.currentTarget.value)}
          />
          <button disabled={isSaving} type="button" onClick={saveNewBrand}>
            {isSaving ? (
              <LoadingIndicator
                label="Сохраняем…"
                variant="button"
              />
            ) : "Сохранить"}
          </button>
          <button
            disabled={isSaving}
            type="button"
            onClick={() => {
              setIsAdding(false);
              setNewLabel("");
              setStatus("");
            }}
          >
            Отмена
          </button>
          {status ? <span role="status">{status}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

function normalizeProductionBrandKey(value: string) {
  return value.trim().replace(/\s+/gu, " ").toLocaleLowerCase("ru-RU");
}

function ProductionGranulationTable({
  form,
}: {
  form: DispatcherFormDefinition;
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
                <ProductionReportCell fieldName={fieldName} form={form} />
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function ProductionReportCell({
  fieldName,
  form,
  required,
}: {
  fieldName: string;
  form: DispatcherFormDefinition;
  required?: boolean;
}) {
  const field = form.fields.find((item) => item.name === fieldName);

  if (field === undefined) {
    return null;
  }

  return (
    <div className="production-report-cell-input" title={field.label}>
      <DispatcherFormFieldInput
        field={field}
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
  const submissions =
    incidentFeed.status === "ready" ? incidentFeed.submissions : [];
  const openIncidents = buildOpenIncidentOptions(submissions);
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
        limit: 2_000,
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
  options,
  required,
  onValueChange,
}: {
  defaultValue?: string;
  field: DispatcherFormField;
  options?: readonly string[];
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
        required={required ?? field.required}
        defaultValue={defaultValue ?? readInputDefaultValue(field)}
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

function DispatcherFeedPanel({
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
  const equipmentRows = buildEquipmentSummaryRows(submissions, selectedDateRange);
  const productionTables = filterProductionReportTables(
    dispatcherFeed.status === "ready"
      ? dispatcherFeed.productionReportTables
      : emptyProductionReportTables,
    selectedDateRange,
  );
  const incidentRows = buildIncidentSummaryRows(submissions, selectedDateRange);
  const visitorRows = buildVisitorVisitRows(submissions, selectedDateRange);
  const productionForm =
    dispatcherForms.status === "ready"
      ? dispatcherForms.forms.find((form) => form.id === "production")
      : undefined;
  const visibleRowCount = {
    production: new Set(
      Object.values(productionTables)
        .flat()
        .map((row) => row.reportId),
    ).size,
    equipment: equipmentRows.length,
    incidents: incidentRows.length,
    visitors: visitorRows.length,
  }[filters.group];

  function handlePeriodChange(period: DispatcherFeedPeriod) {
    const range = buildDispatcherFeedDateRange(period);

    onFiltersChange({
      period,
      dateFrom: range.dateFrom ?? "",
      dateTo: range.dateTo ?? "",
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
          <div className="dispatcher-period-buttons" aria-label="Период данных">
            {dispatcherFeedPeriodOptions.map((option) => (
              <button
                className={`dispatcher-period-button ${
                  filters.period === option.id ? "is-active" : ""
                }`}
                type="button"
                aria-pressed={filters.period === option.id}
                key={option.id}
                onClick={() => handlePeriodChange(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          {filters.period === "custom" ? (
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
          <span>Строк в таблице: {visibleRowCount}</span>
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
        <IncidentSummaryTable rows={incidentRows} />
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

function ProductionReportSummaryTable({
  form,
  tables,
  submissions,
}: {
  form: DispatcherFormDefinition | undefined;
  tables: ProductionReportTables;
  submissions: DispatcherSubmission[];
}) {
  const [section, setSection] = useState<ProductionReportSection>(
    () =>
      productionReportSectionOptions.find(
        (option) => tables[option.id].length > 0,
      )?.id ?? "forming",
  );
  const [detailReportId, setDetailReportId] = useState<string>();
  const selectedRows = tables[section] as ProductionReportBaseRow[];
  const detailRow = selectedRows.find(
    (row) => row.reportId === detailReportId,
  );
  const detailSubmission = submissions.find(
    (submission) =>
      submission.formId === "production" && submission.id === detailReportId,
  );

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

      {selectedRows.length === 0 ? (
        <p className="dispatcher-status-line">
          Нет данных для выбранной таблицы и периода.
        </p>
      ) : section === "forming" || section === "sorting" ? (
        <ProductionMetricDashboardTable
          rows={tables[section]}
          formAvailable={form !== undefined}
          onOpen={setDetailReportId}
        />
      ) : section === "unformed" || section === "chamotte" ? (
        <ProductionBrandDashboardTable
          rows={tables[section]}
          formAvailable={form !== undefined}
          onOpen={setDetailReportId}
        />
      ) : section === "jars" ? (
        <ProductionJarDashboardTable
          rows={tables.jars}
          formAvailable={form !== undefined}
          onOpen={setDetailReportId}
        />
      ) : (
        <ProductionGranulationDashboardTable
          rows={tables.granulation}
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

function ProductionMetricDashboardTable({
  rows,
  formAvailable,
  onOpen,
}: {
  rows: ProductionMetricRow[];
  formAvailable: boolean;
  onOpen: (reportId: string) => void;
}) {
  return (
    <div className="production-dashboard-table-wrap">
      <table className="production-dashboard-table">
        <thead>
          <tr>
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
              <td>{row.brand ?? "—"}</td>
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

function ProductionBrandDashboardTable({
  rows,
  formAvailable,
  onOpen,
}: {
  rows: ProductionBrandCategoryRow[];
  formAvailable: boolean;
  onOpen: (reportId: string) => void;
}) {
  return (
    <div className="production-dashboard-table-wrap">
      <table className="production-dashboard-table production-dashboard-brand-table">
        <thead>
          <tr>
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
  formAvailable,
  onOpen,
}: {
  rows: ProductionJarMeasurementRow[];
  formAvailable: boolean;
  onOpen: (reportId: string) => void;
}) {
  return (
    <div className="production-dashboard-table-wrap">
      <table className="production-dashboard-table">
        <thead>
          <tr>
            <th scope="col">Дата</th>
            <th scope="col">Банка</th>
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
  formAvailable,
  onOpen,
}: {
  rows: ProductionGranulationRow[];
  formAvailable: boolean;
  onOpen: (reportId: string) => void;
}) {
  return (
    <div className="production-dashboard-table-wrap">
      <table className="production-dashboard-table production-dashboard-granulation-table">
        <thead>
          <tr>
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
    const match = /^(unformed|chamotte)(Brand|Fact)([1-9]\d?)$/u.exec(
      fieldName,
    );

    if (match === null || Number(match[3]) > 50) return [];

    const section = match[1] === "unformed"
      ? "Неформованная продукция"
      : "Цех обжига шамота";
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
      <div className="dispatcher-feed-table" role="table">
        <div className="dispatcher-feed-row dispatcher-feed-row-equipment dispatcher-feed-head" role="row">
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
          <div className="equipment-detail-table" role="table">
            <div className="equipment-detail-row equipment-detail-head" role="row">
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

function IncidentSummaryTable({ rows }: { rows: ReturnType<typeof buildIncidentSummaryRows> }) {
  if (rows.length === 0) {
    return <p className="dispatcher-status-line">Нет инцидентов для выбранного периода.</p>;
  }

  return (
    <div className="dispatcher-feed-table" role="table">
      <div className="dispatcher-feed-row dispatcher-feed-row-incidents dispatcher-feed-head" role="row">
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
    <div className="dispatcher-feed-table" role="table">
      <div className="dispatcher-feed-row dispatcher-feed-row-visitors dispatcher-feed-head" role="row">
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
  onSelectAccountView,
}: {
  profile: ServerUserProfile;
  activeTab: AdminTab;
  onShowToast: ShowToast;
  onSelectAccountView: (account: AdminAccountSummary) => void;
}) {
  if (activeTab === "database") {
    return (
      <AdminDatabaseWorkspace profile={profile} onShowToast={onShowToast} />
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
  const canViewAudit =
    hasCapability(profile, "platform.view_audit") ||
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
      showTechnicalDetails: profile.accountType === "admin",
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
              {profile.accountType === "admin" ? "Все аккаунты" : "Все аккаунты бизнеса"}
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
        <div className="admin-audit-list" role="table" aria-label="Журнал действий">
          <div className="admin-audit-row admin-audit-row-head" role="row">
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
  const isAdmin = account.accountType === "admin";

  return (
    <button
      className="admin-account-button"
      type="button"
      disabled={isAdmin}
      title={
        isAdmin
          ? "Административный аккаунт показан в списке, но не открывается в превью."
          : undefined
      }
      onClick={() => {
        if (!isAdmin) onSelectAccountView(account);
      }}
    >
      <span>{account.positionDisplayName}</span>
      {!isTypePreview ? <strong>{account.userDisplayName}</strong> : null}
      {isTypePreview ? (
        isAdmin ? <small>Без превью</small> : null
      ) : (
        <small>{account.login}</small>
      )}
    </button>
  );
}

function AdminDatabaseWorkspace({
  profile,
  onShowToast,
}: {
  profile: ServerUserProfile;
  onShowToast: ShowToast;
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
  }, [selectedTableName]);

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
      signal: controller.signal,
    }).then((result) => {
      if (!controller.signal.aborted) {
        setRowsState(result);
      }
    });

    return () => {
      controller.abort();
    };
  }, [canManageDatabase, selectedTableName, rowsOffset, refreshVersion]);

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
      onShowToast("Сохранено", "Строка БД обновлена.");
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
      onShowToast("Удалено", "Строка БД удалена.");
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
      onShowToast("Марки объединены", `${sourceLabel} → ${target.label}`);
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
          <AdminDatabaseRowsTable
            rowsState={rowsState}
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
  onEdit,
  onMerge,
  onDelete,
  onClear,
  onNextPage,
  onPreviousPage,
}: {
  rowsState: AdminDatabaseRowsLoadState;
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
        <strong>{rowsState.offset === 0 ? "Строк нет" : "Страницы дальше нет"}</strong>
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
                {field.inputType === "textarea" ? (
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
  position: "worker",
};

type AdminPositionFormState = {
  id?: string;
  displayName: string;
  accountType: "business_owner" | "worker" | "dispatcher";
  navigationItems: AccountNavigationItem[];
};

const emptyAdminPositionForm: AdminPositionFormState = {
  displayName: "",
  accountType: "business_owner",
  navigationItems: nonAdminNavigationItems
    .filter(
      ({ id }) =>
        id !== "business.dispatcher_form" &&
        id !== "business.user_actions" &&
        id !== "business.production_plan",
    )
    .map(({ id }) => id),
};

const availableNavigationItemsByBaseCabinet: Record<
  AdminPositionFormState["accountType"],
  NavigationItem[]
> = {
  business_owner: nonAdminNavigationItems.filter(
    ({ id }) => id !== "business.dispatcher_form",
  ),
  worker: [],
  dispatcher: nonAdminNavigationItems.filter(
    ({ id }) => id === "business.dispatcher_form",
  ),
};

const defaultNavigationItemsByBaseCabinet: Record<
  AdminPositionFormState["accountType"],
  AccountNavigationItem[]
> = {
  business_owner: availableNavigationItemsByBaseCabinet.business_owner
    .filter(
      ({ id }) =>
        id !== "business.user_actions" && id !== "business.production_plan",
    )
    .map(({ id }) => id),
  worker: [],
  dispatcher: availableNavigationItemsByBaseCabinet.dispatcher.map(({ id }) => id),
};

const baseCabinetLabels: Record<AdminPositionFormState["accountType"], string> = {
  business_owner: "Руководитель",
  worker: "Работник",
  dispatcher: "Диспетчер",
};

const adminAccountPositionOptions: AccountPosition[] = [
  "administrator",
  "business_owner",
  "board_chair",
  "board_member",
  "general_director",
  "economist",
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
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [revealedPasswords, setRevealedPasswords] = useState<
    Record<string, string>
  >({});
  const [form, setForm] = useState<AdminAccountFormState>(emptyAdminAccountForm);
  const [formStatus, setFormStatus] = useState("");
  const [workspaceStatus, setWorkspaceStatus] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
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
  const [updatingPositionAccessId, setUpdatingPositionAccessId] = useState<
    string | undefined
  >(undefined);
  const [accountPositionDrafts, setAccountPositionDrafts] = useState<
    Record<string, AccountPosition>
  >({});
  const [deletingUserId, setDeletingUserId] = useState<string>();
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
      if (!controller.signal.aborted) setPositionsState(result);
    });

    return () => {
      controller.abort();
    };
  }, [canManage, refreshVersion]);

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
    const firstPosition = positionsState.status === "ready" ? positionsState.positions[0] : undefined;
    setForm((current) => ({
      ...emptyAdminAccountForm,
      position: firstPosition?.id ?? current.position,
    }));
    setFormStatus("");
    setIsCreateModalOpen(true);
  }

  function openPositionModal(position?: AdminPositionSummary) {
    setPositionForm(position === undefined ? emptyAdminPositionForm : {
      id: position.id,
      displayName: position.displayName,
      accountType: position.accountType as AdminPositionFormState["accountType"],
      navigationItems: position.navigationItems.filter((id) =>
        availableNavigationItemsByBaseCabinet[
          position.accountType as AdminPositionFormState["accountType"]
        ].some((item) => item.id === id),
      ),
    });
    setPositionFormStatus("");
    setIsPositionModalOpen(true);
  }

  async function handlePositionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      positionForm.displayName.trim().length === 0 ||
      (positionForm.accountType !== "worker" && positionForm.navigationItems.length === 0)
    ) {
      setPositionFormStatus("Укажите название и выберите хотя бы одну вкладку.");
      return;
    }
    setIsSubmitting(true);
    const value = {
      displayName: positionForm.displayName.trim(),
      accountType: positionForm.accountType,
      navigationItems: positionForm.navigationItems,
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
    );
    setRefreshVersion((version) => version + 1);
  }

  async function handleDeletePosition(position: AdminPositionSummary) {
    if (position.isProtected || position.usageCount > 0 || deletingPositionId !== undefined) {
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
    onShowToast("Удалено", `Должность «${position.displayName}» удалена.`);
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

    setIsSubmitting(true);
    setFormStatus("Создаём учётную запись.");

    const submittedPassword = form.password;
    const result = await createAdminAccount({
      login: submittedLogin,
      password: submittedPassword,
      displayName: form.displayName.trim(),
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
    onShowToast("Пароль изменён", `Пароль для «${submittedLogin}» изменён.`);
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
            disabled={positionsState.status !== "ready"}
            onClick={openCreateModal}
          >
            Новая учётная запись
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={!canManageAccess}
            onClick={() => openPositionModal()}
          >
            Новая должность
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
                  const isUpdating = updatingUserId === account.userId;
                  const isUpdatingPosition =
                    updatingPositionAccessId === account.accessId;
                  const selectedPosition =
                    accountPositionDrafts[account.accessId] ?? account.position;
                  const isPositionChangeDisabled =
                    !canManageAccess ||
                    isCurrentAccount ||
                    isArchived ||
                    positionsState.status !== "ready" ||
                    updatingPositionAccessId !== undefined ||
                    updatingUserId !== undefined;
                  const isToggleDisabled =
                    !canManageAccess ||
                    isCurrentAccount ||
                    isArchived ||
                    isUpdating ||
                    updatingPositionAccessId !== undefined;
                  const toggleTitle = !canManageAccess
                    ? "Нет права изменять доступ."
                    : isCurrentAccount
                      ? "Нельзя отключить текущую учётную запись."
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
                              <option key={position.id} value={position.id}>
                                {position.displayName}
                              </option>
                            ))}
                          </select>
                          <button
                            className="secondary-button"
                            type="button"
                            disabled={
                              isPositionChangeDisabled ||
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
                      <td>
                        <AdminAccountPasswordCell
                          revealedPassword={revealedPasswords[account.login]}
                          isResetting={resettingLogin === account.login}
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
                            title={isCurrentAccount ? "Нельзя удалить текущую учётную запись." : undefined}
                            disabled={
                              !canManageAccess ||
                              isCurrentAccount ||
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
                    <td colSpan={6}>Учётных записей пока нет.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}

        <h3 className="admin-positions-title">Должности и доступы</h3>
        {positionsState.status === "ready" ? (
          <div className="admin-db-table-scroll">
            <table className="admin-db-data-table admin-positions-table">
              <thead><tr><th>Должность</th><th>Базовый кабинет</th><th>Вкладки слева</th><th>Аккаунты</th><th /></tr></thead>
              <tbody>
                {positionsState.positions.map((position) => (
                  <tr key={position.id}>
                    <td>{position.displayName}</td>
                    <td>{position.accountType === "admin" ? "Администратор" : baseCabinetLabels[position.accountType]}</td>
                    <td>{position.navigationItems.map((id) =>
                      [...navigationItemsByAccountType.admin, ...nonAdminNavigationItems].find((item) => item.id === id)?.label ?? id
                    ).join(", ")}</td>
                    <td>{position.usageCount}</td>
                    <td>
                      <div className="admin-position-actions">
                        <button
                          className="secondary-button"
                          type="button"
                          disabled={!canManageAccess || position.isProtected}
                          onClick={() => openPositionModal(position)}
                        >
                          Изменить
                        </button>
                        <button
                          className="secondary-button secondary-button-danger"
                          type="button"
                          title={position.usageCount > 0 ? "Должность назначена аккаунтам." : undefined}
                          disabled={
                            !canManageAccess ||
                            position.isProtected ||
                            position.usageCount > 0 ||
                            deletingPositionId === position.id
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
                ))}
              </tbody>
            </table>
          </div>
        ) : positionsState.status === "loading" ? (
          <LoadingIndicator label={positionsState.message} variant="panel" />
        ) : (
          <p className="dispatcher-status-line">{positionsState.message}</p>
        )}
      </div>

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
                    <option key={position.id} value={position.id}>
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

      {isPositionModalOpen ? (
        <div className="admin-db-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !isSubmitting) setIsPositionModalOpen(false);
        }}>
          <section aria-labelledby="admin-position-title" aria-modal="true" className="admin-account-modal" role="dialog" onKeyDown={keepFocusInsideDialog}>
            <div className="admin-account-modal-header">
              <h3 id="admin-position-title">{positionForm.id === undefined ? "Новая должность" : "Настройка должности"}</h3>
              <button className="secondary-button" type="button" disabled={isSubmitting} onClick={() => setIsPositionModalOpen(false)}>Закрыть</button>
            </div>
            <form className="data-entry-form admin-accounts-form" onSubmit={handlePositionSubmit}>
              <label>
                <span>Название должности</span>
                <input value={positionForm.displayName} onChange={(event) => {
                  const displayName = event.currentTarget.value;
                  setPositionForm((current) => ({ ...current, displayName }));
                }} required />
              </label>
              <label>
                <span>Базовый кабинет</span>
                <select value={positionForm.accountType} onChange={(event) => {
                  const accountType = event.currentTarget.value as AdminPositionFormState["accountType"];
                  setPositionForm((current) => ({
                    ...current,
                    accountType,
                    navigationItems: [...defaultNavigationItemsByBaseCabinet[accountType]],
                  }));
                }}>
                  {(Object.keys(baseCabinetLabels) as AdminPositionFormState["accountType"][]).map((type) => (
                    <option key={type} value={type}>{baseCabinetLabels[type]}</option>
                  ))}
                </select>
              </label>
              <fieldset className="admin-account-navigation-fieldset">
                <legend>Доступ к вкладкам слева</legend>
                {positionForm.accountType === "worker" ? (
                  <p className="admin-position-empty-workspace-copy">
                    Кабинет работника пока пуст. Вкладки для него недоступны.
                  </p>
                ) : (
                  <div className="admin-account-navigation-grid">
                    {availableNavigationItemsByBaseCabinet[positionForm.accountType].map((item) => (
                      <label key={item.id} className="admin-account-navigation-option">
                        <input type="checkbox" checked={positionForm.navigationItems.includes(item.id)} onChange={(event) => {
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
                  </div>
                )}
              </fieldset>
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
  onReset,
}: {
  revealedPassword: string | undefined;
  isResetting: boolean;
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
        disabled={isResetting}
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
      capabilities: [...account.capabilities],
      navigationItems: [...account.navigationItems],
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

function readDispatcherSubmissionPayload(
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
      if (!/^(?:unformed|chamotte)(?:Brand|Fact)(?:[1-9]|[1-4]\d|50)$/u.test(fieldName)) {
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

function readPositiveIntegerInput(value: string) {
  const normalized = value.trim();

  if (!/^\d+$/u.test(normalized)) {
    return undefined;
  }

  const number = Number(normalized);

  return Number.isSafeInteger(number) && number > 0 ? number : undefined;
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

function formatEquipmentWorkingCounts(
  counts: NonNullable<OwnerDispatcherOverview["equipment"]>["workingCounts"],
) {
  if (counts.length === 0) {
    return "нет данных по позициям оборудования";
  }

  return counts.map((item) => `${item.label} - ${item.count} шт`).join("; ");
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 2,
  }).format(value);
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

function readOverviewDetailValue(value: string | undefined) {
  const text = value?.trim();

  return text === undefined || text.length === 0 ? "Не указано" : text;
}

function readOptionalFormValue(value: FormDataEntryValue | null) {
  const text = typeof value === "string" ? value.trim() : "";

  return text.length > 0 ? text : undefined;
}
