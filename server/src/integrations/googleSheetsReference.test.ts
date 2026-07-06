import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import {
  buildGoogleSheetsCsvUrl,
  createGoogleSheetsReferenceDataSource,
  readColumnOptionsFromCsv,
  readNotificationRecipientsFromCsv,
} from "./googleSheetsReference.js";

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
  const rows = Array.from({ length: 30 }, () => [""]);

  rows[0] = ["Адресаты по инцидентам и оборуджованию (емейлы)"];
  rows[1] = ["common@example.com"];
  rows[19] = ["common-last@example.com"];
  rows[20] = ["outside@example.com"];
  rows[21] = ["mechanic@example.com"];
  rows[24] = ["mechanic-last@example.com; common@example.com"];
  rows[26] = ["electric@example.com"];
  rows[29] = ["electric-last@example.com"];

  assert.deepEqual(
    readNotificationRecipientsFromCsv(
      rows.map((row) => row.join(",")).join("\n"),
      [
        "Адресаты по инцидентам и оборуджованию (емейлы)",
        "Адресаты по инцидентам и оборудованию (емейлы)",
      ],
    ),
    {
      incidentAndEquipment: ["common@example.com", "common-last@example.com"],
      mechanicalDowntime: [
        "mechanic@example.com",
        "mechanic-last@example.com",
        "common@example.com",
      ],
      electricalDowntime: ["electric@example.com", "electric-last@example.com"],
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
  const sheetValues = Array.from({ length: 30 }, () => ["", "", ""]);

  sheetValues[0] = [
    "Места (цех/участок)",
    "Ответственный за регистрацию",
    "Адресаты по инцидентам и оборуджованию (емейлы)",
  ];
  sheetValues[1] = ["Цех №1", "Иван Иванов", "common@example.com"];
  sheetValues[2] = ["Участок №2", "Пётр Петров", ""];
  sheetValues[3] = ["", "", ""];
  sheetValues[4] = ["", "Ответственный за регистрацию", ""];
  sheetValues[5] = ["", "Мария Сидорова", ""];
  sheetValues[21] = ["", "", "mechanic@example.com"];
  sheetValues[26] = ["", "", "electric@example.com"];

  const requests: string[] = [];
  const source = createGoogleSheetsReferenceDataSource(
    {
      url: "https://docs.google.com/spreadsheets/d/sheet-id/edit?gid=981703922#gid=981703922",
      responsibleColumn: "Ответственный за регистрацию",
      locationColumn: "Места (цех/участок)",
      notificationEmailColumns: [
        "Адресаты по инцидентам и оборуджованию (емейлы)",
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
  });
  assert.deepEqual(requests, [
    "https://oauth2.googleapis.com/token",
    "https://sheets.googleapis.com/v4/spreadsheets/sheet-id?fields=sheets%28properties%28sheetId%2Ctitle%29%29",
    "https://sheets.googleapis.com/v4/spreadsheets/sheet-id/values/'%D0%A1%D0%BF%D1%80%D0%B0%D0%B2%D0%BE%D1%87%D0%BD%D0%B8%D0%BA'?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE",
  ]);
});
