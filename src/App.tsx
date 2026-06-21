import { useEffect, useState, type FormEvent } from "react";
import type {
  AccountCapability,
  AccountType,
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
  submitDispatcherSubmission,
  type DispatcherFeedResult,
  type DispatcherFormsResult,
} from "./services/dispatcherSubmissions";
import {
  decimalNumberInputPattern,
  decimalNumberInputTitle,
  normalizeDecimalNumberForPayload,
  normalizeDecimalNumberInput,
} from "./services/dispatcherFormInput";

type OwnerTab = "overview" | "dispatcher";

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

type DispatcherFeedFilterState = {
  formId: DispatcherFormId | "";
  dateFrom: string;
  dateTo: string;
};

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
  formId: "",
  dateFrom: "",
  dateTo: "",
};

const monthDisplayInputPattern = "(0[1-9]|1[0-2])\\.[0-9]{4}";
const monthDisplayInputTitle = "Введите месяц в формате ММ.ГГГГ, например 06.2026.";

function buildNavigationItems(
  accountType: AccountType,
  ownerTab: OwnerTab,
): NavigationItem[] {
  const navigationItems = navigationItemsByAccountType[accountType];

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
  const [dispatcherFeed, setDispatcherFeed] = useState<DispatcherFeedLoadState>(
    initialDispatcherFeedState,
  );
  const [dispatcherForms, setDispatcherForms] =
    useState<DispatcherFormsLoadState>(initialDispatcherFormsState);
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

    const { formId, dateFrom, dateTo } = dispatcherFeedFilters;
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
        formId: formId === "" ? undefined : formId,
        dateFrom: dateFrom.length > 0 ? dateFrom : undefined,
        dateTo: dateTo.length > 0 ? dateTo : undefined,
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
    dispatcherFeedFilters.dateFrom,
    dispatcherFeedFilters.dateTo,
    dispatcherFeedFilters.formId,
  ]);

  useEffect(() => {
    if (
      accessProfile.status !== "ready" ||
      (!hasCapability(accessProfile.profile, "business.submit_dispatcher_forms") &&
        !hasCapability(accessProfile.profile, "business.submit_forms") &&
        !hasCapability(accessProfile.profile, "business.view_dispatcher_feed"))
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

  async function handleDataEntrySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (accessProfile.status !== "ready") {
      setDataEntryStatus("Нельзя отправить данные без серверного профиля доступа.");
      return;
    }

    if (
      !hasCapability(accessProfile.profile, "business.submit_dispatcher_forms") &&
      !hasCapability(accessProfile.profile, "business.submit_forms")
    ) {
      setDataEntryStatus("Серверный профиль не разрешает отправку формы.");
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const businessAccountId = getActiveBusinessAccountId(accessProfile.profile);
    const formId = String(formData.get("formId") ?? "");
    const formDefinition =
      dispatcherForms.status === "ready"
        ? dispatcherForms.forms.find((item) => item.id === formId)
        : undefined;

    if (dispatcherForms.status !== "ready") {
      setDataEntryStatus("Список диспетчерских форм ещё не получен от сервера.");
      return;
    }

    if (formDefinition === undefined) {
      setDataEntryStatus("Выбранная форма не найдена в серверном списке.");
      return;
    }

    setIsDataEntrySubmitting(true);
    setDataEntryStatus("Отправляем данные на удалённый сервер.");

    const result = await submitDispatcherSubmission(
      {
        businessAccountId,
        formId: formDefinition.id,
        payload: readDispatcherSubmissionPayload(formData, formDefinition),
      },
      {
        localFallback: true,
      },
    );

    setIsDataEntrySubmitting(false);

    if (result.status === "ready") {
      setDataEntryStatus(readSubmissionSuccessMessage(result));
      resetDispatcherForm(form, formDefinition.id);
      return;
    }

    setDataEntryStatus(result.message);
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
      />

      <section className="workspace" aria-label="Рабочая область">
        <RoleWorkspace
          profile={profile}
          dataEntryStatus={dataEntryStatus}
          isDataEntrySubmitting={isDataEntrySubmitting}
          onDataEntrySubmit={handleDataEntrySubmit}
          ownerTab={ownerTab}
          dispatcherFeed={dispatcherFeed}
          dispatcherForms={dispatcherForms}
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
}: {
  profile: ServerUserProfile;
  onClearSession: () => void;
  isSessionLoading: boolean;
  sessionError?: string;
  ownerTab: OwnerTab;
  onOwnerTabChange: (tab: OwnerTab) => void;
}) {
  const navigationItems = buildNavigationItems(profile.accountType, ownerTab);

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

          return (
            <button
              className={`nav-item nav-item-${item.state}`}
              type="button"
              aria-current={item.state === "active" ? "page" : undefined}
              disabled={ownerTarget === undefined}
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
  dispatcherFeed,
  dispatcherForms,
  dispatcherFeedFilters,
  onDispatcherFeedFiltersChange,
  onDataEntryStatusReset,
}: {
  profile: ServerUserProfile;
  dataEntryStatus: string;
  isDataEntrySubmitting: boolean;
  onDataEntrySubmit: (event: FormEvent<HTMLFormElement>) => void;
  ownerTab: OwnerTab;
  dispatcherFeed: DispatcherFeedLoadState;
  dispatcherForms: DispatcherFormsLoadState;
  dispatcherFeedFilters: DispatcherFeedFilterState;
  onDispatcherFeedFiltersChange: (
    patch: Partial<DispatcherFeedFilterState>,
  ) => void;
  onDataEntryStatusReset: () => void;
}) {
  switch (profile.accountType) {
    case "admin":
      return <AdminWorkspace profile={profile} />;
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
      return (
        <DataEntryWorkspace
          ariaLabel="Отправка данных"
          status={dataEntryStatus}
          isSubmitting={isDataEntrySubmitting}
          onSubmit={onDataEntrySubmit}
          dispatcherForms={dispatcherForms}
          onResetStatus={onDataEntryStatusReset}
        />
      );
    case "dispatcher":
      return (
        <DataEntryWorkspace
          ariaLabel="Диспетчерская отправка"
          status={dataEntryStatus}
          isSubmitting={isDataEntrySubmitting}
          onSubmit={onDataEntrySubmit}
          dispatcherForms={dispatcherForms}
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

function DataEntryWorkspace({
  ariaLabel,
  status,
  isSubmitting,
  onSubmit,
  dispatcherForms,
  onResetStatus,
}: {
  ariaLabel: string;
  status: string;
  isSubmitting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  dispatcherForms: DispatcherFormsLoadState;
  onResetStatus: () => void;
}) {
  const forms = dispatcherForms.status === "ready" ? dispatcherForms.forms : [];
  const [selectedFormId, setSelectedFormId] = useState("");
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
      setSelectedFormId("");
    }
  }, [forms, selectedFormId]);

  if (dispatcherForms.status !== "ready" || forms.length === 0) {
    return (
      <section className="data-entry-surface" aria-label={ariaLabel}>
        <p className="form-status">{formsStatusMessage}</p>
      </section>
    );
  }

  if (currentForm === undefined) {
    return (
      <section className="data-entry-surface" aria-label={ariaLabel}>
        {isLocalTestMode ? (
          <p className="form-status form-status-local">{localTestModeMessage}</p>
        ) : null}
        <div className="dispatcher-form-choice" aria-label="Выбор формы">
          {forms.map((form) => (
            <button
              className="dispatcher-form-choice-button"
              type="button"
              key={form.id}
              onClick={() => {
                onResetStatus();
                setSelectedFormId(form.id);
              }}
            >
              <span>{form.title}</span>
            </button>
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
            onClick={() => {
              onResetStatus();
              setSelectedFormId("");
            }}
          >
            К выбору формы
          </button>
        </div>
        <div className="dispatcher-form-fields">
          {currentForm.fields.map((field) => (
            <DispatcherFormFieldInput field={field} key={field.name} />
          ))}
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
      </form>
    </section>
  );
}

function DispatcherFormFieldInput({ field }: { field: DispatcherFormField }) {
  if (field.type === "textarea") {
    return (
      <label>
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
        }}
        onBlur={(event) => {
          if (field.type === "number") {
            event.currentTarget.value =
              normalizeDecimalNumberForPayload(event.currentTarget.value) ?? "";
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
  const forms = dispatcherForms.status === "ready" ? dispatcherForms.forms : [];
  const summary =
    dispatcherFeed.status === "ready" ? dispatcherFeed.summary : undefined;
  const hasDateFilters =
    filters.dateFrom.length > 0 || filters.dateTo.length > 0;
  const isLocalTestMode =
    dispatcherFeed.status === "ready" && dispatcherFeed.source === "local_test";

  return (
    <section className="dispatcher-live-column" aria-label="Диспетчерская">
      <div className="dispatcher-feed-controls">
        <label>
          <span>Форма</span>
          <select
            value={filters.formId}
            onChange={(event) =>
              onFiltersChange({
                formId: event.currentTarget.value as DispatcherFormId | "",
              })
            }
            disabled={forms.length === 0}
          >
            <option value="">Все формы</option>
            {forms.map((form) => (
              <option value={form.id} key={form.id}>
                {form.title}
              </option>
            ))}
          </select>
        </label>
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
        <button
          className="secondary-button dispatcher-clear-dates-button"
          type="button"
          disabled={!hasDateFilters}
          onClick={() => onFiltersChange({ dateFrom: "", dateTo: "" })}
        >
          Очистить даты
        </button>
      </div>
      {summary === undefined ? null : (
        <div className="dispatcher-summary-strip" aria-label="Сводка регистраций">
          <span>Всего: {summary.total}</span>
          {summary.byForm.map((item) => (
            <span key={item.formId}>
              {item.formTitle}: {item.count}
            </span>
          ))}
        </div>
      )}
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
      {submissions.length > 0 ? (
        <div className="dispatcher-feed-table" role="table">
          <div className="dispatcher-feed-row dispatcher-feed-head" role="row">
            <span role="columnheader">Время</span>
            <span role="columnheader">Форма</span>
            <span role="columnheader">Регистрация</span>
            <span role="columnheader">Данные</span>
            <span role="columnheader">Статус</span>
          </div>
          {submissions.map((submission) => (
            <DispatcherFeedRow
              submission={submission}
              forms={forms}
              key={submission.id}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function DispatcherFeedRow({
  submission,
  forms,
}: {
  submission: DispatcherSubmission;
  forms: DispatcherFormDefinition[];
}) {
  return (
    <div className="dispatcher-feed-row" role="row">
      <span role="cell">{formatDateTime(submission.receivedAt)}</span>
      <span role="cell">{submission.formTitle}</span>
      <span role="cell">{submission.summary}</span>
      <span role="cell">{formatDispatcherPayload(submission, forms)}</span>
      <span role="cell">{submission.status}</span>
    </div>
  );
}

function AdminWorkspace({ profile }: { profile: ServerUserProfile }) {
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

function hasCapability(
  profile: ServerUserProfile,
  capability: AccountCapability,
) {
  return profile.activeAccess.capabilities.includes(capability);
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

function readInputType(field: DispatcherFormField) {
  if (field.type === "number") {
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

  if (field.type === "month") {
    return "numeric";
  }

  return undefined;
}

function readInputPattern(field: DispatcherFormField) {
  if (field.type === "number") {
    return decimalNumberInputPattern;
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

  return undefined;
}

function readInputPlaceholder(field: DispatcherFormField) {
  if (field.type === "month") {
    return "2026-06";
  }

  if (field.type === "number") {
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

  if (field.type === "number") {
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

function readOptionalFormValue(value: FormDataEntryValue | null) {
  const text = typeof value === "string" ? value.trim() : "";

  return text.length > 0 ? text : undefined;
}
