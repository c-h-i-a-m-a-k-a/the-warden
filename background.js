// The Warden: tracks focused time toward a goal, pauses it on distracting sites,
// and tells the page when to warn, send the warden, jail, release and post bail.

import { DEFAULT_SETTINGS, formatGoal, hostOf, isDistracting } from "./shared.js";
import { makeFuture } from "./future.js";

const now = () => Date.now();

// Every read-modify-write of the session runs one at a time, so events that arrive
// together (closing a tab and switching to another) can't overwrite each other.
let queue = Promise.resolve();
function serial(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

async function getSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...settings };
}

async function getSession() {
  const { session } = await chrome.storage.local.get("session");
  return session ?? { running: false };
}

const saveSession = (session) => chrome.storage.local.set({ session });

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

function send(tabId, msg) {
  if (tabId == null) return;
  chrome.tabs.sendMessage(tabId, msg).catch(() => {});
}

// ---------- Sound (played from an offscreen document so page autoplay rules don't apply) ----------

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["AUDIO_PLAYBACK"],
    justification: "Play the warden's voice and sound effects.",
  });
}

async function play(name) {
  await ensureOffscreen();
  if (name === "narration") {
    const { future } = await chrome.storage.local.get("future");
    if (future?.audio) chrome.runtime.sendMessage({ target: "offscreen", type: "playData", data: future.audio }).catch(() => {});
    return;
  }
  chrome.runtime.sendMessage({ target: "offscreen", type: "play", name }).catch(() => {});
}

// ---------- Session bookkeeping ----------

/** Fold any time spent focusing since the last check into focusedMs. */
function settle(s) {
  if (s.accruingSince) {
    const t = now();
    s.focusedMs += t - s.accruingSince;
    s.accruingSince = t;
  }
}

function scheduleGoalAlarm(s) {
  chrome.alarms.clear("goal");
  if (s.running && s.accruingSince) {
    chrome.alarms.create("goal", { when: now() + Math.max(0, s.goalMs - s.focusedMs) + 50 });
  }
}

async function start(settings) {
  const s = {
    running: true,
    phase: "focus",
    task: settings.task.trim() || "get my work done",
    goalMs: Math.max(1, settings.goalMinutes) * 60_000,
    focusedMs: 0,
    accruingSince: now(),
    tabId: null,
    host: "",
    jail: null,
    startedAt: now(),
    motivation: (settings.motivation ?? "").trim(),
    future: null,
    futureStatus: "pending",
  };
  await saveSession(s);
  await chrome.storage.local.remove("future");
  await evaluateNow();
  prepareFuture(s);
}

/** Write, draw and narrate the "what you're missing" cutaway now, so it's ready when it's needed. */
async function prepareFuture(started) {
  const future = await makeFuture(started.task, started.motivation);
  if (!future) {
    await serial(async () => {
      const s = await getSession();
      if (s.running && s.startedAt === started.startedAt) {
        s.futureStatus = "failed";
        await saveSession(s);
      }
    });
    return;
  }
  await serial(async () => {
    const s = await getSession();
    if (!s.running || s.startedAt !== started.startedAt) return;
    await chrome.storage.local.set({ future: { image: future.image, mime: future.mime, audio: future.audio } });
    // The narration plays at 1.5x speed (see offscreen.js), so it finishes sooner.
    s.future = { headline: future.headline, narration: future.narration, durationMs: Math.round(future.durationMs / 1.5) };
    s.futureStatus = "ready";
    await saveSession(s);
  });
}

async function end() {
  const s = await getSession();
  chrome.alarms.clear("goal");
  if (s.tabId != null) send(s.tabId, { type: "clear" });
  if (s.jail) broadcast({ type: "released" });
  await saveSession({ running: false });
}

async function broadcast(msg) {
  const tabs = await chrome.tabs.query({});
  tabs.forEach((t) => send(t.id, msg));
}

async function postBail(s) {
  settle(s);
  s.phase = "done";
  s.accruingSince = null;
  s.running = false;
  s.finishedAt = now();
  chrome.alarms.clear("goal");
  await saveSession(s);
  const tab = await activeTab();
  const goal = formatGoal(s.goalMs);
  if (tab && /^https?:/.test(tab.url ?? "")) {
    send(tab.id, { type: "bail", task: s.task, goal });
  } else {
    play("bail");
  }
}

/** Re-check where the user is and update the timer and the page accordingly. */
const evaluate = () => serial(evaluateNow);

async function evaluateNow() {
  const s = await getSession();
  if (!s.running) return;
  const settings = await getSettings();
  settle(s);
  if (s.focusedMs >= s.goalMs && s.phase !== "jailed" && s.phase !== "warden") return postBail(s);

  const tab = await activeTab();
  const url = tab?.url ?? "";
  const distracting = isDistracting(url, settings.sites);

  if (s.phase === "warden") {
    // The warden is already on the way in; nothing stops it now.
    s.accruingSince = null;
  } else if (s.phase === "jailed") {
    // Jail follows you to whatever tab you open until you're released.
    s.accruingSince = null;
    if (tab && tab.id !== s.jail.tabId) send(tab.id, { type: "jail", task: s.task, jail: s.jail });
  } else if (distracting) {
    if (s.phase === "focus" || s.tabId !== tab.id || s.host !== hostOf(url)) {
      if (s.tabId != null && s.tabId !== tab.id) send(s.tabId, { type: "clear" });
      s.phase = "distracted";
      s.tabId = tab.id;
      s.host = hostOf(url);
      s.distractedSince = now();
    }
    s.accruingSince = null;
    send(tab.id, {
      type: "distracted",
      task: s.task,
      host: s.host,
      warnAt: s.distractedSince + settings.warnAfterSec * 1000,
      wardenAt: s.distractedSince + (settings.warnAfterSec + settings.wardenAfterSec) * 1000,
    });
  } else {
    if (s.phase !== "focus") {
      send(s.tabId, { type: "clear" });
      s.phase = "focus";
      s.tabId = null;
      s.host = "";
    }
    if (!s.accruingSince) s.accruingSince = now();
  }

  scheduleGoalAlarm(s);
  await saveSession(s);
}

// ---------- Events ----------

// Tabs that were already open when the extension was installed or reloaded still have the
// old, disconnected page script. Attach a fresh one so the warning and the warden work there.
chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
  for (const tab of tabs) {
    chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] }).catch(() => {});
  }
});

chrome.tabs.onActivated.addListener(() => evaluate());
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.url || info.status === "complete") evaluate();
});
chrome.windows.onFocusChanged.addListener(() => evaluate());
chrome.alarms.onAlarm.addListener((a) => a.name === "goal" && evaluate());

/** Lines written and the distraction closed: walk free, and the timer picks back up. */
async function release(s) {
  s.phase = "focus";
  s.jail = null;
  s.tabId = null;
  s.host = "";
  s.accruingSince = now();
  await saveSession(s);
  broadcast({ type: "released" });
  play("unlock");
  return evaluateNow();
}

chrome.tabs.onRemoved.addListener((tabId) => serial(async () => {
  const s = await getSession();
  if (!s.running) return;
  if (s.phase === "jailed" && s.jail?.tabId === tabId) {
    if (s.jail.linesDone) return release(s);
    // Closed without writing the lines: still jailed, on whatever tab comes next.
    s.jail.tabId = null;
    await saveSession(s);
    return evaluateNow();
  }
  if (s.tabId === tabId) return evaluateNow();
}));

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.target === "offscreen") return;
  serial(async () => {
    const s = await getSession();
    const tabId = sender.tab?.id;
    switch (msg.type) {
      case "start":
        await start(msg.settings);
        break;
      case "end":
        await end();
        break;
      case "sound":
        play(msg.name);
        break;
      case "getFuture": {
        if (!s.future) {
          reply({ status: s.futureStatus === "pending" ? "pending" : "failed" });
          return;
        }
        const { future } = await chrome.storage.local.get("future");
        reply(future ? { status: "ready", ...s.future, image: future.image, mime: future.mime } : { status: "failed" });
        return;
      }
      case "hello":
        // A page just loaded; tell it what state it should show.
        await evaluateNow();
        if (s.running && s.phase === "jailed") {
          const fresh = await getSession();
          if (tabId != null) send(tabId, { type: "jail", task: fresh.task, jail: fresh.jail });
        }
        break;
      case "warden":
        if (s.running && s.phase === "distracted" && s.tabId === tabId) {
          s.phase = "warden";
          s.accruingSince = null;
          await saveSession(s);
        }
        break;
      case "jailed":
        if (s.running && (s.phase === "warden" || s.phase === "distracted")) {
          s.phase = "jailed";
          s.accruingSince = null;
          s.jail = { tabId, host: s.host || hostOf(sender.tab?.url ?? ""), linesDone: false };
          await saveSession(s);
        }
        break;
      case "linesDone":
        if (s.running && s.phase === "jailed") {
          s.jail.linesDone = true;
          // If the distracting tab is already gone, the lines are all that's left.
          if (s.jail.tabId == null) {
            await release(s);
            break;
          }
          await saveSession(s);
          broadcast({ type: "jail", task: s.task, jail: s.jail });
        }
        break;
    }
    reply({ ok: true });
  });
  return true;
});
