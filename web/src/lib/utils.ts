import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .normalize('NFD') // Separa acentos das letras
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/\s+/g, '-') // Substitui espaços por hífens
    .replace(/[^\w\-]+/g, '') // Remove caracteres não alfanuméricos
    .replace(/\-\-+/g, '-'); // Remove múltiplos hífens
}

export const DEFAULT_PANELINHA_TIMEZONE = "America/Sao_Paulo";

function safeTimeZone(timeZone?: string | null) {
  const candidate = String(timeZone || "").trim();
  if (!candidate) return DEFAULT_PANELINHA_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(0);
    return candidate;
  } catch {
    return DEFAULT_PANELINHA_TIMEZONE;
  }
}

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function partsFromDateInTimeZone(date: Date, timeZone: string): ZonedParts {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = dtf.formatToParts(date);
  const lookup: Record<string, string> = {};
  for (const part of parts) lookup[part.type] = part.value;
  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour),
    minute: Number(lookup.minute),
    second: Number(lookup.second),
  };
}

function timeZoneOffsetMinutes(date: Date, timeZone: string) {
  const p = partsFromDateInTimeZone(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return (asUtc - date.getTime()) / 60000;
}

export function zonedTimeToUtc(
  value: {
    year: number;
    month: number;
    day: number;
    hour?: number;
    minute?: number;
    second?: number;
  },
  timeZone?: string | null,
): Date {
  const tz = safeTimeZone(timeZone);
  const utcGuess = Date.UTC(
    value.year,
    value.month - 1,
    value.day,
    value.hour ?? 0,
    value.minute ?? 0,
    value.second ?? 0,
  );
  const guessDate = new Date(utcGuess);
  const offset1 = timeZoneOffsetMinutes(guessDate, tz);
  const utc1 = utcGuess - offset1 * 60000;
  const date1 = new Date(utc1);
  const offset2 = timeZoneOffsetMinutes(date1, tz);
  const utc2 = utcGuess - offset2 * 60000;
  return new Date(utc2);
}

function addDaysYmd(year: number, month: number, day: number, deltaDays: number) {
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function weekdayIndexInTimeZone(date: Date, timeZone: string) {
  const label = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(date);
  switch (label) {
    case "Mon":
      return 1;
    case "Tue":
      return 2;
    case "Wed":
      return 3;
    case "Thu":
      return 4;
    case "Fri":
      return 5;
    case "Sat":
      return 6;
    default:
      return 0;
  }
}

export function startOfIsoWeekUtc(reference: Date, timeZone?: string | null) {
  const tz = safeTimeZone(timeZone);
  const local = partsFromDateInTimeZone(reference, tz);
  const weekday = weekdayIndexInTimeZone(reference, tz);
  const daysToSubtract = (weekday + 6) % 7;
  const ymd = addDaysYmd(local.year, local.month, local.day, -daysToSubtract);
  return zonedTimeToUtc({ ...ymd, hour: 0, minute: 0, second: 0 }, tz);
}

export function startOfNextIsoWeekUtc(reference: Date, timeZone?: string | null) {
  const tz = safeTimeZone(timeZone);
  const start = startOfIsoWeekUtc(reference, tz);
  const localStart = partsFromDateInTimeZone(start, tz);
  const next = addDaysYmd(localStart.year, localStart.month, localStart.day, 7);
  return zonedTimeToUtc({ ...next, hour: 0, minute: 0, second: 0 }, tz);
}

export function isoWeekKey(reference: Date, timeZone?: string | null) {
  const tz = safeTimeZone(timeZone);
  const start = startOfIsoWeekUtc(reference, tz);
  const localStart = partsFromDateInTimeZone(start, tz);
  const yyyy = String(localStart.year).padStart(4, "0");
  const mm = String(localStart.month).padStart(2, "0");
  const dd = String(localStart.day).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
