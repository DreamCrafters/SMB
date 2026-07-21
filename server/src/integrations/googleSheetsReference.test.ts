import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import {
  buildGoogleSheetsCsvUrl,
  createGoogleSheetsReferenceDataSource,
  readGoogleSheetsWorkbook,
  readColumnOptionsFromCsv,
  readMaxNotificationRecipientsFromCsv,
  readNotificationRecipientsFromCsv,
} from "./googleSheetsReference.js";

test("google sheets workbook reader requests exact public tab names", async () => {
  const requestedUrls: string[] = [];
  const workbook = await readGoogleSheetsWorkbook(
    {
      url: "https://docs.google.com/spreadsheets/d/reference-sheet/edit",
      responsibleColumn: "Ответственный",
      locationColumn: "Место",
      notificationEmailColumns: [],
      maxUserIdColumns: [],
      visitorNotificationEmailColumns: [],
      visitorMaxUserIdColumns: [],
      cacheTtlMs: 0,
      authMode: "public_csv",
    },
    "https://docs.google.com/spreadsheets/d/import-sheet-id/edit",
    ["Оборудование", "Инциденты", "Посетители"],
    async (input) => {
      requestedUrls.push(input.toString());
      return new Response("Заголовок\nЗначение", { status: 200 });
    },
  );

  assert.equal(workbook.spreadsheetId, "import-sheet-id");
  assert.deepEqual(Object.keys(workbook.rowsBySheet), [
    "Оборудование",
    "Инциденты",
    "Посетители",
  ]);
  assert.ok(requestedUrls[0]?.includes("sheet=%D0%9E%D0%B1%D0%BE%D1%80%D1%83%D0%B4%D0%BE%D0%B2%D0%B0%D0%BD%D0%B8%D0%B5"));
  assert.ok(requestedUrls[1]?.includes("sheet=%D0%98%D0%BD%D1%86%D0%B8%D0%B4%D0%B5%D0%BD%D1%82%D1%8B"));
  assert.ok(requestedUrls[2]?.includes("sheet=%D0%9F%D0%BE%D1%81%D0%B5%D1%82%D0%B8%D1%82%D0%B5%D0%BB%D0%B8"));
});

test("buildGoogleSheetsCsvUrl converts regular sheet links to csv export links", () => {
  assert.equal(
    buildGoogleSheetsCsvUrl(
      "https://docs.google.com/spreadsheets/d/sheet-id/edit?gid=981703922#gid=981703922",
    ),
    "https://docs.google.com/spreadsheets/d/sheet-id/export?format=csv&gid=981703922",
  );
});

test("readColumnOptionsFromCsv reads responsible options under the requested header", () => {
  const csv = [
    "Другая таблица,,Ответственный за регистрацию:",
    "Значение,,Иван Иванов",
    ",,Пётр Петров",
    ",,",
    "Ответственный за регистрацию,,",
    "Мария Сидорова,,",
  ].join("\n");

  assert.deepEqual(
    readColumnOptionsFromCsv(csv, "Ответственный за регистрацию"),
    ["Иван Иванов", "Пётр Петров", "Мария Сидорова"],
  );
});

test("readColumnOptionsFromCsv reads location options from a separate column", () => {
  const csv = [
    "Места (цех/участок),,Ответственный за регистрацию:",
    "Цех №1,,Иван Иванов",
    "Участок №2,,Пётр Петров",
    ",,",
  ].join("\n");

  assert.deepEqual(readColumnOptionsFromCsv(csv, "Места (цех/участок)"), [
    "Цех №1",
    "Участок №2",
  ]);
});

test("readNotificationRecipientsFromCsv reads email recipients by fixed sheet rows", () => {
  const rows = Array.from({ length: 30 }, () => ["", ""]);

  rows[0] = [
    "Адресаты по инцидентам и оборуджованию (емейлы)",
    "Адресаты по посетителям (емейлы)",
  ];
  rows[1] = ["common@example.com", "visitor@example.com"];
  rows[19] = ["common-last@example.com", "visitor-last@example.com"];
  rows[20] = ["outside@example.com", "visitor-outside@example.com"];
  rows[21] = ["mechanic@example.com", ""];
  rows[24] = ["mechanic-last@example.com; common@example.com", ""];
  rows[26] = ["electric@example.com", ""];
  rows[29] = ["electric-last@example.com", ""];

  assert.deepEqual(
    readNotificationRecipientsFromCsv(
      rows.map((row) => row.join(",")).join("\n"),
      [
        "Адресаты по инцидентам и оборуджованию (емейлы)",
        "Адресаты по инцидентам и оборудованию (емейлы)",
      ],
      ["Адресаты по посетителям (емейлы)"],
    ),
    {
      incidentAndEquipment: ["common@example.com", "common-last@example.com"],
      mechanicalDowntime: [
        "mechanic@example.com",
        "mechanic-last@example.com",
        "common@example.com",
      ],
      electricalDowntime: ["electric@example.com", "electric-last@example.com"],
      visitors: ["visitor@example.com", "visitor-last@example.com"],
    },
  );
});

test("readNotificationRecipientsFromCsv accepts corrected equipment header spelling", () => {
  const csv = [
    "Адресаты по инцидентам и оборудованию (емейлы)",
    "common@example.com",
  ].join("\n");

  assert.deepEqual(
    readNotificationRecipientsFromCsv(csv, [
      "Адресаты по инцидентам и оборуджованию (емейлы)",
      "Адресаты по инцидентам и оборудованию (емейлы)",
    ]).incidentAndEquipment,
    ["common@example.com"],
  );
});

test("readMaxNotificationRecipientsFromCsv reads user ids by fixed sheet rows", () => {
  const rows = Array.from({ length: 30 }, () => ["", ""]);

  rows[0] = ["Чаты пользователей", "Адресаты по посетителям (МАКС)"];
  rows[1] = ["1001", "4001"];
  rows[19] = ["1002", "4002 visitor_extra_chat_42"];
  rows[20] = ["9999", "4999"];
  rows[21] = ["-2001", ""];
  rows[24] = [
    "2002; 1001 f9LHodD0cOJwrdHG4d5xGHHA_YApMSDjZqdl9XWi254KXj5l7FpPTzckMHPiYpT44QhdBAiL3gX5vPW90RIX",
    "",
  ];
  rows[26] = ["3001", ""];
  rows[29] = ["3002 | el_extra_chat_42", ""];

  assert.deepEqual(
    readMaxNotificationRecipientsFromCsv(
      rows.map((row) => row.join(",")).join("\n"),
      [
        "Чаты пользователей",
        "ТОКЕН МАКС и Чаты пользователей",
      ],
      ["Адресаты по посетителям (МАКС)"],
    ),
    {
      incidentAndEquipment: ["1001", "1002"],
      mechanicalDowntime: [
        "-2001",
        "2002",
        "1001",
        "f9LHodD0cOJwrdHG4d5xGHHA_YApMSDjZqdl9XWi254KXj5l7FpPTzckMHPiYpT44QhdBAiL3gX5vPW90RIX",
      ],
      electricalDowntime: ["3001", "3002", "el_extra_chat_42"],
      visitors: ["4001", "4002", "visitor_extra_chat_42"],
    },
  );
});

test("readMaxNotificationRecipientsFromCsv accepts combined MAX table header", () => {
  const csv = [
    "ТОКЕН МАКС и Чаты пользователей",
    "1001",
  ].join("\n");

  assert.deepEqual(
    readMaxNotificationRecipientsFromCsv(csv, [
      "Чаты пользователей",
      "ТОКЕН МАКС и Чаты пользователей",
    ]).incidentAndEquipment,
    ["1001"],
  );
});

test("google sheets reference source exposes OC and dispatcher recipients from rows 2-20", async () => {
  const rows = Array.from({ length: 21 }, () => ["", "", "", ""]);

  rows[0] = [
    "Адресаты ОЦ (емейлы)",
    "Адресаты ОЦ (МАКС)",
    "Адресаты Диспетчеры (емейлы)",
    "Адресаты Диспетчеры (МАКС)",
  ];
  rows[1] = [
    "oc@example.com",
    "5001; oc_chat_2",
    "dispatcher@example.com",
    "6001; dispatcher_chat_2",
  ];
  rows[19] = [
    "oc-last@example.com; OC@example.com",
    "5002",
    "dispatcher-last@example.com; DISPATCHER@example.com",
    "6002",
  ];
  rows[20] = [
    "outside@example.com",
    "5999",
    "outside-dispatcher@example.com",
    "6999",
  ];
  const source = createGoogleSheetsReferenceDataSource(
    {
      url: "https://docs.google.com/spreadsheets/d/sheet-id/edit?gid=0#gid=0",
      responsibleColumn: "Ответственный за регистрацию",
      locationColumn: "Места (цех/участок)",
      notificationEmailColumns: [],
      maxUserIdColumns: [],
      visitorNotificationEmailColumns: [],
      visitorMaxUserIdColumns: [],
      refractoryNotificationEmailColumns: ["Адресаты ОЦ (емейлы)"],
      refractoryMaxUserIdColumns: ["Адресаты ОЦ (МАКС)"],
      refractoryReviewNotificationEmailColumns: [
        "Адресаты Диспетчеры (емейлы)",
      ],
      refractoryReviewMaxUserIdColumns: [
        "Адресаты Диспетчеры (МАКС)",
      ],
      cacheTtlMs: 0,
      authMode: "public_csv",
    },
    async () => new Response(rows.map((row) => row.join(",")).join("\n"), {
      status: 200,
    }),
  );

  const referenceData = await source.read();

  assert.deepEqual(referenceData.refractoryNotificationRecipients, [
    "oc@example.com",
    "oc-last@example.com",
  ]);
  assert.deepEqual(referenceData.refractoryMaxNotificationRecipients, [
    "5001",
    "oc_chat_2",
    "5002",
  ]);
  assert.deepEqual(referenceData.refractoryReviewNotificationRecipients, [
    "dispatcher@example.com",
    "dispatcher-last@example.com",
  ]);
  assert.deepEqual(referenceData.refractoryReviewMaxNotificationRecipients, [
    "6001",
    "dispatcher_chat_2",
    "6002",
  ]);
});

test("google sheets reference source refetches options when cache ttl is zero", async () => {
  let fetchCount = 0;
  const source = createGoogleSheetsReferenceDataSource(
    {
      url: "https://docs.google.com/spreadsheets/d/sheet-id/edit?gid=0#gid=0",
      responsibleColumn: "Ответственный за регистрацию",
      locationColumn: "Места (цех/участок)",
      notificationEmailColumns: [
        "Адресаты по инцидентам и оборуджованию (емейлы)",
      ],
      maxUserIdColumns: [
        "Чаты пользователей",
      ],
      visitorNotificationEmailColumns: [
        "Адресаты по посетителям (емейлы)",
      ],
      visitorMaxUserIdColumns: [
        "Адресаты по посетителям (МАКС)",
      ],
      cacheTtlMs: 0,
      authMode: "public_csv",
    },
    async () => {
      fetchCount += 1;

      return new Response(
        `Ответственный за регистрацию\nСотрудник ${fetchCount}\n`,
        {
          status: 200,
          headers: {
            "content-type": "text/csv",
          },
        },
      );
    },
  );

  assert.deepEqual((await source.read()).incidentResponsibleOptions, [
    "Сотрудник 1",
  ]);
  assert.deepEqual((await source.read()).incidentResponsibleOptions, [
    "Сотрудник 2",
  ]);
  assert.equal(fetchCount, 2);
});

test("google sheets reference source caches fetched responsible options", async () => {
  let fetchCount = 0;
  const source = createGoogleSheetsReferenceDataSource(
    {
      url: "https://docs.google.com/spreadsheets/d/sheet-id/edit?gid=0#gid=0",
      responsibleColumn: "Ответственный за регистрацию",
      locationColumn: "Места (цех/участок)",
      notificationEmailColumns: [
        "Адресаты по инцидентам и оборуджованию (емейлы)",
      ],
      maxUserIdColumns: [
        "Чаты пользователей",
      ],
      visitorNotificationEmailColumns: [
        "Адресаты по посетителям (емейлы)",
      ],
      visitorMaxUserIdColumns: [
        "Адресаты по посетителям (МАКС)",
      ],
      cacheTtlMs: 60_000,
      authMode: "public_csv",
    },
    async () => {
      fetchCount += 1;

      return new Response(
        "Ответственный за регистрацию\nИван Иванов\nПётр Петров\n",
        {
          status: 200,
          headers: {
            "content-type": "text/csv",
          },
        },
      );
    },
  );

  assert.deepEqual((await source.read()).incidentResponsibleOptions, [
    "Иван Иванов",
    "Пётр Петров",
  ]);
  assert.deepEqual((await source.read()).incidentResponsibleOptions, [
    "Иван Иванов",
    "Пётр Петров",
  ]);
  assert.equal(fetchCount, 1);
});

test("google sheets reference source reads private sheets with service account", async () => {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const privateKeyPem = privateKey.export({
    type: "pkcs8",
    format: "pem",
  });
  const sheetValues = Array.from({ length: 30 }, () => ["", "", "", "", ""]);

  sheetValues[0] = [
    "Места (цех/участок)",
    "Ответственный за регистрацию",
    "Адресаты по инцидентам и оборуджованию (емейлы)",
    "Чаты пользователей",
    "Адресаты по посетителям (емейлы)",
    "Адресаты по посетителям (МАКС)",
  ];
  sheetValues[1] = [
    "Цех №1",
    "Иван Иванов",
    "common@example.com",
    "1001",
    "visitor@example.com",
    "4001",
  ];
  sheetValues[2] = ["Участок №2", "Пётр Петров", "", "", "", ""];
  sheetValues[3] = ["", "", "", "", "", ""];
  sheetValues[4] = ["", "Ответственный за регистрацию", "", "", "", ""];
  sheetValues[5] = ["", "Мария Сидорова", "", "", "", ""];
  sheetValues[21] = ["", "", "mechanic@example.com", "2001", "", ""];
  sheetValues[26] = ["", "", "electric@example.com", "3001", "", ""];

  const requests: string[] = [];
  const source = createGoogleSheetsReferenceDataSource(
    {
      url: "https://docs.google.com/spreadsheets/d/sheet-id/edit?gid=981703922#gid=981703922",
      responsibleColumn: "Ответственный за регистрацию",
      locationColumn: "Места (цех/участок)",
      notificationEmailColumns: [
        "Адресаты по инцидентам и оборуджованию (емейлы)",
      ],
      maxUserIdColumns: [
        "Чаты пользователей",
      ],
      visitorNotificationEmailColumns: [
        "Адресаты по посетителям (емейлы)",
      ],
      visitorMaxUserIdColumns: [
        "Адресаты по посетителям (МАКС)",
      ],
      cacheTtlMs: 60_000,
      authMode: "service_account",
      serviceAccountKeyFile: "/private/google-service-account.json",
    },
    async (input, init) => {
      const url = input.toString();

      requests.push(url);

      if (url === "https://oauth2.googleapis.com/token") {
        assert.equal(init?.method, "POST");
        assert.equal(
          init?.body instanceof URLSearchParams
            ? init.body.get("grant_type")
            : undefined,
          "urn:ietf:params:oauth:grant-type:jwt-bearer",
        );
        assert.match(
          init?.body instanceof URLSearchParams
            ? init.body.get("assertion") ?? ""
            : "",
          /^[^.]+\.[^.]+\.[^.]+$/,
        );

        return new Response(JSON.stringify({ access_token: "access-token" }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        });
      }

      assert.equal(
        (init?.headers as Record<string, string>).Authorization,
        "Bearer access-token",
      );

      if (url.startsWith("https://sheets.googleapis.com/v4/spreadsheets/sheet-id?")) {
        return new Response(
          JSON.stringify({
            sheets: [
              {
                properties: {
                  sheetId: 981703922,
                  title: "Справочник",
                },
              },
            ],
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }

      if (
        url.startsWith(
          "https://sheets.googleapis.com/v4/spreadsheets/sheet-id/values/",
        )
      ) {
        return new Response(
          JSON.stringify({
            values: sheetValues,
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }

      throw new Error(`Unexpected URL: ${url}`);
    },
    {
      async readTextFile(path) {
        assert.equal(path, "/private/google-service-account.json");

        return JSON.stringify({
          type: "service_account",
          client_email: "smb-sheets-reader@example.iam.gserviceaccount.com",
          private_key: privateKeyPem.toString(),
          token_uri: "https://oauth2.googleapis.com/token",
        });
      },
      now: () => 1_800_000_000_000,
    },
  );

  assert.deepEqual((await source.read()).incidentResponsibleOptions, [
    "Иван Иванов",
    "Пётр Петров",
    "Мария Сидорова",
  ]);
  assert.deepEqual((await source.read()).incidentLocationOptions, [
    "Цех №1",
    "Участок №2",
  ]);
  assert.deepEqual((await source.read()).notificationRecipients, {
    incidentAndEquipment: ["common@example.com"],
    mechanicalDowntime: ["mechanic@example.com"],
    electricalDowntime: ["electric@example.com"],
    visitors: ["visitor@example.com"],
  });
  assert.deepEqual((await source.read()).maxNotificationRecipients, {
    incidentAndEquipment: ["1001"],
    mechanicalDowntime: ["2001"],
    electricalDowntime: ["3001"],
    visitors: ["4001"],
  });
  assert.deepEqual(requests, [
    "https://oauth2.googleapis.com/token",
    "https://sheets.googleapis.com/v4/spreadsheets/sheet-id?fields=sheets%28properties%28sheetId%2Ctitle%29%29",
    "https://sheets.googleapis.com/v4/spreadsheets/sheet-id/values/'%D0%A1%D0%BF%D1%80%D0%B0%D0%B2%D0%BE%D1%87%D0%BD%D0%B8%D0%BA'?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE",
  ]);
});
