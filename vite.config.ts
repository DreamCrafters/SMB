import { defineConfig, type Connect, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import type {
  AccountType,
  DevAccessOption,
  ServerUserProfile,
} from "./src/contracts";
import { localDevAccessOptions } from "./src/services/localDevAccess";
import { getNextMoscowDispatcherLogoutAt } from "./src/services/dispatcherSessionExpiry";

type MiddlewareRequest = Parameters<Connect.NextHandleFunction>[0];
type MiddlewareResponse = Parameters<Connect.NextHandleFunction>[1];
type NodeLikeMiddlewareRequest = MiddlewareRequest & {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  setEncoding: (encoding: string) => void;
  on: (
    eventName: "data" | "end" | "error",
    listener: (chunk?: string) => void,
  ) => void;
  destroy?: () => void;
};

type DevSession = {
  option: DevAccessOption;
  createdAt: string;
};

const DEV_SESSION_COOKIE = "smb_dev_access_session";
const DEV_SESSION_HEADER = "x-smb-dev-session";
const DEV_BUSINESS_ID = "dev-business-boundary";
const DEV_DEPARTMENT_ID = "dev-department-boundary";

function accessProfileApi(): Plugin {
  const sessions = new Map<string, DevSession>();

  const handleAccessProfile: Connect.NextHandleFunction = (req, res) => {
    const method = getRequestMethod(req);

    if (method !== "GET") {
      sendJson(res, 405, {
        error: {
          code: "access_denied",
          message: "Only GET is supported for access/profile.",
        },
      });
      return;
    }

    const sessionId = readDevSessionId(req);
    let session = sessionId === undefined ? undefined : sessions.get(sessionId);

    if (
      session !== undefined &&
      session.option.accountType === "dispatcher" &&
      getNextMoscowDispatcherLogoutAt(new Date(session.createdAt)).getTime() <=
        Date.now()
    ) {
      if (sessionId !== undefined) {
        sessions.delete(sessionId);
      }
      session = undefined;
    }

    if (session === undefined) {
      sendJson(res, 200, { profile: null });
      return;
    }

    sendJson(res, 200, {
      profile: buildDevProfile(session.option, session.createdAt),
    });
  };

  const handleDevSession: Connect.NextHandleFunction = (req, res) => {
    void handleDevSessionRequest(req, res, sessions);
  };

  return {
    name: "smb-access-profile-api",
    configureServer(server) {
      server.middlewares.use("/api/access/profile", handleAccessProfile);
      server.middlewares.use("/api/dev/access-session", handleDevSession);
    },
    configurePreviewServer(server) {
      server.middlewares.use("/api/access/profile", handleAccessProfile);
      server.middlewares.use("/api/dev/access-session", handleDevSession);
    },
  };
}

async function handleDevSessionRequest(
  req: MiddlewareRequest,
  res: MiddlewareResponse,
  sessions: Map<string, DevSession>,
) {
  const method = getRequestMethod(req);

  if (method === "GET") {
    sendJson(res, 200, { options: localDevAccessOptions });
    return;
  }

  if (method === "DELETE") {
    const sessionId = readDevSessionId(req);

    if (sessionId !== undefined) {
      sessions.delete(sessionId);
    }

    res.setHeader(
      "set-cookie",
      `${DEV_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
    );
    sendJson(res, 200, { ok: true });
    return;
  }

  if (method !== "POST") {
    sendJson(res, 405, {
      error: {
        code: "access_denied",
        message: "Only GET, POST and DELETE are supported for dev access session.",
      },
    });
    return;
  }

  const payload = await readJsonBody(req);

  const option = isRecord(payload) && typeof payload.position === "string"
    ? localDevAccessOptions.find((item) => item.position === payload.position)
    : isRecord(payload) && isAccountType(payload.accountType)
      ? localDevAccessOptions.find((item) => item.accountType === payload.accountType)
      : undefined;

  if (option === undefined) {
    sendJson(res, 400, {
      error: {
        code: "access_denied",
        message: "Unsupported dev account type.",
      },
    });
    return;
  }

  const sessionId = createSessionId(option.accountType);

  sessions.set(sessionId, {
    option,
    createdAt: new Date().toISOString(),
  });

  res.setHeader(
    "set-cookie",
    `${DEV_SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Lax`,
  );
  sendJson(res, 200, { ok: true, sessionId });
}

function buildDevProfile(
  option: DevAccessOption,
  issuedAt: string,
): ServerUserProfile {
  const { accountType } = option;
  const receivedAt = new Date().toISOString();
  const capabilities = option.capabilities;

  if (accountType === "admin") {
    return {
      userId: "dev-user-admin",
      displayName: "Dev administrator",
      accountType,
      activeAccess: {
        accountId: "dev-access-admin",
        accountType,
        position: option.position,
        positionDisplayName: option.positionDisplayName,
        displayName: "Dev admin access",
        scope: {
          kind: "platform",
        },
        capabilities,
        navigationItems: [...option.navigationItems],
        issuedAt,
      },
      businessAccounts: [
        {
          id: DEV_BUSINESS_ID,
          displayName: "Server business boundary",
          status: "active",
        },
      ],
      departments: [
        {
          id: DEV_DEPARTMENT_ID,
          businessAccountId: DEV_BUSINESS_ID,
          displayName: "Server department boundary",
          structureMode: "current",
        },
      ],
      organizationStructureMode: "current",
      receivedAt,
    };
  }

  if (accountType === "business_owner") {
    return {
      userId: "dev-user-owner",
      displayName: "Dev business owner",
      accountType,
      activeAccess: {
        accountId: "dev-access-owner",
        accountType,
        position: option.position,
        positionDisplayName: option.positionDisplayName,
        displayName: "Dev business owner access",
        scope: {
          kind: "business",
          businessAccountId: DEV_BUSINESS_ID,
        },
        capabilities,
        navigationItems: [...option.navigationItems],
        issuedAt,
      },
      businessAccounts: [
        {
          id: DEV_BUSINESS_ID,
          displayName: "Server business boundary",
          status: "active",
        },
      ],
      departments: [],
      organizationStructureMode: "current",
      receivedAt,
    };
  }

  if (accountType === "dispatcher") {
    const expiresAt = getNextMoscowDispatcherLogoutAt(
      new Date(issuedAt),
    ).toISOString();

    return {
      userId: "dev-user-dispatcher",
      displayName: "Dev dispatcher",
      accountType,
      activeAccess: {
        accountId: "dev-access-dispatcher",
        accountType,
        position: option.position,
        positionDisplayName: option.positionDisplayName,
        displayName: "Dev dispatcher access",
        scope: {
          kind: "department",
          businessAccountId: DEV_BUSINESS_ID,
          departmentId: DEV_DEPARTMENT_ID,
        },
        capabilities,
        navigationItems: [...option.navigationItems],
        issuedAt,
        expiresAt,
      },
      businessAccounts: [
        {
          id: DEV_BUSINESS_ID,
          displayName: "Server business boundary",
          status: "active",
        },
      ],
      departments: [
        {
          id: DEV_DEPARTMENT_ID,
          businessAccountId: DEV_BUSINESS_ID,
          displayName: "Server department boundary",
          structureMode: "current",
        },
      ],
      organizationStructureMode: "current",
      receivedAt,
    };
  }

  return {
    userId: "dev-user-worker",
    displayName: "Dev worker",
    accountType,
    activeAccess: {
      accountId: "dev-access-worker",
      accountType,
      position: option.position,
      positionDisplayName: option.positionDisplayName,
      displayName: "Dev worker access",
      scope: {
        kind: "department",
        businessAccountId: DEV_BUSINESS_ID,
        departmentId: DEV_DEPARTMENT_ID,
      },
      capabilities,
      navigationItems: [...option.navigationItems],
      issuedAt,
    },
    businessAccounts: [
      {
        id: DEV_BUSINESS_ID,
        displayName: "Server business boundary",
        status: "active",
      },
    ],
    departments: [
      {
        id: DEV_DEPARTMENT_ID,
        businessAccountId: DEV_BUSINESS_ID,
        displayName: "Server department boundary",
        structureMode: "current",
      },
    ],
    organizationStructureMode: "current",
    receivedAt,
  };
}

function sendJson(
  res: MiddlewareResponse,
  statusCode: number,
  payload: unknown,
) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
}

function readJsonBody(req: MiddlewareRequest): Promise<unknown> {
  return new Promise((resolve) => {
    const nodeReq = req as NodeLikeMiddlewareRequest;
    let body = "";

    nodeReq.setEncoding("utf8");
    nodeReq.on("data", (chunk) => {
      body += chunk ?? "";

      if (body.length > 10_000) {
        resolve(null);
        nodeReq.destroy?.();
      }
    });
    nodeReq.on("end", () => {
      if (body.length === 0) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        resolve(null);
      }
    });
    nodeReq.on("error", () => {
      resolve(null);
    });
  });
}

function getRequestMethod(req: MiddlewareRequest) {
  return (req as NodeLikeMiddlewareRequest).method;
}

function getCookieHeader(req: MiddlewareRequest) {
  return (req as NodeLikeMiddlewareRequest).headers?.cookie;
}

function readDevSessionId(req: MiddlewareRequest) {
  return (
    readHeader(req, DEV_SESSION_HEADER) ??
    readCookie(getCookieHeader(req), DEV_SESSION_COOKIE)
  );
}

function readHeader(req: MiddlewareRequest, name: string) {
  const header = (req as NodeLikeMiddlewareRequest).headers?.[name];
  const value = Array.isArray(header) ? header[0] : header;
  const trimmed = value?.trim();

  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function readCookie(header: string | undefined, name: string) {
  if (header === undefined) {
    return undefined;
  }

  return header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function createSessionId(accountType: AccountType) {
  return [
    accountType,
    Date.now().toString(36),
    Math.random().toString(36).slice(2),
  ].join(".");
}

function isAccountType(value: unknown): value is AccountType {
  return (
    value === "admin" ||
    value === "business_owner" ||
    value === "worker" ||
    value === "dispatcher"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export default defineConfig({
  plugins: [accessProfileApi(), react()],
});
