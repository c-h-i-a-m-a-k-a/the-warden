import { DEFAULT_SETTINGS, formatGoal } from "./shared.js";

const $ = (id) => document.getElementById(id);
const CIRC = 2 * Math.PI * 52;

function clock(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

async function load() {
  const { settings, session } = await chrome.storage.local.get(["settings", "session"]);
  return { settings: { ...DEFAULT_SETTINGS, ...settings }, session: session ?? { running: false } };
}

let sites = [];

const NAMES = { "youtube.com": "YouTube", "netflix.com": "Netflix", "tiktok.com": "TikTok", "instagram.com": "Instagram", "x.com": "X",
  "twitter.com": "Twitter", "facebook.com": "Facebook", "reddit.com": "Reddit", "twitch.tv": "Twitch", "hulu.com": "Hulu",
  "disneyplus.com": "Disney+", "max.com": "Max" };
const pretty = (s) => NAMES[s] ?? s;

function cleanSite(raw) {
  return raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
}

function renderSites() {
  const shown = sites.slice(0, 3).map(pretty).join(", ");
  $("sitesSummary").textContent = !sites.length ? "None yet" : sites.length > 3 ? `${shown} + ${sites.length - 3} more` : shown;
  $("siteList").innerHTML = sites.map((s, i) => `<li>${s}<button type="button" data-i="${i}" aria-label="Remove ${s}">×</button></li>`).join("");
  $("siteList").querySelectorAll("button").forEach((b) => (b.onclick = () => { sites.splice(+b.dataset.i, 1); renderSites(); }));
}

function goalMinutes() {
  return (+$("hours").value || 0) * 60 + (+$("minutes").value || 0);
}

function fillForm(settings) {
  $("task").value = settings.task;
  $("motivation").value = settings.motivation ?? "";
  $("hours").value = Math.floor(settings.goalMinutes / 60);
  $("minutes").value = settings.goalMinutes % 60;
  sites = [...settings.sites];
  renderSites();
  $("warnAfter").value = settings.warnAfterSec;
  $("wardenAfter").value = settings.wardenAfterSec;
}

$("editSites").onclick = () => { show("sites"); $("addSite").focus(); };
$("sitesDone").onclick = () => show("setup");
$("addSite").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const site = cleanSite(e.target.value);
  if (site && !sites.includes(site)) sites.push(site);
  e.target.value = "";
  renderSites();
});

let editing = () => !$("sites").hidden;

function show(which) {
  for (const id of ["setup", "sites", "running", "done"]) $(id).hidden = id !== which;
}

async function render() {
  const { session: s } = await load();
  if (s.running) {
    show("running");
    const focused = s.focusedMs + (s.accruingSince ? Date.now() - s.accruingSince : 0);
    $("elapsed").textContent = clock(Math.min(focused, s.goalMs));
    $("goal").textContent = `of ${clock(s.goalMs)}`;
    $("taskLabel").textContent = s.task;
    const pct = Math.min(1, focused / s.goalMs);
    const ring = $("progress");
    ring.style.strokeDashoffset = String(CIRC * (1 - pct));
    const jailed = s.phase === "warden" || s.phase === "jailed";
    const paused = s.phase === "distracted";
    ring.className.baseVal = `progress ${jailed ? "jailed" : paused ? "paused" : ""}`;
    const status = $("status");
    status.className = `status ${jailed ? "jailed" : paused ? "paused" : "focus"}`;
    status.textContent = jailed ? "In jail · timer paused" : paused ? `Paused · on ${s.host}` : "On task";
  } else if (s.phase === "done") {
    show("done");
    $("doneSub").textContent = `${formatGoal(s.goalMs)} of ${s.task}.`;
  } else if (!editing()) {
    show("setup");
  }
}

$("setup").addEventListener("submit", async (e) => {
  e.preventDefault();
  const settings = {
    task: $("task").value.trim(),
    motivation: $("motivation").value.trim(),
    goalMinutes: Math.max(1, goalMinutes()),
    sites: [...sites],
    warnAfterSec: Math.max(0, +$("warnAfter").value || 0),
    wardenAfterSec: Math.max(1, +$("wardenAfter").value || 1),
  };
  await chrome.storage.local.set({ settings });
  await chrome.runtime.sendMessage({ type: "start", settings });
  render();
});

$("end").onclick = async () => {
  await chrome.runtime.sendMessage({ type: "end" });
  render();
};

$("again").onclick = async () => {
  await chrome.storage.local.set({ session: { running: false } });
  render();
};

const { settings } = await load();
fillForm(settings);
render();
setInterval(render, 500);
