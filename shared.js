// Values and helpers shared by the background script and the popup.

export const DEFAULT_SETTINGS = {
  task: "",
  motivation: "",
  goalMinutes: 300,
  warnAfterSec: 60,
  wardenAfterSec: 60,
  sites: [
    "youtube.com", "netflix.com", "tiktok.com", "instagram.com", "x.com", "twitter.com",
    "facebook.com", "reddit.com", "twitch.tv", "hulu.com", "disneyplus.com", "max.com",
  ],
};

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function isDistracting(url, sites) {
  const host = hostOf(url);
  return !!host && sites.some((s) => host === s || host.endsWith("." + s));
}

export function formatGoal(ms) {
  const m = Math.round(ms / 60_000);
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (!h) return `${m} min`;
  return rest ? `${h}h ${rest}m` : `${h} hour${h === 1 ? "" : "s"}`;
}
