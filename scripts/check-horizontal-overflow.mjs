#!/usr/bin/env node
/**
 * Проверка «нет горизонтальной прокрутки, кроме таблиц».
 *
 * Обходит локально запущенное приложение (test-режим с dev-входом) под каждой
 * должностью из `/api/dev/access-session` в узких окнах, открывает вкладки
 * левого меню и внутренние вкладки разделов и ищет:
 *   1) прокручиваемые по горизонтали контейнеры, переполненные не таблицей;
 *   2) видимые элементы, выходящие за правый край окна.
 *
 * Данные не меняются: в браузере блокируются все запросы, кроме GET, а
 * диалоги подтверждения закрываются отказом.
 *
 * Запуск (нужны `npm run dev:api` и `npm run dev:web -- --host 127.0.0.1`):
 *   npm run check:layout -- [--url http://127.0.0.1:5173] [--widths 375,1024]
 *     [--positions a,b] [--max-states 40] [--debug 1] [--trace <селектор>]
 */
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => {
  if (value.startsWith("--")) pairs.push([value.slice(2), all[index + 1] ?? ""]);
  return pairs;
}, []));
const appUrl = (args.url ?? "http://127.0.0.1:5173").replace(/\/$/u, "");
const widths = (args.widths ?? "375,1024").split(",").map(Number).filter((value) => value > 0);
const onlyPositions = args.positions?.split(",").filter(Boolean);
const chromePath = args.chrome ?? process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const maxStatesPerTab = Number(args["max-states"] ?? 40);
const settleMs = Number(args.settle ?? 700);
const debug = "debug" in args;
const traceSelector = args.trace;
const debugExpression = args.eval;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function launchChrome() {
  const userDataDir = await mkdtemp(path.join(tmpdir(), "smb-overflow-"));
  const chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    `--user-data-dir=${userDataDir}`,
    "about:blank",
  ], { stdio: "ignore" });
  let port;
  for (let attempt = 0; attempt < 100 && port === undefined; attempt += 1) {
    await sleep(100);
    try {
      port = Number((await readFile(path.join(userDataDir, "DevToolsActivePort"), "utf8")).split("\n")[0]);
    } catch {
      // Chrome has not written the port yet.
    }
  }
  if (port === undefined) throw new Error("Chrome did not start (DevToolsActivePort missing).");
  return {
    port,
    async close() {
      chrome.kill();
      await sleep(300);
      await rm(userDataDir, { recursive: true, force: true });
    },
  };
}

function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  const listeners = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id !== undefined) {
      const entry = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) entry?.reject(new Error(message.error.message));
      else entry?.resolve(message.result);
      return;
    }
    for (const listener of listeners.get(message.method) ?? []) listener(message.params, message.sessionId);
  });
  const ready = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  return {
    ready,
    send(method, params = {}, sessionId) {
      const id = nextId++;
      socket.send(JSON.stringify({ id, method, params, ...(sessionId === undefined ? {} : { sessionId }) }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
    on(method, listener) {
      listeners.set(method, [...(listeners.get(method) ?? []), listener]);
    },
    close() { socket.close(); },
  };
}

/** Runs in the page: reports overflow that is not a table scrolling inside its container. */
function collectOverflow() {
  const viewport = document.documentElement.clientWidth;
  const describe = (element) => {
    const parts = [];
    for (let node = element; node && node !== document.body && parts.length < 4; node = node.parentElement) {
      const classes = [...node.classList].filter((name) => !/^is-/u.test(name)).slice(0, 3).join(".");
      parts.unshift(`${node.tagName.toLowerCase()}${classes === "" ? "" : `.${classes}`}`);
    }
    return parts.join(" > ");
  };
  const isTableLike = (element) =>
    element.matches("table, [role='table'], .managed-table, .managed-table-grid") ||
    element.querySelector(":scope > table, :scope > [role='table'], :scope > .managed-table, :scope > .managed-table-grid") !== null;
  const scrollsX = (style) => style.overflowX === "auto" || style.overflowX === "scroll";
  const problems = [];

  // 1) Horizontal scrolling that is not a table: the page itself or a non-table container.
  const root = document.scrollingElement ?? document.documentElement;
  if (root.scrollWidth > root.clientWidth + 1) {
    const insideScroll = (child) => {
      for (let node = child.parentElement; node && node !== document.body; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.overflowX !== "visible") return true;
      }
      return false;
    };
    const sticking = new Set([...document.body.querySelectorAll("*")].filter((child) => {
      const box = child.getBoundingClientRect();
      return box.width > 0 && box.right > viewport + 1 && !insideScroll(child);
    }));
    const culprits = [...sticking]
      .filter((child) => !sticking.has(child.parentElement))
      .slice(0, 3)
      .map((child) => `${describe(child)} (w ${Math.round(child.getBoundingClientRect().width)}px, ${getComputedStyle(child).position})`);
    if (culprits.length === 0) {
      // Positioned, transformed or zero-height boxes can widen the page invisibly.
      for (const child of [...document.body.querySelectorAll("*")]
        .filter((node) => node.getBoundingClientRect().right > viewport + 1)
        .sort((first, second) => second.getBoundingClientRect().right - first.getBoundingClientRect().right)
        .slice(0, 3)) {
        const box = child.getBoundingClientRect();
        culprits.push(`${describe(child)} [${getComputedStyle(child).position}, right ${Math.round(box.right)}px, h ${Math.round(box.height)}]`);
      }
    }
    problems.push({ kind: "page", where: "document", overflow: root.scrollWidth - root.clientWidth, culprits });
  }
  for (const element of document.querySelectorAll("body *")) {
    const style = getComputedStyle(element);
    if (!scrollsX(style) || element.scrollWidth <= element.clientWidth + 1) continue;
    if (style.display === "none" || element.clientWidth === 0) continue;
    const children = [...element.children];
    const tableCaused = children.some((child) => isTableLike(child) && child.scrollWidth > element.clientWidth) ||
      isTableLike(element);
    if (tableCaused) continue;
    // Name the outermost descendants that stick out (outside nested scroll boxes).
    const edge = element.getBoundingClientRect().left + element.clientWidth + 1;
    const insideNestedScroll = (child) => {
      for (let node = child.parentElement; node && node !== element; node = node.parentElement) {
        if (scrollsX(getComputedStyle(node))) return true;
      }
      return false;
    };
    const sticking = new Set([...element.querySelectorAll("*")].filter((child) => {
      const box = child.getBoundingClientRect();
      return box.width > 0 && box.right > edge && !insideNestedScroll(child);
    }));
    const culprits = [...sticking]
      .filter((child) => !sticking.has(child.parentElement))
      .slice(0, 3)
      .map((child) => {
        const box = child.getBoundingClientRect();
        const style = getComputedStyle(child);
        return `${describe(child)} (w ${Math.round(box.width)}px, ${style.display}${style.position === "static" ? "" : `, ${style.position}`})`;
      });
    problems.push({
      kind: "scroll",
      where: describe(element),
      overflow: element.scrollWidth - element.clientWidth,
      culprits: culprits.slice(0, 3),
    });
  }

  // A table box squeezed by its shrink-to-fit parent is as bad as an overflow.
  for (const element of document.querySelectorAll(".managed-table-scroll")) {
    const box = element.getBoundingClientRect();
    if (box.height === 0 || getComputedStyle(element).display === "none") continue;
    if (element.clientWidth < Math.min(240, viewport * 0.6) && element.scrollWidth > element.clientWidth + 1) {
      problems.push({ kind: "collapsed", where: describe(element), overflow: Math.round(box.width) });
    }
  }

  // 2) Visible elements reaching past the right edge and not clipped by a scrolling/hidden ancestor.
  const clipped = (element) => {
    for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.overflowX !== "visible") {
        const box = node.getBoundingClientRect();
        if (box.right <= viewport + 1) return true;
      }
    }
    return false;
  };
  for (const element of document.querySelectorAll("body *")) {
    const box = element.getBoundingClientRect();
    if (box.width === 0 || box.height === 0 || box.right <= viewport + 1) continue;
    const style = getComputedStyle(element);
    if (style.visibility === "hidden" || style.position === "fixed") continue;
    if (element.closest("[aria-hidden='true'], [hidden], dialog:not([open])")) continue;
    if (clipped(element)) continue;
    problems.push({ kind: "edge", where: describe(element), overflow: Math.round(box.right - viewport) });
  }
  // Report only the outermost offender of each chain.
  const seen = new Set();
  return problems.filter((problem) => {
    const key = `${problem.kind}|${problem.where}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Runs in the page: labels of clickable navigation (left rail and in-section tabs). */
function listNavigation() {
  const label = (element) => (element.getAttribute("aria-label") || element.textContent || "").replace(/\s+/gu, " ").trim();
  const isTabLike = (element) => {
    if (element.getAttribute("role") === "tab") return true;
    // Buttons that open a form or a card: their screens must fit too (saving is blocked).
    if (/^(Добавить|Новая|Новый|Новое|Создать|Открыть|Назначить|Изменить|Заполнить)/u.test(label(element))) return true;
    const container = element.parentElement;
    if (!container) return false;
    const name = `${container.className} ${container.getAttribute("role") ?? ""}`;
    return /(tabs|tablist|menu|switch|segment|subnav|section-nav|journal-nav|report-menu|choice)/iu.test(name) &&
      !/(dropdown|context|table-layout|preview)/iu.test(name);
  };
  const rail = [...document.querySelectorAll("nav button, nav a")]
    .filter((element) => label(element) !== "")
    .map((element) => label(element));
  const tabs = [...document.querySelectorAll("main button, main [role='tab'], section button")]
    .filter((element) => !element.closest("nav") && isTabLike(element) && !element.disabled && label(element) !== "")
    .map((element) => label(element));
  return { rail: [...new Set(rail)], tabs: [...new Set(tabs)] };
}

function clickByLabel(scope, text) {
  const label = (element) => (element.getAttribute("aria-label") || element.textContent || "").replace(/\s+/gu, " ").trim();
  const candidates = [...document.querySelectorAll(scope === "rail" ? "nav button, nav a" : "main button, main [role='tab'], section button")]
    .filter((element) => scope !== "rail" ? !element.closest("nav") : true);
  const target = candidates.find((element) => label(element) === text);
  if (!target) return false;
  target.click();
  return true;
}

async function main() {
  const optionsResponse = await fetch(`${appUrl}/api/dev/access-session`);
  if (!optionsResponse.ok) throw new Error(`Dev access is not available at ${appUrl}.`);
  const { options } = await optionsResponse.json();
  const positions = options
    .map((option) => option.position)
    .filter((position) => onlyPositions === undefined || onlyPositions.includes(position));
  const displayNames = new Map(options.map((option) => [option.position, option.positionDisplayName]));

  const chrome = await launchChrome();
  const version = await (await fetch(`http://127.0.0.1:${chrome.port}/json/version`)).json();
  const cdp = connect(version.webSocketDebuggerUrl);
  await cdp.ready;
  const report = [];

  try {
    for (const position of positions) {
      const displayName = displayNames.get(position);

      for (const width of widths) {
        // Own cookies and storage per position and width: dev sessions must not leak between runs.
        const { browserContextId } = await cdp.send("Target.createBrowserContext");
        const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank", browserContextId });
        const { sessionId: page } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
        const send = (method, params) => cdp.send(method, params, page);
        await send("Page.enable");
        await send("Runtime.enable");
        await send("Emulation.setDeviceMetricsOverride", {
          width, height: 900, deviceScaleFactor: 1, mobile: width < 700,
        });
        // Read-only walk: everything except GET (and the dev session itself) is refused.
        await send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
        cdp.on("Fetch.requestPaused", (params, eventSession) => {
          if (eventSession !== page) return;
          const allowed = params.request.method === "GET" || params.request.method === "OPTIONS" ||
            new URL(params.request.url).pathname === "/api/dev/access-session";
          void (allowed
            ? cdp.send("Fetch.continueRequest", { requestId: params.requestId }, page)
            : cdp.send("Fetch.failRequest", { requestId: params.requestId, errorReason: "BlockedByClient" }, page)
          ).catch(() => {});
        });
        cdp.on("Page.javascriptDialogOpening", (_params, eventSession) => {
          if (eventSession !== page) return;
          void cdp.send("Page.handleJavaScriptDialog", { accept: false }, page).catch(() => {});
        });
        const evaluate = async (fn, ...fnArgs) => {
          const result = await send("Runtime.evaluate", {
            expression: `(${fn.toString()})(...${JSON.stringify(fnArgs)})`,
            returnByValue: true,
            awaitPromise: true,
          });
          return result.result?.value;
        };
        const navigate = async (url) => {
          await send("Page.navigate", { url });
          await sleep(1500);
        };
        const check = async (state) => {
          await sleep(settleMs);
          if (debug) console.log(`  [${position} ${width}] ${state}`);
          const problems = await evaluate(collectOverflow);
          if (debugExpression !== undefined) {
            const result = await send("Runtime.evaluate", { expression: debugExpression, returnByValue: true });
            console.log(`  eval @ ${state}: ${JSON.stringify(result.result?.value)}`);
          }
          if (traceSelector !== undefined) {
            const chain = await evaluate((selector) => {
              const lines = [];
              for (let node = document.querySelector(selector); node && node !== document.body; node = node.parentElement) {
                const style = getComputedStyle(node);
                const box = node.getBoundingClientRect();
                lines.push(`${node.tagName.toLowerCase()}.${[...node.classList].join(".")} w=${Math.round(box.width)} client=${node.clientWidth} scroll=${node.scrollWidth} display=${style.display} ox=${style.overflowX} cols=${style.gridTemplateColumns.slice(0, 40)} minw=${style.minWidth}`);
              }
              return lines;
            }, traceSelector);
            if (chain?.length) console.log(`  trace @ ${state}:\n    ${chain.join("\n    ")}`);
          }
          if (problems?.length) report.push({ position, width, state, problems });
        };

        // Enter the way a person does: the access screen is checked too.
        await navigate(`${appUrl}/`);
        await check("Выбор доступа");
        const entered = await evaluate((name) => {
          const card = [...document.querySelectorAll("button")]
            .find((element) => element.textContent.replace(/\s+/gu, " ").includes(name));
          card?.click();
          return card !== undefined;
        }, displayName);
        if (!entered) {
          report.push({ position, width, state: "login", problems: [{ kind: "login", where: "access card not found", overflow: 0 }] });
          await cdp.send("Target.closeTarget", { targetId });
          await cdp.send("Target.disposeBrowserContext", { browserContextId });
          continue;
        }
        await sleep(2000);

        await check("start");
        const { rail } = await evaluate(listNavigation);
        if (debug) {
          console.log(`  rail: ${rail.join(" | ")}`);
          console.log(`  text: ${String(await evaluate(() => document.body.innerText.slice(0, 300))).replace(/\s+/gu, " ")}`);
        }
        // Every state starts from a fresh load: a click may switch modes (preview, forms).
        const openRail = async (railLabel) => {
          await navigate(`${appUrl}/`);
          return evaluate(clickByLabel, "rail", railLabel);
        };
        for (const railLabel of rail) {
          if (/выйти|выход|меню|закрыть/iu.test(railLabel)) continue;
          if (!(await openRail(railLabel))) {
            if (debug) {
              const text = await evaluate(() => document.body.innerText.slice(0, 200));
              console.log(`  rail item not found after reload: ${railLabel} :: ${String(text).replace(/\s+/gu, " ")}`);
            }
            continue;
          }
          await check(railLabel);
          // Breadth-first walk over in-section tabs, a few levels deep.
          const visited = new Set();
          const queue = [[]];
          let states = 0;
          while (queue.length > 0 && states < maxStatesPerTab) {
            const trail = queue.shift();
            if (trail.length > 0 && !(await openRail(railLabel))) continue;
            await sleep(200);
            let ok = true;
            for (const step of trail) {
              ok = await evaluate(clickByLabel, "tabs", step);
              if (!ok) break;
              await sleep(250);
            }
            if (!ok) continue;
            if (trail.length > 0) {
              states += 1;
              await check(`${railLabel} › ${trail.join(" › ")}`);
            }
            if (trail.length >= 3) continue;
            const { tabs } = await evaluate(listNavigation);
            for (const tab of tabs) {
              // A position card in the admin preview switches the whole session: never press it.
              if ([...displayNames.values()].some((name) => tab.includes(name))) continue;
              const key = [...trail, tab].join(" › ");
              if (visited.has(tab) || trail.includes(tab)) continue;
              visited.add(tab);
              visited.add(key);
              queue.push([...trail, tab]);
            }
          }
        }
        await cdp.send("Target.closeTarget", { targetId });
        await cdp.send("Target.disposeBrowserContext", { browserContextId });
      }
    }
  } finally {
    cdp.close();
    await chrome.close();
  }

  // Group identical offenders so one CSS bug is reported once.
  const grouped = new Map();
  for (const entry of report) {
    for (const problem of entry.problems) {
      const key = `${problem.kind} ${problem.where}`;
      const current = grouped.get(key) ?? { ...problem, widths: new Set(), states: new Set(), max: 0, culprits: new Set() };
      current.widths.add(entry.width);
      current.states.add(`${entry.position}: ${entry.state}`);
      current.max = Math.max(current.max, problem.overflow);
      for (const culprit of problem.culprits ?? []) current.culprits.add(culprit);
      grouped.set(key, current);
    }
  }
  if (grouped.size === 0) {
    console.log(`OK: no horizontal overflow outside tables (${positions.length} positions, widths ${widths.join(", ")}).`);
    return;
  }
  for (const [key, problem] of grouped) {
    console.log(`${key}  (+${problem.max}px at ${[...problem.widths].join("/")}px)`);
    for (const culprit of [...(problem.culprits ?? [])].slice(0, 4)) console.log(`    ← ${culprit}`);
    for (const state of [...problem.states].slice(0, 4)) console.log(`    ${state}`);
  }
  process.exitCode = 1;
}

await main();
