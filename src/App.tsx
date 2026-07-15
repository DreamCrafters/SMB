import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  accountCapabilities,
  type AccountNavigationItem,
  type AccountPosition,
  type AccountType,
  type AdminAccountSummary,
  type AdminPositionSummary,
  type AdminDatabaseCellValue,
  type AdminDatabaseColumn,
  type AdminDatabaseRow,
  type AdminDatabaseTable,
  type AdminDispatcherImportPreviewResponse,
  type DispatcherFormDefinition,
  type DispatcherFormField,
  type DispatcherFormId,
  type DispatcherSubmission,
  type DispatcherSubmissionPayload,
  type DevAccessOption,
  type ServerUserProfile,
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
import { isProductionAppEnv } from "./services/appEnvironment";
import {
  requestAccessProfile,
  type AccessProfileLoadState,
} from "./services/accessProfile";
import {
  requestDispatcherForms,
  requestDispatcherFeed,
  submitDispatcherEquipmentReport,
  submitDispatcherSubmission,
  type DispatcherFeedResult,
  type DispatcherFormsResult,
} from "./services/dispatcherSubmissions";
import { validateDispatcherPayloadForSubmit } from "./services/dispatcherPayloadValidation";
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
} from "./services/dispatcherFormInput";
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
} from "./services/accessGuards";
import {
  clearAdminDatabaseTable,
  deleteAdminDatabaseRow,
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
  updateAdminPosition,
  type AdminAccountsListResult,
  type AdminPositionsResult,
} from "./services/adminAccounts";
import {
  buildDispatcherFeedDateRange,
  buildEquipmentDetailRows,
  buildEquipmentSummaryRows,
  buildIncidentSummaryRows,
  buildOwnerDispatcherOverview,
  buildOpenIncidentOptions,
  buildOpenVisitorOptions,
  buildVisitorVisitRows,
  readDispatcherGroupFormIds,
  type OwnerDispatcherOverview,
  type DispatcherFeedGroup,
  type DispatcherFeedPeriod,
} from "./services/dispatcherFeedViews";
import { readShortUserMessage } from "./services/userFacingMessages";

type BusinessTab = "overview" | "dispatcher" | "work" | "dispatcher_form";
type AdminTab = "account_preview" | "accounts" | "database";

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

type DevAccessOptionsLoadState =
  | { status: "loading"; message: string }
  | DevAccessOptionsResult;

type DispatcherFeedFilterState = {
  group: DispatcherFeedGroup;
  period: DispatcherFeedPeriod;
  dateFrom: string;
  dateTo: string;
};

type DispatcherFormChoiceGroupId = "equipment" | "incidents" | "visitors";

type EquipmentLocalStatusTone = "info" | "error";

type DispatcherFormChoiceGroup = {
  id: DispatcherFormChoiceGroupId;
  title: string;
  description: string;
  forms: DispatcherFormDefinition[];
};

type DataEntrySubmitToast = {
  id: number;
  message: string;
};

type FormLeaveGuard = (continueAfterDiscard: () => void) => boolean;

const submitToastTimeoutMs = 4_000;

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

  return navigationItems
    .filter((item) => getBusinessTabForNavigationItem(item) !== undefined)
    .map((item) => {
      const target = getBusinessTabForNavigationItem(item);

      return {
        ...item,
        state: target === businessTab ? "active" : "pending",
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
    default:
      return undefined;
  }
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
    let currentController: AbortController | undefined;

    function loadDispatcherFeed() {
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

      requestDispatcherFeed({
        signal: currentController.signal,
        localFallback: isLocalTestFallbackEnabled,
        limit: 2_000,
      }).then((result) => {
        if (isActive) {
          setDispatcherFeed(result);
        }
      });
    }

    loadDispatcherFeed();
    const intervalId = window.setInterval(loadDispatcherFeed, 5_000);

    return () => {
      isActive = false;
      currentController?.abort();
      window.clearInterval(intervalId);
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

  async function handleSelectAccount(option: DevAccessOption) {
    setSessionRequest({
      status: "loading",
      position: option.position,
    });

    const result = await selectDevAccessSession(option, {
      localDevFallback: isLocalTestFallbackEnabled,
    });
    handleSessionResult(result);
  }

  async function handlePasswordLogin(credentials: {
    login: string;
    password: string;
  }) {
    setSessionRequest({
      status: "loading",
    });

    const result = await loginWithPassword(credentials);
    handleSessionResult(result);
  }

  async function handleClearSession() {
    setSessionRequest({
      status: "loading",
    });

    const result = isProductionApp
      ? await logoutAuthSession()
      : await clearDevAccessSession({
          localDevFallback: isLocalTestFallbackEnabled,
        });
    handleSessionResult(result);
  }

  function handleSessionResult(result: DevAccessSessionResult | AuthSessionResult) {
    if (result.status === "ready") {
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
    const businessAccountId = getActiveBusinessAccountId(submitProfile);
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
        businessAccountId,
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
          businessAccountId,
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
        businessAccountId,
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
      ? buildAdminPreviewProfile(adminViewedAccount, profile)
      : undefined;
  const isAdminPreviewMode = viewedProfile !== undefined;
  const visibleProfile = viewedProfile ?? profile;
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
      className={`ops-shell ${isAdminPreviewMode ? "ops-shell-admin-preview" : ""}`}
    >
      <SideRail
        profile={visibleProfile}
        isAdminPreviewMode={isAdminPreviewMode}
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

      <section className="workspace" aria-label="Рабочая область">
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
              {sessionRequest.status === "loading" ? "Входим..." : "Войти"}
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
                  <small>{isSelecting ? "Входим..." : copy?.description}</small>
                </button>
              );
            })}
          </div>
        )}

        <div className={`auth-status auth-status-${accessProfile.status}`}>
          <span
            className={`status-dot status-dot-${accessProfile.status}`}
            aria-hidden="true"
          />
          <p>{statusMessage}</p>
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

function SideRail({
  profile,
  isAdminPreviewMode,
  onClearSession,
  isSessionLoading,
  sessionError,
  ownerTab,
  onOwnerTabChange,
  adminTab,
  onAdminTabChange,
}: {
  profile: ServerUserProfile;
  isAdminPreviewMode: boolean;
  onClearSession: () => void;
  isSessionLoading: boolean;
  sessionError?: string;
  ownerTab: BusinessTab;
  onOwnerTabChange: (tab: BusinessTab) => void;
  adminTab: AdminTab;
  onAdminTabChange: (tab: AdminTab) => void;
}) {
  const navigationItems = buildNavigationItems(
    profile,
    ownerTab,
    adminTab,
  );

  return (
    <aside className="side-rail" aria-label="Основная навигация">
      <div className="rail-brand-row">
        <div className="brand-mark" aria-hidden="true">
          <img alt="" src="/nmou-vector-icon.png" />
        </div>
        {isAdminPreviewMode ? (
          <div className="admin-preview-mode-badge" role="status">
            АДМИН ПРЕВЬЮ МОД
          </div>
        ) : null}
      </div>
      <div>
        <p className="eyebrow">платформа</p>
        <h1>{shellCopy.productName}</h1>
      </div>
      <nav className="primary-nav">
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
          onClick={onClearSession}
        >
          {isAdminPreviewMode
            ? "Выйти из превью мода"
            : isSessionLoading
              ? "Выходим..."
              : "Выйти из аккаунта"}
        </button>
        {sessionError === undefined ? null : (
          <small className="rail-session-error">{sessionError}</small>
        )}
      </div>
    </aside>
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
  onSelectAdminAccountView: (account: AdminAccountSummary) => void;
}) {
  const navigationByBusinessTab: Record<BusinessTab, AccountNavigationItem> = {
    overview: "business.overview",
    dispatcher: "business.dispatcher",
    work: "business.work",
    dispatcher_form: "business.dispatcher_form",
  };
  const effectiveOwnerTab = profile.activeAccess.navigationItems.includes(
    navigationByBusinessTab[ownerTab],
  )
    ? ownerTab
    : ((Object.keys(navigationByBusinessTab) as BusinessTab[]).find((tab) =>
        profile.activeAccess.navigationItems.includes(navigationByBusinessTab[tab]),
      ) ?? ownerTab);
  const adminNavigationByTab: Record<AdminTab, AccountNavigationItem> = {
    account_preview: "admin.account_preview",
    accounts: "admin.accounts",
    database: "admin.database",
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
          onSelectAccountView={onSelectAdminAccountView}
        />
      );
    default:
      if (effectiveOwnerTab === "work") return <WorkerWorkspace />;
      if (effectiveOwnerTab === "dispatcher_form") {
        return (
          <DataEntryWorkspace
            ariaLabel="Диспетчерская отправка"
            status={dataEntryStatus}
            isSubmitting={isDataEntrySubmitting}
            onSubmit={onDataEntrySubmit}
            dispatcherForms={dispatcherForms}
            businessAccountId={getActiveBusinessAccountId(profile)}
            currentUserDisplayName={profile.displayName}
            isAdminPreviewMode={isAdminPreviewMode}
            refreshVersion={dispatcherSubmissionVersion}
            onResetStatus={onDataEntryStatusReset}
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
          businessAccountId={getActiveBusinessAccountId(profile)}
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
  businessAccountId,
}: {
  activeTab: Extract<BusinessTab, "overview" | "dispatcher">;
  dispatcherFeed: DispatcherFeedLoadState;
  dispatcherForms: DispatcherFormsLoadState;
  dispatcherFeedFilters: DispatcherFeedFilterState;
  onDispatcherFeedFiltersChange: (
    patch: Partial<DispatcherFeedFilterState>,
  ) => void;
  businessAccountId: string;
}) {
  if (activeTab === "overview") {
    const overview = buildOwnerDispatcherOverview(
      dispatcherFeed.status === "ready" ? dispatcherFeed.submissions : [],
      { businessAccountId },
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
        <p className="owner-overview-status">{dispatcherFeed.message}</p>
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

function OwnerIncidentOverviewBlock({
  overview,
}: {
  overview: OwnerDispatcherOverview;
}) {
  const incident = overview.latestIncident;

  return (
    <section className="owner-overview-block" aria-label="Последний инцидент">
      <h3>Последний инцидент</h3>
      {incident === undefined ? (
        <p className="owner-overview-status">Нет зарегистрированных инцидентов.</p>
      ) : (
        <>
          <p className="owner-overview-lead">
            Дата последнего инцидента -{" "}
            <strong>{formatDateTime(incident.updatedAt)}</strong>.
          </p>
          <OwnerOverviewDetails
            rows={[
              ["Дата и время инцидента", incident.dateTime],
              ["Место (цех/участок)", incident.location],
              ["Тип инцидента", incident.incidentType],
              ["Описание", incident.description],
              ["Критичность", incident.criticality],
              ["Ответственный за регистрацию", incident.responsible],
              ["Оперативные меры", incident.immediateActions],
              ["Статус", incident.status],
              ["Номер инцидента", incident.incidentNumber],
            ]}
          />
        </>
      )}
    </section>
  );
}

function OwnerIncidentClosureOverviewBlock({
  overview,
}: {
  overview: OwnerDispatcherOverview;
}) {
  const closure = overview.latestIncidentClosure;

  return (
    <section className="owner-overview-block" aria-label="Последнее закрытие инцидента">
      <h3>Последнее закрытие инцидента</h3>
      {closure === undefined ? (
        <p className="owner-overview-status">Нет закрытых инцидентов.</p>
      ) : (
        <>
          <p className="owner-overview-lead">
            Дата последнего закрытия инцидента -{" "}
            <strong>{formatDateTime(closure.updatedAt)}</strong>.
          </p>
          <OwnerOverviewDetails
            rows={[
              ["Номер инцидента", closure.incidentNumber],
              ["Корневые причины", closure.rootCauses],
              ["Предотвращающие меры", closure.preventiveMeasures],
              ["Дата и время закрытия", closure.closureDateTime],
              ["Затраты (убытки), руб", closure.costs],
              ["Кто утвердил закрытие", closure.approvedBy],
              ["Примечание", closure.closureNote],
              ["Статус", closure.status],
            ]}
          />
        </>
      )}
    </section>
  );
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

function readDispatcherFormChoiceGroups(
  forms: DispatcherFormDefinition[],
): DispatcherFormChoiceGroup[] {
  const groups: DispatcherFormChoiceGroup[] = [
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
  businessAccountId,
  currentUserDisplayName,
  isAdminPreviewMode,
  refreshVersion,
  onResetStatus,
}: {
  ariaLabel: string;
  status: string;
  isSubmitting: boolean;
  onSubmit: DataEntrySubmitHandler;
  dispatcherForms: DispatcherFormsLoadState;
  businessAccountId: string;
  currentUserDisplayName: string;
  isAdminPreviewMode: boolean;
  refreshVersion: number;
  onResetStatus: () => void;
}) {
  const forms = dispatcherForms.status === "ready" ? dispatcherForms.forms : [];
  const [selectedFormId, setSelectedFormId] = useState("");
  const [submitToast, setSubmitToast] = useState<DataEntrySubmitToast | undefined>(
    undefined,
  );
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

  useEffect(() => {
    if (submitToast === undefined) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setSubmitToast((current) =>
        current?.id === submitToast.id ? undefined : current,
      );
    }, submitToastTimeoutMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [submitToast]);

  function handleSelectForm(formId: string) {
    const continueSelection = () => {
      formLeaveGuardRef.current = undefined;
      onResetStatus();
      setSelectedFormId(formId);
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
    setSubmitToast({
      id: Date.now(),
      message,
    });
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
        <p className="form-status">{formsStatusMessage}</p>
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
        {submitToast !== undefined ? (
          <div
            aria-live="polite"
            className="dispatcher-submit-toast"
            role="status"
          >
            <strong>Отправлено</strong>
            <span>{submitToast.message}</span>
          </div>
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
      {submitToast !== undefined ? (
        <div
          aria-live="polite"
          className="dispatcher-submit-toast"
          role="status"
        >
          <strong>Отправлено</strong>
          <span>{submitToast.message}</span>
        </div>
      ) : null}
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
        {currentForm.id === "equipment" ? (
          <DispatcherEquipmentFormBody
            businessAccountId={businessAccountId}
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
            businessAccountId={businessAccountId}
            isSubmitting={isSubmitting}
            refreshVersion={refreshVersion}
            status={status}
          />
        ) : currentForm.id === "incident_close" ? (
          <DispatcherIncidentCloseFormBody
            businessAccountId={businessAccountId}
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
                {isSubmitting ? "Отправка..." : "Отправить"}
              </button>
              {status.length > 0 ? <p className="form-status">{status}</p> : null}
            </div>
          </>
        )}
      </form>
    </section>
  );
}

function DispatcherIncidentCloseFormBody({
  businessAccountId,
  form,
  isSubmitting,
  refreshVersion,
  status,
}: {
  businessAccountId: string;
  form: DispatcherFormDefinition;
  isSubmitting: boolean;
  refreshVersion: number;
  status: string;
}) {
  const [incidentFeed, setIncidentFeed] = useState<DispatcherFeedLoadState>({
    status: "loading",
    message: "Загружаем инциденты.",
  });
  const submissions =
    incidentFeed.status === "ready" ? incidentFeed.submissions : [];
  const openIncidents = buildOpenIncidentOptions(submissions, businessAccountId);
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

  return (
    <>
      <div className="dispatcher-form-fields">
        <label>
          <span>Незакрытый инцидент</span>
          <select
            name="incidentNumber"
            required
            defaultValue=""
            disabled={openIncidents.length === 0}
          >
            <option value="">
              {openIncidents.length === 0
                ? "Нет незакрытых инцидентов"
                : "Выберите инцидент"}
            </option>
            {openIncidents.map((incident) => (
              <option
                value={incident.incidentNumber}
                key={incident.incidentNumber}
              >
                {incident.label}
              </option>
            ))}
          </select>
        </label>
        {closeFields.map((field) => (
          <DispatcherFormFieldInput field={field} key={field.name} />
        ))}
      </div>
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
      <div className="form-actions">
        <button
          className="primary-button"
          type="submit"
          disabled={isSubmitting || openIncidents.length === 0}
        >
          {isSubmitting ? "Отправка..." : "Закрыть инцидент"}
        </button>
        {status.length > 0 ? <p className="form-status">{status}</p> : null}
      </div>
    </>
  );
}

function DispatcherVisitorExitFormBody({
  businessAccountId,
  isSubmitting,
  refreshVersion,
  status,
}: {
  businessAccountId: string;
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
    businessAccountId,
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
          {isSubmitting ? "Отправка..." : "Отметить выход"}
        </button>
        {status.length > 0 ? <p className="form-status">{status}</p> : null}
      </div>
    </>
  );
}

function DispatcherEquipmentFormBody({
  businessAccountId,
  form,
  isSubmitting,
  refreshVersion,
  status,
  onLeaveGuardChange,
  onResetStatus,
}: {
  businessAccountId: string;
  form: DispatcherFormDefinition;
  isSubmitting: boolean;
  refreshVersion: number;
  status: string;
  onLeaveGuardChange: (guard: FormLeaveGuard | undefined) => void;
  onResetStatus: () => void;
}) {
  const equipmentOptions = readEquipmentOptions(form);
  const [payload, setPayload] = useState(() =>
    buildInitialEquipmentFormPayload(form, businessAccountId, equipmentOptions),
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
    businessAccountId,
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
          businessAccountId,
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
      buildInitialEquipmentFormPayload(form, businessAccountId, equipmentOptions),
    );
    setReportDraftVersion((version) => version + 1);
    setEquipmentLocalStatus("");
    setEquipmentLocalStatusTone("info");
  }, [businessAccountId, form, equipmentOptions]);

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
      businessAccountId,
      equipment: selectedEquipment,
      form,
      reportDate,
      storage,
    });
    const draftPayload = readEquipmentDraftPayload({
      businessAccountId,
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
    businessAccountId,
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
        businessAccountId,
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
          businessAccountId,
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
            businessAccountId,
            equipment,
            form,
            reportDate,
            storage,
          });
    const draftPayload =
      equipment.length === 0
        ? {}
        : readEquipmentDraftPayload({
            businessAccountId,
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
      businessAccountId,
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
      businessAccountId,
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
          businessAccountId,
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
      businessAccountId,
      equipment,
      form,
      payload: entryPayload,
      reportDate: entryReportDate,
      storage,
    });
    const isWritten = writeEquipmentReportEntryPayload({
      businessAccountId,
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
        <div className="equipment-status-grid">
          {equipmentOptions.map((equipment) => {
            const submission = completionMap.get(equipment);
            const isComplete = submission !== undefined;
            const isActive = equipment === selectedEquipment;
            const isInReport = reportEquipmentNames.has(equipment);
            const reportEntryPayload = readEquipmentReportEntryPayload({
              businessAccountId,
              equipment,
              form,
              reportDate,
              storage: readBrowserEquipmentDraftStorage(),
            });
            const draftPayload = readEquipmentDraftPayload({
              businessAccountId,
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
          {isSubmitting ? "Отправка..." : "Отправить отчет начальству"}
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
}: {
  defaultValue?: string;
  field: DispatcherFormField;
  options?: readonly string[];
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
          defaultValue={defaultValue ?? ""}
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
        required={field.required}
        defaultValue={defaultValue ?? readInputDefaultValue(field)}
        onChange={(event) => {
          if (field.type === "number") {
            event.currentTarget.value = normalizeDecimalNumberInput(
              event.currentTarget.value,
            );
          }

          if (field.type === "integer") {
            event.currentTarget.value = normalizeIntegerInput(
              event.currentTarget.value,
            );
          }
        }}
        onBlur={(event) => {
          if (field.type === "number") {
            event.currentTarget.value =
              normalizeDecimalNumberForPayload(event.currentTarget.value) ?? "";
          }

          if (field.type === "integer") {
            event.currentTarget.value =
              normalizeIntegerForPayload(event.currentTarget.value) ?? "";
          }
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
  const selectedGroupFormIds = readDispatcherGroupFormIds(filters.group);
  const selectedGroupSubmissions = submissions.filter((submission) =>
    selectedGroupFormIds.includes(submission.formId),
  );
  const isLocalTestMode =
    dispatcherFeed.status === "ready" && dispatcherFeed.source === "local_test";
  const selectedDateRange = {
    dateFrom: filters.dateFrom.length > 0 ? filters.dateFrom : undefined,
    dateTo: filters.dateTo.length > 0 ? filters.dateTo : undefined,
  };
  const equipmentRows = buildEquipmentSummaryRows(submissions, selectedDateRange);
  const incidentRows = buildIncidentSummaryRows(submissions, selectedDateRange);
  const visitorRows = buildVisitorVisitRows(submissions, selectedDateRange);

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
          <span>Записей в разделе: {selectedGroupSubmissions.length}</span>
          <span>Обновлено: {formatDateTime(dispatcherFeed.receivedAt)}</span>
        </div>
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
      {filters.group === "equipment" ? (
        <EquipmentSummaryTable
          range={selectedDateRange}
          rows={equipmentRows}
          submissions={submissions}
        />
      ) : null}
      {filters.group === "incidents" ? (
        <IncidentSummaryTable rows={incidentRows} />
      ) : null}
      {filters.group === "visitors" ? (
        <VisitorSummaryTable rows={visitorRows} />
      ) : null}
    </section>
  );
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
  onSelectAccountView,
}: {
  profile: ServerUserProfile;
  activeTab: AdminTab;
  onSelectAccountView: (account: AdminAccountSummary) => void;
}) {
  if (activeTab === "database") {
    return <AdminDatabaseWorkspace profile={profile} />;
  }

  if (activeTab === "accounts") {
    return <AdminAccountsWorkspace profile={profile} />;
  }

  return <AdminAccountPreviewWorkspace onSelectAccountView={onSelectAccountView} />;
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
  const [positionsState, setPositionsState] = useState<AdminPositionsResult>({
    status: "error",
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
    : adminAccountPositionOptions.map(buildAdminPreviewAccountForPosition);

  return (
    <section className="admin-workspace" aria-label="Просмотр аккаунта">
      <div className="admin-account-preview-group">
        <h3>Типы аккаунтов</h3>
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
        {accountsState.status === "loading" ? <p>{accountsState.message}</p> : null}
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

function AdminDatabaseWorkspace({ profile }: { profile: ServerUserProfile }) {
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

    setTablesState({
      status: "loading",
      message: "Запрашиваем таблицы БД.",
    });

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

    setRowsState({
      status: "loading",
      message: "Запрашиваем строки таблицы.",
    });
    setEditor(undefined);
    setDeleteCandidate(undefined);
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
    setClearCandidate(undefined);
    setEditor({
      row,
      values: readInitialAdminDatabaseEditorValues(row, selectedTable),
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
      setMutationStatus("Строка БД обновлена.");
      setEditor(undefined);
      setRefreshVersion((version) => version + 1);
      return;
    }

    setMutationStatus(result.message);
  }

  function handleStartDelete(row: AdminDatabaseRow) {
    setMutationStatus("");
    setEditor(undefined);
    setClearCandidate(undefined);
    setDeleteCandidate(row);
  }

  function handleStartClear(table: AdminDatabaseTable) {
    setMutationStatus("");
    setEditor(undefined);
    setDeleteCandidate(undefined);
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
      setMutationStatus("Строка БД удалена.");
      setDeleteCandidate(undefined);
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
      setMutationStatus(`Раздел очищен. Удалено записей: ${result.deleted}.`);
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
        onImported={() => setRefreshVersion((version) => version + 1)}
      />
      <div className="admin-db-layout">
        <div className="admin-db-sidebar" aria-label="Разделы БД">
          {tablesState.status === "loading" ? (
            <p>{tablesState.message}</p>
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
                  Удалить
                </button>
              </div>
            </div>
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

function AdminDispatcherImportPanel({ onImported }: { onImported: () => void }) {
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
    setStatusMessage(
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
          {isPreviewing ? "Проверяем" : "Проверить таблицу"}
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
              {isImporting ? "Переносим" : "Перенести в БД"}
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
  onDelete,
  onClear,
  onNextPage,
  onPreviousPage,
}: {
  rowsState: AdminDatabaseRowsLoadState;
  onEdit: (row: AdminDatabaseRow) => void;
  onDelete: (row: AdminDatabaseRow) => void;
  onClear: (table: AdminDatabaseTable) => void;
  onNextPage: () => void;
  onPreviousPage: () => void;
}) {
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
            {isMutating ? "Очищаем" : "Удалить все записи"}
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
  const editableColumns = table.columns.filter((column) => column.editable);
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
            <span id={editorTitleId}>Редактирование строки</span>
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
              disabled={isMutating || editableColumns.length === 0}
              onClick={onSave}
            >
              Сохранить
            </button>
          </div>
        </div>
        <div className="admin-db-editor-grid">
          {editableColumns.map((column) => {
            const value = editor.values[column.name] ?? "";
            const isNull = editor.values[column.name] === null;
            const inputId = `admin-db-editor-${column.name}`;

            return (
              <div className="admin-db-editor-field" key={column.name}>
                <label htmlFor={inputId}>
                  <span>{column.label}</span>
                </label>
                {isMultilineDatabaseColumn(column) ? (
                  <textarea
                    id={inputId}
                    rows={5}
                    disabled={isNull}
                    value={value}
                    onChange={(event) =>
                      onValueChange(column.name, event.currentTarget.value)
                    }
                  />
                ) : (
                  <input
                    id={inputId}
                    type="text"
                    disabled={isNull}
                    value={value}
                    onChange={(event) =>
                      onValueChange(column.name, event.currentTarget.value)
                    }
                  />
                )}
                {column.nullable ? (
                  <label className="admin-db-null-toggle">
                    <input
                      type="checkbox"
                      checked={isNull}
                      onChange={(event) =>
                        onValueChange(
                          column.name,
                          event.currentTarget.checked ? null : "",
                        )
                      }
                    />
                    <span>NULL</span>
                  </label>
                ) : null}
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
    .filter(({ id }) => id !== "business.dispatcher_form")
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
  business_owner: availableNavigationItemsByBaseCabinet.business_owner.map(({ id }) => id),
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
  "worker",
  "dispatcher",
];

const accountTypeByPosition: Record<AccountPosition, AccountType> = {
  administrator: "admin",
  business_owner: "business_owner",
  board_chair: "business_owner",
  board_member: "business_owner",
  general_director: "business_owner",
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
      : accountType === "business_owner"
        ? { kind: "business", businessAccountId: "admin-preview-business" }
        : {
            kind: "department",
            businessAccountId: "admin-preview-business",
            departmentId: "admin-preview-department",
          },
    businessDisplayName: isAdmin ? null : "Основной бизнес",
    departmentDisplayName:
      accountType === "worker" || accountType === "dispatcher" ? label : null,
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
  const isBusinessOwner = position.accountType === "business_owner";
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
      : isBusinessOwner
        ? { kind: "business", businessAccountId: "admin-preview-business" }
        : {
            kind: "department",
            businessAccountId: "admin-preview-business",
            departmentId: "admin-preview-department",
          },
    businessDisplayName: isAdmin ? null : "Основной бизнес",
    departmentDisplayName: isAdmin || isBusinessOwner ? null : position.displayName,
    capabilities: [...position.capabilities],
    navigationItems: [...position.navigationItems],
    createdAt: position.createdAt,
  };
}

function AdminAccountsWorkspace({ profile }: { profile: ServerUserProfile }) {
  const canManage = canManageUsers(profile);
  const canManageAccess = hasCapability(profile, "platform.manage_access");
  const [accountsState, setAccountsState] = useState<AdminAccountsLoadState>({
    status: "loading",
    message: "Загружаем учётные записи.",
  });
  const [positionsState, setPositionsState] = useState<AdminPositionsResult>({
    status: "error",
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

    setAccountsState({
      status: "loading",
      message: "Загружаем учётные записи.",
    });

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
    setWorkspaceStatus(`Должность «${result.position.displayName}» сохранена.`);
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
    setWorkspaceStatus(`Должность «${position.displayName}» удалена.`);
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
    setWorkspaceStatus(`Учётная запись «${result.account.login}» создана.`);
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
    setWorkspaceStatus(`Пароль для «${submittedLogin}» изменён.`);
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

    setWorkspaceStatus(
      isEnabled
        ? `Доступ для «${account.login}» включён.`
        : `Доступ для «${account.login}» отключён.`,
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
    setWorkspaceStatus(`Учётная запись «${account.login}» удалена.`);
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
        {accountsState.status === "loading" ? <p>{accountsState.message}</p> : null}
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
                  const isToggleDisabled =
                    !canManageAccess || isCurrentAccount || isArchived || isUpdating;
                  const toggleTitle = !canManageAccess
                    ? "Нет права изменять доступ."
                    : isCurrentAccount
                      ? "Нельзя отключить текущую учётную запись."
                      : isArchived
                        ? "Архивную учётную запись нельзя включить."
                        : undefined;

                  return (
                    <tr key={account.accessId}>
                      <td>{account.positionDisplayName}</td>
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
                              ? "Сохраняем…"
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
                              deletingUserId === account.userId
                            }
                            onClick={() => handleDeleteAccount(account)}
                          >
                            {deletingUserId === account.userId ? "Удаляем…" : "Удалить"}
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
                          {deletingPositionId === position.id ? "Удаляем…" : "Удалить"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="dispatcher-status-line">{positionsState.message}</p>}
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
                  {isSubmitting ? "Создаём…" : "Создать"}
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
                <button className="primary-button" type="submit" disabled={isSubmitting}>{isSubmitting ? "Сохраняем…" : "Сохранить"}</button>
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
                    ? "Сохраняем…"
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
        {isResetting ? "Сброс…" : "Сбросить"}
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
  adminProfile: ServerUserProfile,
): ServerUserProfile {
  const scope = account.scope;
  const businessAccountId =
    scope.kind === "business" || scope.kind === "department"
      ? scope.businessAccountId
      : "admin-preview-business";
  const businessAccount = {
    id: businessAccountId,
    displayName: account.businessDisplayName ?? "Основной бизнес",
    status: "active" as const,
  };
  const department =
    scope.kind === "department"
      ? {
          id: scope.departmentId,
          businessAccountId,
          displayName: account.departmentDisplayName ?? account.userDisplayName,
          structureMode: adminProfile.organizationStructureMode,
        }
      : undefined;

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
    businessAccounts: [businessAccount],
    departments: department === undefined ? [] : [department],
    organizationStructureMode: adminProfile.organizationStructureMode,
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
  const entries = Object.entries(row.primaryKey);

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
  table: AdminDatabaseTable | undefined,
) {
  return Object.fromEntries(
    (table?.columns ?? [])
      .filter((column) => column.editable)
      .map((column) => [column.name, row.values[column.name] ?? null]),
  );
}

function isMultilineDatabaseColumn(column: AdminDatabaseColumn) {
  return column.multiline;
}

function getActiveBusinessAccountId(profile: ServerUserProfile) {
  const scope = profile.activeAccess.scope;

  if (scope.kind === "business" || scope.kind === "department") {
    return scope.businessAccountId;
  }

  return profile.businessAccounts[0]?.id ?? "";
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
  if (field.type === "number" || field.type === "integer") {
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
  if (field.type === "number") {
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

  if (field.type === "integer") {
    return integerInputTitle;
  }

  return undefined;
}

function readInputPlaceholder(field: DispatcherFormField) {
  if (field.type === "month") {
    return "2026-06";
  }

  if (field.type === "number" || field.type === "integer") {
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

  if (field.type === "number" || field.type === "integer") {
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
  businessAccountId: string,
  equipmentOptions: readonly string[],
) {
  const storage = readBrowserEquipmentDraftStorage();
  const reportDate = getTodayDateValue();
  const equipment =
    readLastEquipmentOption({
      businessAccountId,
      equipmentOptions,
      storage,
    }) ?? "";
  const reportPayload =
    equipment.length === 0
      ? {}
      : readEquipmentReportEntryPayload({
          businessAccountId,
          equipment,
          form,
          reportDate,
          storage,
        });
  const draftPayload =
    equipment.length === 0
      ? {}
      : readEquipmentDraftPayload({
          businessAccountId,
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

function readOverviewDetailValue(value: string | undefined) {
  const text = value?.trim();

  return text === undefined || text.length === 0 ? "Не указано" : text;
}

function readOptionalFormValue(value: FormDataEntryValue | null) {
  const text = typeof value === "string" ? value.trim() : "";

  return text.length > 0 ? text : undefined;
}
