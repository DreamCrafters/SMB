import { useEffect, useRef, useState, type FormEvent } from "react";
import type {
  AccountCapability,
  AccountType,
  AdminDatabaseCellValue,
  AdminDatabaseColumn,
  AdminDatabaseRow,
  AdminDatabaseTable,
  DispatcherFormDefinition,
  DispatcherFormField,
  DispatcherFormId,
  DispatcherSubmission,
  DispatcherSubmissionPayload,
  ServerUserProfile,
} from "./contracts";
import {
  accountTypeLabels,
  authOptions,
  navigationItemsByAccountType,
  shellCopy,
  type NavigationItem,
} from "./content";
import {
  clearDevAccessSession,
  selectDevAccessSession,
  type DevAccessSessionResult,
} from "./services/devAccessSession";
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
  canSubmitDispatcherForms,
  hasCapability,
} from "./services/accessGuards";
import {
  deleteAdminDatabaseRow,
  requestAdminDatabaseRows,
  requestAdminDatabaseTables,
  updateAdminDatabaseRow,
  type AdminDatabaseRowsResult,
  type AdminDatabaseTablesResult,
} from "./services/adminDatabase";
import {
  buildEquipmentSummaryRows,
  buildIncidentSummaryRows,
  buildOpenIncidentOptions,
  buildOpenVisitorOptions,
  buildVisitorVisitRows,
  readDispatcherGroupFormIds,
  type DispatcherFeedGroup,
} from "./services/dispatcherFeedViews";

type OwnerTab = "overview" | "dispatcher";
type AdminTab = "account_preview" | "database";
type AdminPreviewAdminTab = "capabilities" | "database";

type DataEntrySubmitStateControls = {
  setStatus: (message: string) => void;
  setIsSubmitting: (isSubmitting: boolean) => void;
};

type DataEntrySubmitHandler = (
  event: FormEvent<HTMLFormElement>,
  actingProfile?: ServerUserProfile,
  controls?: DataEntrySubmitStateControls,
) => void;

type SessionRequestState =
  | {
      status: "idle";
    }
  | {
      status: "loading";
      accountType?: AccountType;
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

type DispatcherFeedFilterState = {
  group: DispatcherFeedGroup;
  dateFrom: string;
  dateTo: string;
  visitorDate: string;
};

type DispatcherFormChoiceGroupId = "equipment" | "incidents" | "visitors";

type DispatcherFormChoiceGroup = {
  id: DispatcherFormChoiceGroupId;
  title: string;
  description: string;
  forms: DispatcherFormDefinition[];
};

type FormLeaveGuard = (continueAfterDiscard: () => void) => boolean;

const initialAccessProfileState: AccessProfileLoadState = {
  status: "loading",
  message: "Запрашиваем серверный профиль доступа.",
};

const initialSessionRequestState: SessionRequestState = {
  status: "idle",
};

const initialDispatcherFeedState: DispatcherFeedLoadState = {
  status: "loading",
  message: "Ожидаем профиль владельца для запроса диспетчерской истории.",
};

const initialDispatcherFormsState: DispatcherFormsLoadState = {
  status: "loading",
  message: "Ожидаем профиль доступа для запроса диспетчерских форм.",
};

const initialDispatcherFeedFilters: DispatcherFeedFilterState = {
  group: "equipment",
  dateFrom: "",
  dateTo: "",
  visitorDate: getTodayDateValue(),
};

const monthDisplayInputPattern = "(0[1-9]|1[0-2])\\.[0-9]{4}";
const monthDisplayInputTitle = "Введите месяц в формате ММ.ГГГГ, например 06.2026.";

function buildNavigationItems(
  accountType: AccountType,
  ownerTab: OwnerTab,
  adminTab: AdminTab,
): NavigationItem[] {
  const navigationItems = navigationItemsByAccountType[accountType];

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

  if (accountType !== "business_owner") {
    return navigationItems;
  }

  return navigationItems
    .filter((item) => getOwnerTabForNavigationItem(item) !== undefined)
    .map((item) => {
      const target = getOwnerTabForNavigationItem(item);

      return {
        ...item,
        state: target === ownerTab ? "active" : "pending",
      };
    });
}

function getOwnerTabForNavigationItem(item: NavigationItem): OwnerTab | undefined {
  switch (item.label) {
    case "Обзор":
      return "overview";
    case "Диспетчерская":
      return "dispatcher";
    default:
      return undefined;
  }
}

function getAdminTabForNavigationItem(item: NavigationItem): AdminTab | undefined {
  switch (item.label) {
    case "Просмотр аккаунта":
      return "account_preview";
    case "БД":
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
  const [ownerTab, setOwnerTab] = useState<OwnerTab>("overview");
  const [adminTab, setAdminTab] = useState<AdminTab>("account_preview");
  const [dispatcherFeed, setDispatcherFeed] = useState<DispatcherFeedLoadState>(
    initialDispatcherFeedState,
  );
  const [dispatcherForms, setDispatcherForms] =
    useState<DispatcherFormsLoadState>(initialDispatcherFormsState);
  const [dispatcherSubmissionVersion, setDispatcherSubmissionVersion] = useState(0);
  const [dispatcherFeedFilters, setDispatcherFeedFilters] =
    useState<DispatcherFeedFilterState>(initialDispatcherFeedFilters);

  useEffect(() => {
    const controller = new AbortController();

    setAccessProfile({
      status: "loading",
      message: "Запрашиваем серверный профиль доступа.",
    });

    requestAccessProfile({
      localDevFallback: true,
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
              message: "Запрашиваем диспетчерскую историю с удалённого сервера.",
            },
      );

      requestDispatcherFeed({
        signal: currentController.signal,
        localFallback: true,
        limit: 500,
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
      message: "Запрашиваем диспетчерские формы с удалённого сервера.",
    });

    requestDispatcherForms({
      localFallback: true,
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

  async function handleSelectAccount(accountType: AccountType) {
    setSessionRequest({
      status: "loading",
      accountType,
    });

    const result = await selectDevAccessSession(accountType, {
      localDevFallback: true,
    });
    handleSessionResult(result);
  }

  async function handleClearSession() {
    setSessionRequest({
      status: "loading",
    });

    const result = await clearDevAccessSession({
      localDevFallback: true,
    });
    handleSessionResult(result);
  }

  function handleSessionResult(result: DevAccessSessionResult) {
    if (result.status === "ready") {
      setSessionRequest(initialSessionRequestState);
      setRequestVersion((version) => version + 1);
      return;
    }

    setSessionRequest({
      status: "error",
      message: result.message,
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

  async function handleDataEntrySubmit(
    event: FormEvent<HTMLFormElement>,
    actingProfile?: ServerUserProfile,
    controls: DataEntrySubmitStateControls = {
      setStatus: setDataEntryStatus,
      setIsSubmitting: setIsDataEntrySubmitting,
    },
  ) {
    event.preventDefault();

    const submitProfile =
      actingProfile ??
      (accessProfile.status === "ready" ? accessProfile.profile : undefined);

    if (submitProfile === undefined) {
      controls.setStatus("Нельзя отправить данные без серверного профиля доступа.");
      return;
    }

    if (
      !canSubmitDispatcherForms(submitProfile)
    ) {
      controls.setStatus(
        "Серверный профиль не разрешает отправку диспетчерской формы.",
      );
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
      controls.setStatus("Список диспетчерских форм ещё не получен от сервера.");
      return;
    }

    if (formDefinition === undefined) {
      controls.setStatus("Выбранная форма не найдена в серверном списке.");
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
      controls.setStatus("Сохраняем дневной отчёт оборудования.");

      const result = await submitDispatcherEquipmentReport(
        {
          businessAccountId,
          items: equipmentReportPayloads,
        },
        {
          localFallback: true,
        },
      );

      controls.setIsSubmitting(false);

      if (result.status === "ready") {
        controls.setStatus(readEquipmentReportSuccessMessage(result));
        setDispatcherSubmissionVersion((version) => version + 1);
        return;
      }

      controls.setStatus(result.message);
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
    controls.setStatus("Отправляем данные на удалённый сервер.");

    const result = await submitDispatcherSubmission(
      {
        businessAccountId,
        formId: formDefinition.id,
        payload,
      },
      {
        localFallback: true,
      },
    );

    controls.setIsSubmitting(false);

    if (result.status === "ready") {
      controls.setStatus(readSubmissionSuccessMessage(result));
      setDispatcherSubmissionVersion((version) => version + 1);
      resetDispatcherForm(form, formDefinition.id);

      return;
    }

    controls.setStatus(result.message);
  }

  if (accessProfile.status !== "ready") {
    return (
      <AuthScreen
        accessProfile={accessProfile}
        sessionRequest={sessionRequest}
        onRetry={handleRetryProfile}
        onSelectAccount={handleSelectAccount}
      />
    );
  }

  const profile = accessProfile.profile;

  return (
    <main className="ops-shell">
      <SideRail
        profile={profile}
        onClearSession={handleClearSession}
        isSessionLoading={sessionRequest.status === "loading"}
        sessionError={
          sessionRequest.status === "error" ? sessionRequest.message : undefined
        }
        ownerTab={ownerTab}
        onOwnerTabChange={setOwnerTab}
        adminTab={adminTab}
        onAdminTabChange={setAdminTab}
      />

      <section className="workspace" aria-label="Рабочая область">
        <RoleWorkspace
          profile={profile}
          dataEntryStatus={dataEntryStatus}
          isDataEntrySubmitting={isDataEntrySubmitting}
          onDataEntrySubmit={handleDataEntrySubmit}
          ownerTab={ownerTab}
          adminTab={adminTab}
          dispatcherFeed={dispatcherFeed}
          dispatcherForms={dispatcherForms}
          dispatcherSubmissionVersion={dispatcherSubmissionVersion}
          dispatcherFeedFilters={dispatcherFeedFilters}
          onDispatcherFeedFiltersChange={handleDispatcherFeedFiltersChange}
          onDataEntryStatusReset={() => setDataEntryStatus("")}
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
}: {
  accessProfile: AccessProfileLoadState;
  sessionRequest: SessionRequestState;
  onRetry: () => void;
  onSelectAccount: (accountType: AccountType) => void;
}) {
  const isBusy =
    accessProfile.status === "loading" || sessionRequest.status === "loading";
  const statusMessage =
    sessionRequest.status === "error"
      ? sessionRequest.message
      : accessProfile.status === "loading"
        ? shellCopy.authLoading
        : accessProfile.status === "error"
          ? accessProfile.message
          : "Выберите тип аккаунта для dev-сессии.";

  return (
    <main className="auth-shell">
      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="brand-mark" aria-hidden="true">
          SM
        </div>
        <div className="auth-copy">
          <p className="eyebrow">access boundary</p>
          <h1 id="auth-title">{shellCopy.authTitle}</h1>
          <p>{shellCopy.authLead}</p>
        </div>

        <div className="auth-options" aria-label="Выбор типа аккаунта">
          {authOptions.map((option) => {
            const isSelecting =
              sessionRequest.status === "loading" &&
              sessionRequest.accountType === option.accountType;

            return (
              <button
                className={`auth-option auth-option-${option.accountType}`}
                type="button"
                disabled={isBusy}
                key={option.accountType}
                onClick={() => onSelectAccount(option.accountType)}
              >
                <span>{option.scope}</span>
                <strong>{option.label}</strong>
                <small>
                  {isSelecting ? "Создаём server session..." : option.description}
                </small>
              </button>
            );
          })}
        </div>

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
  onClearSession,
  isSessionLoading,
  sessionError,
  ownerTab,
  onOwnerTabChange,
  adminTab,
  onAdminTabChange,
}: {
  profile: ServerUserProfile;
  onClearSession: () => void;
  isSessionLoading: boolean;
  sessionError?: string;
  ownerTab: OwnerTab;
  onOwnerTabChange: (tab: OwnerTab) => void;
  adminTab: AdminTab;
  onAdminTabChange: (tab: AdminTab) => void;
}) {
  const navigationItems = buildNavigationItems(
    profile.accountType,
    ownerTab,
    adminTab,
  );

  return (
    <aside className="side-rail" aria-label="Основная навигация">
      <div className="brand-mark" aria-hidden="true">
        SM
      </div>
      <div>
        <p className="eyebrow">платформа</p>
        <h1>{shellCopy.productName}</h1>
      </div>
      <nav className="primary-nav">
        {navigationItems.map((item) => {
          const ownerTarget =
            profile.accountType === "business_owner"
              ? getOwnerTabForNavigationItem(item)
              : undefined;
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
        <strong>{accountTypeLabels[profile.accountType]}</strong>
        <button
          className="rail-logout-button"
          type="button"
          disabled={isSessionLoading}
          onClick={onClearSession}
        >
          {isSessionLoading ? "Выходим..." : "Выйти из аккаунта"}
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
}: {
  profile: ServerUserProfile;
  dataEntryStatus: string;
  isDataEntrySubmitting: boolean;
  onDataEntrySubmit: DataEntrySubmitHandler;
  ownerTab: OwnerTab;
  adminTab: AdminTab;
  dispatcherFeed: DispatcherFeedLoadState;
  dispatcherForms: DispatcherFormsLoadState;
  dispatcherSubmissionVersion: number;
  dispatcherFeedFilters: DispatcherFeedFilterState;
  onDispatcherFeedFiltersChange: (
    patch: Partial<DispatcherFeedFilterState>,
  ) => void;
  onDataEntryStatusReset: () => void;
}) {
  switch (profile.accountType) {
    case "admin":
      return (
        <AdminWorkspace
          profile={profile}
          activeTab={adminTab}
          dispatcherFeed={dispatcherFeed}
          dispatcherForms={dispatcherForms}
          dispatcherFeedFilters={dispatcherFeedFilters}
          dispatcherSubmissionVersion={dispatcherSubmissionVersion}
          onDataEntrySubmit={onDataEntrySubmit}
          onDispatcherFeedFiltersChange={onDispatcherFeedFiltersChange}
        />
      );
    case "business_owner":
      return (
        <OwnerWorkspace
          activeTab={ownerTab}
          dispatcherFeed={dispatcherFeed}
          dispatcherForms={dispatcherForms}
          dispatcherFeedFilters={dispatcherFeedFilters}
          onDispatcherFeedFiltersChange={onDispatcherFeedFiltersChange}
        />
      );
    case "worker":
      return <WorkerWorkspace />;
    case "dispatcher":
      return (
        <DataEntryWorkspace
          ariaLabel="Диспетчерская отправка"
          status={dataEntryStatus}
          isSubmitting={isDataEntrySubmitting}
          onSubmit={onDataEntrySubmit}
          dispatcherForms={dispatcherForms}
          businessAccountId={getActiveBusinessAccountId(profile)}
          refreshVersion={dispatcherSubmissionVersion}
          onResetStatus={onDataEntryStatusReset}
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
  activeTab: OwnerTab;
  dispatcherFeed: DispatcherFeedLoadState;
  dispatcherForms: DispatcherFormsLoadState;
  dispatcherFeedFilters: DispatcherFeedFilterState;
  onDispatcherFeedFiltersChange: (
    patch: Partial<DispatcherFeedFilterState>,
  ) => void;
}) {
  if (activeTab === "overview") {
    return <section className="owner-empty-view" aria-label="Обзор" />;
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
  refreshVersion,
  onResetStatus,
}: {
  ariaLabel: string;
  status: string;
  isSubmitting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  dispatcherForms: DispatcherFormsLoadState;
  businessAccountId: string;
  refreshVersion: number;
  onResetStatus: () => void;
}) {
  const forms = dispatcherForms.status === "ready" ? dispatcherForms.forms : [];
  const [selectedFormId, setSelectedFormId] = useState("");
  const formLeaveGuardRef = useRef<FormLeaveGuard | undefined>(undefined);
  const currentForm = forms.find((form) => form.id === selectedFormId);
  const isLocalTestMode =
    dispatcherForms.status === "ready" && dispatcherForms.source === "local_test";
  const formsStatusMessage =
    dispatcherForms.status === "ready"
      ? "Сервер не вернул диспетчерские формы."
      : dispatcherForms.message;
  const localTestModeMessage =
    "Локальный тестовый режим: сервер не найден, формы и отправки сохраняются в этом браузере.";

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
    };

    if (
      formLeaveGuardRef.current !== undefined &&
      !formLeaveGuardRef.current(continueSelection)
    ) {
      return;
    }

    continueSelection();
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
      <form className="data-entry-form" onSubmit={onSubmit}>
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
                (field) => (
                  <DispatcherFormFieldInput field={field} key={field.name} />
                ),
              )}
            </div>
            <div className="form-actions">
              <button
                className="primary-button"
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Отправка..." : "Отправить на сервер"}
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
    message: "Запрашиваем незакрытые инциденты.",
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
              message: "Запрашиваем незакрытые инциденты.",
            },
      );

      requestDispatcherFeed({
        limit: 500,
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
        <p className="form-status">{incidentFeed.message}</p>
      ) : null}
      {isLocalIncidentFeed ? (
        <p className="form-status form-status-local">
          Список незакрытых инцидентов читается из локального тестового
          хранилища.
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
    message: "Запрашиваем посетителей без отметки выхода.",
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
              message: "Запрашиваем посетителей без отметки выхода.",
            },
      );

      requestDispatcherFeed({
        limit: 500,
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
        <p className="form-status">{visitorFeed.message}</p>
      ) : null}
      {isLocalVisitorFeed ? (
        <p className="form-status form-status-local">
          Список открытых посетителей читается из локального тестового хранилища.
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
  const [equipmentUnsavedPrompt, setEquipmentUnsavedPrompt] = useState<
    | {
        equipment: string;
        onDiscard: () => void;
      }
    | undefined
  >(undefined);
  const [equipmentFeed, setEquipmentFeed] = useState<DispatcherFeedLoadState>({
    status: "loading",
    message: "Запрашиваем отметки оборудования.",
  });
  const selectedEquipment = payload.equipment ?? "";
  const reportDate = payload.reportDate ?? getTodayDateValue();
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
          storage: readBrowserEquipmentDraftStorage(),
        });
  const isSelectedEquipmentDirty =
    selectedEquipment.length > 0 &&
    isEquipmentReportEntryDirty({
      currentPayload: payload,
      form,
      reportPayload: selectedReportPayload,
    });
  const addEquipmentEntryButtonLabel = isSelectedEquipmentDirty
    ? "Обновить данные"
    : "Внести данные";

  useEffect(() => {
    setPayload(
      buildInitialEquipmentFormPayload(form, businessAccountId, equipmentOptions),
    );
    setReportDraftVersion((version) => version + 1);
    setEquipmentLocalStatus("");
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

    function loadEquipmentFeed() {
      currentController?.abort();
      currentController = new AbortController();

      setEquipmentFeed((current) =>
        current.status === "ready"
          ? current
          : {
              status: "loading",
              message: "Запрашиваем отметки оборудования.",
            },
      );

      requestDispatcherFeed({
        formId: "equipment",
        limit: 500,
        localFallback: true,
        signal: currentController.signal,
      }).then((result) => {
        if (isActive) {
          setEquipmentFeed(result);
        }
      });
    }

    loadEquipmentFeed();
    const intervalId = window.setInterval(loadEquipmentFeed, 10_000);

    return () => {
      isActive = false;
      currentController?.abort();
      window.clearInterval(intervalId);
    };
  }, [refreshVersion]);

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

    setEquipmentUnsavedPrompt({
      equipment: dirtyEquipment,
      onDiscard: () => {
        rollbackEquipmentEntryDraft(dirtyEquipment, storage);
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
        todayDate: currentPayload.reportDate ?? getTodayDateValue(),
        storage,
      });
    });
    setEquipmentLocalStatus("");
    setEquipmentUnsavedPrompt(undefined);
    onResetStatus();
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
          storage: readBrowserEquipmentDraftStorage(),
        });
      }

      return nextPayload;
    });

    onResetStatus();
  }

  function readEquipmentPayloadForSelection({
    equipment,
    storage,
    todayDate,
  }: {
    equipment: string;
    storage: DispatcherEquipmentDraftStorage | undefined;
    todayDate: string;
  }) {
    const reportPayload =
      equipment.length === 0
        ? {}
        : readEquipmentReportEntryPayload({
            businessAccountId,
            equipment,
            form,
            storage,
          });
    const draftPayload =
      equipment.length === 0
        ? {}
        : readEquipmentDraftPayload({
            businessAccountId,
            equipment,
            form,
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
      todayDate,
    });
  }

  function rollbackEquipmentEntryDraft(
    equipment: string,
    storage: DispatcherEquipmentDraftStorage | undefined,
  ) {
    if (equipment.length === 0) {
      return;
    }

    const reportPayload = readEquipmentReportEntryPayload({
      businessAccountId,
      equipment,
      form,
      storage,
    });

    if (!hasEquipmentReportData(reportPayload)) {
      return;
    }

    writeEquipmentDraftPayload({
      businessAccountId,
      equipment,
      form,
      payload: reportPayload,
      storage,
    });
    setReportDraftVersion((version) => version + 1);
  }

  function saveEquipmentEntry(entryPayload: DispatcherSubmissionPayload) {
    const equipment = entryPayload.equipment ?? "";

    if (equipment.length === 0) {
      setEquipmentLocalStatus("Выберите оборудование.");
      onResetStatus();
      return false;
    }

    if (!hasEquipmentReportData(entryPayload)) {
      setEquipmentLocalStatus("Заполните данные по выбранному оборудованию.");
      onResetStatus();
      return false;
    }

    const validationMessage = validateDispatcherPayloadForSubmit(
      form,
      entryPayload,
    );

    if (validationMessage !== undefined) {
      setEquipmentLocalStatus(validationMessage);
      onResetStatus();
      return false;
    }

    const storage = readBrowserEquipmentDraftStorage();
    const hadReportEntry = hasEquipmentReportData(
      readEquipmentReportEntryPayload({
        businessAccountId,
        equipment,
        form,
        storage,
      }),
    );

    writeEquipmentDraftPayload({
      businessAccountId,
      equipment,
      form,
      payload: entryPayload,
      storage,
    });
    const isWritten = writeEquipmentReportEntryPayload({
      businessAccountId,
      equipment,
      form,
      payload: entryPayload,
      storage,
    });

    setEquipmentLocalStatus(
      isWritten
        ? `Данные для ${equipment} ${
            hadReportEntry ? "обновлены" : "внесены"
          } в дневном отчёте.`
        : "Не удалось сохранить данные в браузере.",
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
      <div className="equipment-progress-panel" aria-label="Отметки оборудования">
        <div className="equipment-progress-header">
          <strong>
            Внесено в отчёт за {formatReportDateForDisplay(reportDate)}:{" "}
            {reportPayloads.length}/{equipmentOptions.length}
          </strong>
          <span>
            Сохранено на сервере: {doneCount}/{equipmentOptions.length}
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
              storage: readBrowserEquipmentDraftStorage(),
            });
            const draftPayload = readEquipmentDraftPayload({
              businessAccountId,
              equipment,
              form,
              storage: readBrowserEquipmentDraftStorage(),
            });
            const hasDraft = hasEquipmentReportData(draftPayload);
            const isDirty =
              isInReport &&
              isEquipmentReportEntryDirty({
                currentPayload: isActive ? payload : draftPayload,
                form,
                reportPayload: reportEntryPayload,
              });

            return (
              <button
                className={[
                  "equipment-status-button",
                  isInReport && !isComplete ? "is-in-report" : "",
                  isComplete ? "is-complete" : "",
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
                      : `в отчёте, на сервере ${formatDateTime(submission.receivedAt)}`
                    : submission !== undefined
                      ? `на сервере ${formatDateTime(submission.receivedAt)}`
                      : hasDraft
                        ? "черновик"
                        : "нет данных"}
                </small>
              </button>
            );
          })}
        </div>
        {equipmentFeed.status === "error" ? (
          <p className="form-status">{equipmentFeed.message}</p>
        ) : null}
        {isLocalEquipmentFeed ? (
          <p className="form-status form-status-local">
            Отметки оборудования читаются из локального тестового хранилища.
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
        {readDispatcherFieldsByVisualSize(form.fields).map((field) => (
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
              ? "Отправить дневной отчёт оборудования"
              : `Осталось внести позиций: ${missingReportEquipmentCount}`
          }
        >
          {isSubmitting ? "Отправка..." : "Отправить"}
        </button>
        {status.length > 0 || equipmentLocalStatus.length > 0 ? (
          <p className="form-status">
            {status.length > 0 ? status : equipmentLocalStatus}
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

function DispatcherFormFieldInput({ field }: { field: DispatcherFormField }) {
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
        <select name={field.name} required={field.required} defaultValue="">
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
        defaultValue={readInputDefaultValue(field)}
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
  const hasDateFilters =
    filters.group === "visitors"
      ? filters.visitorDate.length > 0
      : filters.dateFrom.length > 0 || filters.dateTo.length > 0;
  const isLocalTestMode =
    dispatcherFeed.status === "ready" && dispatcherFeed.source === "local_test";
  const equipmentRows = buildEquipmentSummaryRows(submissions, {
    dateFrom: filters.dateFrom.length > 0 ? filters.dateFrom : undefined,
    dateTo: filters.dateTo.length > 0 ? filters.dateTo : undefined,
  });
  const incidentRows = buildIncidentSummaryRows(submissions, {
    dateFrom: filters.dateFrom.length > 0 ? filters.dateFrom : undefined,
    dateTo: filters.dateTo.length > 0 ? filters.dateTo : undefined,
  });
  const visitorRows = buildVisitorVisitRows(submissions, filters.visitorDate);

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
        {filters.group === "visitors" ? (
          <label>
            <span>День</span>
            <input
              type="date"
              value={filters.visitorDate}
              onChange={(event) =>
                onFiltersChange({ visitorDate: event.currentTarget.value })
              }
            />
          </label>
        ) : (
          <>
            <label>
              <span>С даты</span>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(event) =>
                  onFiltersChange({ dateFrom: event.currentTarget.value })
                }
              />
            </label>
            <label>
              <span>По дату</span>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(event) =>
                  onFiltersChange({ dateTo: event.currentTarget.value })
                }
              />
            </label>
          </>
        )}
        <button
          className="secondary-button dispatcher-clear-dates-button"
          type="button"
          disabled={!hasDateFilters}
          onClick={() =>
            filters.group === "visitors"
              ? onFiltersChange({ visitorDate: getTodayDateValue() })
              : onFiltersChange({ dateFrom: "", dateTo: "" })
          }
        >
          {filters.group === "visitors" ? "Сегодня" : "Очистить даты"}
        </button>
      </div>
      {dispatcherFeed.status === "ready" ? (
        <div className="dispatcher-summary-strip" aria-label="Сводка регистраций">
          <span>Записей в разделе: {selectedGroupSubmissions.length}</span>
          <span>Обновлено: {formatDateTime(dispatcherFeed.receivedAt)}</span>
        </div>
      ) : null}
      {dispatcherForms.status === "error" ? (
        <p className="dispatcher-status-line">{dispatcherForms.message}</p>
      ) : null}
      {isLocalTestMode ? (
        <p className="dispatcher-status-line dispatcher-status-line-local">
          Локальный тестовый режим: история читается из localStorage этого
          браузера.
        </p>
      ) : null}
      {dispatcherFeed.status === "error" ? (
        <p className="dispatcher-status-line">{dispatcherFeed.message}</p>
      ) : null}
      {filters.group === "equipment" ? (
        <EquipmentSummaryTable rows={equipmentRows} />
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

function EquipmentSummaryTable({ rows }: { rows: ReturnType<typeof buildEquipmentSummaryRows> }) {
  if (rows.length === 0) {
    return <p className="dispatcher-status-line">Нет данных по оборудованию.</p>;
  }

  return (
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
          <span role="cell">{row.equipment}</span>
          <span role="cell">{formatNumber(row.productionTons)} т</span>
          <span role="cell">{formatNumber(row.downtimeHours)} ч</span>
          <span role="cell">
            {row.downtimeReasons.length === 0
              ? "Нет отмеченных причин"
              : row.downtimeReasons
                  .map((item) => `${item.reason}: ${formatNumber(item.hours)} ч`)
                  .join(" · ")}
          </span>
        </div>
      ))}
    </div>
  );
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
  dispatcherFeed,
  dispatcherForms,
  dispatcherFeedFilters,
  dispatcherSubmissionVersion,
  onDataEntrySubmit,
  onDispatcherFeedFiltersChange,
}: {
  profile: ServerUserProfile;
  activeTab: AdminTab;
  dispatcherFeed: DispatcherFeedLoadState;
  dispatcherForms: DispatcherFormsLoadState;
  dispatcherFeedFilters: DispatcherFeedFilterState;
  dispatcherSubmissionVersion: number;
  onDataEntrySubmit: DataEntrySubmitHandler;
  onDispatcherFeedFiltersChange: (
    patch: Partial<DispatcherFeedFilterState>,
  ) => void;
}) {
  if (activeTab === "database") {
    return <AdminDatabaseWorkspace profile={profile} />;
  }

  return (
    <AdminAccountPreviewWorkspace
      profile={profile}
      dispatcherFeed={dispatcherFeed}
      dispatcherForms={dispatcherForms}
      dispatcherFeedFilters={dispatcherFeedFilters}
      dispatcherSubmissionVersion={dispatcherSubmissionVersion}
      onDataEntrySubmit={onDataEntrySubmit}
      onDispatcherFeedFiltersChange={onDispatcherFeedFiltersChange}
    />
  );
}

function AdminAccountPreviewWorkspace({
  profile,
  dispatcherFeed,
  dispatcherForms,
  dispatcherFeedFilters,
  dispatcherSubmissionVersion,
  onDataEntrySubmit,
  onDispatcherFeedFiltersChange,
}: {
  profile: ServerUserProfile;
  dispatcherFeed: DispatcherFeedLoadState;
  dispatcherForms: DispatcherFormsLoadState;
  dispatcherFeedFilters: DispatcherFeedFilterState;
  dispatcherSubmissionVersion: number;
  onDataEntrySubmit: DataEntrySubmitHandler;
  onDispatcherFeedFiltersChange: (
    patch: Partial<DispatcherFeedFilterState>,
  ) => void;
}) {
  const [previewAccountType, setPreviewAccountType] =
    useState<AccountType>("business_owner");
  const [previewStatus, setPreviewStatus] = useState("");
  const [isPreviewSubmitting, setIsPreviewSubmitting] = useState(false);
  const [previewOwnerTab, setPreviewOwnerTab] = useState<OwnerTab>("overview");
  const [previewAdminTab, setPreviewAdminTab] =
    useState<AdminPreviewAdminTab>("capabilities");
  const [previewDispatcherFeedFilters, setPreviewDispatcherFeedFilters] =
    useState<DispatcherFeedFilterState>(initialDispatcherFeedFilters);
  const previewProfile = buildAdminPreviewProfile(previewAccountType, profile);

  useEffect(() => {
    setPreviewStatus("");
    setIsPreviewSubmitting(false);
    setPreviewOwnerTab("overview");
    setPreviewAdminTab("capabilities");
  }, [previewAccountType]);

  function handlePreviewDispatcherFeedFiltersChange(
    patch: Partial<DispatcherFeedFilterState>,
  ) {
    setPreviewDispatcherFeedFilters((current) => ({
      ...current,
      ...patch,
    }));
  }

  return (
    <section className="admin-workspace" aria-label="Просмотр аккаунта">
      <div className="admin-account-switcher" aria-label="Тип аккаунта">
        {authOptions.map((option) => (
          <button
            className={`admin-account-button ${
              previewAccountType === option.accountType ? "is-active" : ""
            }`}
            type="button"
            aria-pressed={previewAccountType === option.accountType}
            key={option.accountType}
            onClick={() => setPreviewAccountType(option.accountType)}
          >
            <span>{option.label}</span>
            <small>{option.scope}</small>
          </button>
        ))}
      </div>

      <div className="admin-preview-header">
        <span>{accountTypeLabels[previewProfile.accountType]}</span>
        <strong>{previewProfile.activeAccess.displayName}</strong>
      </div>

      <AdminAccountPreviewNavigation
        profile={previewProfile}
        ownerTab={previewOwnerTab}
        adminTab={previewAdminTab}
        onOwnerTabChange={setPreviewOwnerTab}
        onAdminTabChange={setPreviewAdminTab}
      />

      <div className="admin-preview-shell">
        <AdminPreviewRoleWorkspace
          profile={previewProfile}
          dispatcherFeed={dispatcherFeed}
          dispatcherForms={dispatcherForms}
          dispatcherFeedFilters={
            previewProfile.accountType === "business_owner"
              ? previewDispatcherFeedFilters
              : dispatcherFeedFilters
          }
          dispatcherSubmissionVersion={dispatcherSubmissionVersion}
          ownerTab={previewOwnerTab}
          adminTab={previewAdminTab}
          previewStatus={previewStatus}
          isPreviewSubmitting={isPreviewSubmitting}
          onPreviewSubmit={(event) =>
            onDataEntrySubmit(event, previewProfile, {
              setStatus: setPreviewStatus,
              setIsSubmitting: setIsPreviewSubmitting,
            })
          }
          onDispatcherFeedFiltersChange={
            previewProfile.accountType === "business_owner"
              ? handlePreviewDispatcherFeedFiltersChange
              : onDispatcherFeedFiltersChange
          }
          onPreviewStatusReset={() => setPreviewStatus("")}
        />
      </div>
    </section>
  );
}

function AdminPreviewRoleWorkspace({
  profile,
  dispatcherFeed,
  dispatcherForms,
  dispatcherFeedFilters,
  dispatcherSubmissionVersion,
  ownerTab,
  adminTab,
  previewStatus,
  isPreviewSubmitting,
  onPreviewSubmit,
  onDispatcherFeedFiltersChange,
  onPreviewStatusReset,
}: {
  profile: ServerUserProfile;
  dispatcherFeed: DispatcherFeedLoadState;
  dispatcherForms: DispatcherFormsLoadState;
  dispatcherFeedFilters: DispatcherFeedFilterState;
  dispatcherSubmissionVersion: number;
  ownerTab: OwnerTab;
  adminTab: AdminPreviewAdminTab;
  previewStatus: string;
  isPreviewSubmitting: boolean;
  onPreviewSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onDispatcherFeedFiltersChange: (
    patch: Partial<DispatcherFeedFilterState>,
  ) => void;
  onPreviewStatusReset: () => void;
}) {
  switch (profile.accountType) {
    case "admin":
      return adminTab === "database" ? (
        <AdminDatabaseWorkspace profile={profile} />
      ) : (
        <AdminCapabilitiesTable profile={profile} />
      );
    case "business_owner":
      return (
        <OwnerWorkspace
          activeTab={ownerTab}
          dispatcherFeed={dispatcherFeed}
          dispatcherForms={dispatcherForms}
          dispatcherFeedFilters={dispatcherFeedFilters}
          onDispatcherFeedFiltersChange={onDispatcherFeedFiltersChange}
        />
      );
    case "worker":
      return <WorkerWorkspace />;
    case "dispatcher":
      return (
        <DataEntryWorkspace
          ariaLabel="Диспетчерская отправка"
          status={previewStatus}
          isSubmitting={isPreviewSubmitting}
          onSubmit={onPreviewSubmit}
          dispatcherForms={dispatcherForms}
          businessAccountId={getActiveBusinessAccountId(profile)}
          refreshVersion={dispatcherSubmissionVersion}
          onResetStatus={onPreviewStatusReset}
        />
      );
  }
}

function AdminAccountPreviewNavigation({
  profile,
  ownerTab,
  adminTab,
  onOwnerTabChange,
  onAdminTabChange,
}: {
  profile: ServerUserProfile;
  ownerTab: OwnerTab;
  adminTab: AdminPreviewAdminTab;
  onOwnerTabChange: (tab: OwnerTab) => void;
  onAdminTabChange: (tab: AdminPreviewAdminTab) => void;
}) {
  if (profile.accountType === "admin") {
    return (
      <nav className="admin-preview-role-nav" aria-label="Функции аккаунта">
        {[
          {
            label: "Права",
            description: "Server capabilities",
            target: "capabilities" as const,
          },
          {
            label: "БД",
            description: "Таблицы и строки сервера",
            target: "database" as const,
          },
        ].map((item) => (
          <button
            className={`admin-preview-role-nav-button ${
              adminTab === item.target ? "is-active" : ""
            }`}
            type="button"
            aria-pressed={adminTab === item.target}
            key={item.target}
            onClick={() => onAdminTabChange(item.target)}
          >
            <span>{item.label}</span>
            <small>{item.description}</small>
          </button>
        ))}
      </nav>
    );
  }

  const navigationItems = buildNavigationItems(
    profile.accountType,
    ownerTab,
    "account_preview",
  );

  return (
    <nav className="admin-preview-role-nav" aria-label="Функции аккаунта">
      {navigationItems.map((item) => {
        const ownerTarget =
          profile.accountType === "business_owner"
            ? getOwnerTabForNavigationItem(item)
            : undefined;

        return (
          <button
            className={`admin-preview-role-nav-button ${
              item.state === "active" ? "is-active" : ""
            }`}
            type="button"
            aria-pressed={item.state === "active"}
            disabled={profile.accountType === "business_owner" && ownerTarget === undefined}
            key={item.label}
            onClick={() => {
              if (ownerTarget !== undefined) {
                onOwnerTabChange(ownerTarget);
              }
            }}
          >
            <span>{item.label}</span>
            <small>{item.description}</small>
          </button>
        );
      })}
    </nav>
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
  }, [canManageDatabase]);

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
    setEditor({
      row,
      values: {
        ...row.values,
      },
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
    setDeleteCandidate(row);
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
      <div className="admin-db-layout">
        <aside className="admin-db-sidebar" aria-label="Таблицы БД">
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
              <span>{table.name}</span>
              <small>{formatTableRowCount(table.rowCount)}</small>
            </button>
          ))}
        </aside>

        <div className="admin-db-main">
          <AdminDatabaseRowsTable
            rowsState={rowsState}
            onEdit={handleStartEdit}
            onDelete={handleStartDelete}
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
            <AdminDatabaseEditor
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
              <span>Удалить строку {formatPrimaryKey(deleteCandidate)}?</span>
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

          {mutationStatus.length > 0 ? (
            <p className="dispatcher-status-line">{mutationStatus}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function AdminDatabaseRowsTable({
  rowsState,
  onEdit,
  onDelete,
  onNextPage,
  onPreviousPage,
}: {
  rowsState: AdminDatabaseRowsLoadState;
  onEdit: (row: AdminDatabaseRow) => void;
  onDelete: (row: AdminDatabaseRow) => void;
  onNextPage: () => void;
  onPreviousPage: () => void;
}) {
  if (rowsState.status !== "ready") {
    return <p className="dispatcher-status-line">{rowsState.message}</p>;
  }

  if (rowsState.rows.length === 0) {
    return (
      <div className="admin-db-meta">
        <span>{rowsState.table.name}</span>
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

  return (
    <>
      <div className="admin-db-meta">
        <span>{rowsState.table.name}</span>
        <strong>{formatRowsPage(rowsState)}</strong>
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
      <div className="admin-db-table-scroll">
        <table className="admin-db-data-table">
          <thead>
            <tr>
              {rowsState.table.columns.map((column) => (
                <th scope="col" key={column.name}>
                  {column.name}
                </th>
              ))}
              <th scope="col">Действия</th>
            </tr>
          </thead>
          <tbody>
            {rowsState.rows.map((row) => (
              <tr key={formatPrimaryKey(row)}>
                {rowsState.table.columns.map((column) => (
                  <td title={row.values[column.name] ?? "NULL"} key={column.name}>
                    {formatDatabaseCellValue(row.values[column.name])}
                  </td>
                ))}
                <td>
                  <div className="admin-db-actions">
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={rowsState.table.primaryKey.length === 0}
                      onClick={() => onEdit(row)}
                    >
                      Править
                    </button>
                    <button
                      className="secondary-button secondary-button-danger"
                      type="button"
                      disabled={rowsState.table.primaryKey.length === 0}
                      onClick={() => onDelete(row)}
                    >
                      Удалить
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function AdminDatabaseEditor({
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
  const editableColumns = table.columns.filter((column) => !column.primaryKey);

  return (
    <section className="admin-db-editor" aria-label="Редактирование строки">
      <div className="admin-db-editor-header">
        <span>Строка {formatPrimaryKey(editor.row)}</span>
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

          return (
            <label className="admin-db-editor-field" key={column.name}>
              <span>
                {column.name}
                <small>{column.columnType}</small>
              </span>
              {isMultilineDatabaseColumn(column) ? (
                <textarea
                  rows={4}
                  disabled={isNull}
                  value={value}
                  onChange={(event) =>
                    onValueChange(column.name, event.currentTarget.value)
                  }
                />
              ) : (
                <input
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
            </label>
          );
        })}
      </div>
    </section>
  );
}

function AdminCapabilitiesTable({ profile }: { profile: ServerUserProfile }) {
  return (
    <section className="admin-data-table" aria-label="Серверные права">
      {profile.activeAccess.capabilities.map((capability) => (
        <div className="admin-data-row" key={capability}>
          <span>{capability}</span>
        </div>
      ))}
    </section>
  );
}

const adminPreviewCapabilitiesByType: Record<AccountType, AccountCapability[]> = {
  admin: [
    "platform.manage_business_accounts",
    "platform.manage_users",
    "platform.manage_access",
    "platform.manage_analytics_database",
    "platform.manage_integrations",
    "platform.view_audit",
    "platform.view_logs",
    "platform.use_debug_tools",
    "business.view_all_statistics",
    "business.view_department_statistics",
    "business.view_notifications",
    "business.submit_forms",
    "business.submit_dispatcher_forms",
    "business.view_dispatcher_feed",
    "business.view_own_submissions",
  ],
  business_owner: [
    "business.view_all_statistics",
    "business.view_department_statistics",
    "business.view_notifications",
    "business.view_dispatcher_feed",
  ],
  worker: [
    "business.submit_forms",
    "business.view_notifications",
    "business.view_own_submissions",
  ],
  dispatcher: ["business.submit_dispatcher_forms"],
};

function buildAdminPreviewProfile(
  accountType: AccountType,
  adminProfile: ServerUserProfile,
): ServerUserProfile {
  if (accountType === "admin") {
    return adminProfile;
  }

  const businessAccount =
    adminProfile.businessAccounts[0] ?? {
      id: "admin-preview-business",
      displayName: "Admin preview business",
      status: "active" as const,
    };
  const department =
    adminProfile.departments.find(
      (item) => item.businessAccountId === businessAccount.id,
    ) ?? {
      id: "admin-preview-department",
      businessAccountId: businessAccount.id,
      displayName: "Admin preview department",
      structureMode: adminProfile.organizationStructureMode,
    };
  const scope =
    accountType === "business_owner"
      ? {
          kind: "business" as const,
          businessAccountId: businessAccount.id,
        }
      : {
          kind: "department" as const,
          businessAccountId: businessAccount.id,
          departmentId: department.id,
        };

  return {
    userId: `admin-preview-${accountType}`,
    displayName: accountTypeLabels[accountType],
    accountType,
    activeAccess: {
      accountId: `admin-preview-access-${accountType}`,
      accountType,
      displayName: `${accountTypeLabels[accountType]} preview`,
      scope,
      capabilities: [...adminPreviewCapabilitiesByType[accountType]],
      issuedAt: adminProfile.activeAccess.issuedAt,
    },
    businessAccounts: [businessAccount],
    departments: accountType === "business_owner" ? [] : [department],
    organizationStructureMode: adminProfile.organizationStructureMode,
    receivedAt: adminProfile.receivedAt,
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

function formatDatabaseCellValue(value: AdminDatabaseCellValue | undefined) {
  if (value === null || value === undefined) {
    return "NULL";
  }

  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length === 0) {
    return "";
  }

  return normalized.length > 140
    ? `${normalized.slice(0, 137)}...`
    : normalized;
}

function isMultilineDatabaseColumn(column: AdminDatabaseColumn) {
  return (
    column.dataType === "json" ||
    column.dataType.endsWith("text") ||
    column.columnType.length > 80
  );
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
    return `Сервер не найден. Отправка ${result.submission.id} сохранена локально для тестов в этом браузере.`;
  }

  return `Сервер принял отправку ${result.submission.id}. История обновится у владельца через remote feed.`;
}

function readEquipmentReportSuccessMessage(result: {
  submissions: DispatcherSubmission[];
  reportStatus: "created" | "updated";
  source?: "remote" | "local_test";
}) {
  const prefix =
    result.reportStatus === "updated"
      ? "Отчёт оборудования изменён"
      : "Отчёт оборудования записан";
  const suffix = `${result.submissions.length} позиций.`;

  if (result.source === "local_test") {
    return `Сервер не найден. ${prefix}: ${suffix} Записи сохранены локально для тестов в этом браузере.`;
  }

  return `${prefix}: ${suffix} История обновится у владельца через remote feed.`;
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
          storage,
        });
  const draftPayload =
    equipment.length === 0
      ? {}
      : readEquipmentDraftPayload({
          businessAccountId,
          equipment,
          form,
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
    todayDate: getTodayDateValue(),
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

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 2,
  }).format(value);
}

function readOptionalFormValue(value: FormDataEntryValue | null) {
  const text = typeof value === "string" ? value.trim() : "";

  return text.length > 0 ? text : undefined;
}
