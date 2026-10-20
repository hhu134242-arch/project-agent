import { getFormattingLocale, t } from "@/i18n";

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;

export function timeAgo(date: Date | string): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const seconds = Math.round((now - then) / 1000);

  if (getFormattingLocale() === "zh-CN") {
    if (seconds < MINUTE) return t("format.justNow");
    const format = new Intl.RelativeTimeFormat("zh-CN", { numeric: "always" });
    if (seconds < HOUR) return format.format(-Math.floor(seconds / MINUTE), "minute");
    if (seconds < DAY) return format.format(-Math.floor(seconds / HOUR), "hour");
    if (seconds < WEEK) return format.format(-Math.floor(seconds / DAY), "day");
    if (seconds < MONTH) return format.format(-Math.floor(seconds / WEEK), "week");
    return format.format(-Math.floor(seconds / MONTH), "month");
  }

  if (seconds < MINUTE) return "just now";
  if (seconds < HOUR) {
    const m = Math.floor(seconds / MINUTE);
    return `${m}m ago`;
  }
  if (seconds < DAY) {
    const h = Math.floor(seconds / HOUR);
    return `${h}h ago`;
  }
  if (seconds < WEEK) {
    const d = Math.floor(seconds / DAY);
    return `${d}d ago`;
  }
  if (seconds < MONTH) {
    const w = Math.floor(seconds / WEEK);
    return `${w}w ago`;
  }
  const mo = Math.floor(seconds / MONTH);
  return `${mo}mo ago`;
}
