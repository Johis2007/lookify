/** Colombia (Bogotá): UTC−5 fijo, sin horario de verano. No usar zona del celular ni Intl. */

const BOGOTA_UTC_OFFSET_MS = 5 * 60 * 60 * 1000;

export type BogotaParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

export function bogotaPartsFromUtcMs(utcMs: number): BogotaParts {
  const shifted = utcMs - BOGOTA_UTC_OFFSET_MS;
  const d = new Date(shifted);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth(),
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  };
}

/** Instant UTC (ms) de medianoche Bogotá para la fecha civil dada. */
export function bogotaMidnightUtcMs(year: number, month: number, day: number): number {
  return Date.UTC(year, month, day, 5, 0, 0, 0);
}

export function startOfDayBogotaUtcMs(utcMs: number): number {
  const p = bogotaPartsFromUtcMs(utcMs);
  return bogotaMidnightUtcMs(p.year, p.month, p.day);
}

export function endOfDayBogotaUtcMs(utcMs: number): number {
  return startOfDayBogotaUtcMs(utcMs) + 24 * 60 * 60 * 1000 - 1;
}

/** 0 = lunes … 6 = domingo (calendario Bogotá). */
export function dayOfWeekMondayZeroBogota(utcMs: number): number {
  const p = bogotaPartsFromUtcMs(utcMs);
  const sundayZero = new Date(Date.UTC(p.year, p.month, p.day)).getUTCDay();
  return (sundayZero + 6) % 7;
}

export function startOfWeekBogotaUtcMs(utcMs: number): number {
  const startDay = startOfDayBogotaUtcMs(utcMs);
  const dow = dayOfWeekMondayZeroBogota(utcMs);
  return startDay - dow * 24 * 60 * 60 * 1000;
}

export function endOfWeekBogotaUtcMs(utcMs: number): number {
  return startOfWeekBogotaUtcMs(utcMs) + 7 * 24 * 60 * 60 * 1000 - 1;
}

export function startOfMonthBogotaUtcMs(utcMs: number): number {
  const p = bogotaPartsFromUtcMs(utcMs);
  return bogotaMidnightUtcMs(p.year, p.month, 1);
}

export function endOfMonthBogotaUtcMs(utcMs: number): number {
  const p = bogotaPartsFromUtcMs(utcMs);
  const lastDay = new Date(Date.UTC(p.year, p.month + 1, 0)).getUTCDate();
  return bogotaMidnightUtcMs(p.year, p.month, lastDay) + 24 * 60 * 60 * 1000 - 1;
}

const MESES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

export function formatFechaHoraBogota(utcMs: number): string {
  const p = bogotaPartsFromUtcMs(utcMs);
  const hh = String(p.hour).padStart(2, '0');
  const mm = String(p.minute).padStart(2, '0');
  const mes = MESES[p.month] ?? '???';
  return `${p.day} ${mes} ${p.year}, ${hh}:${mm}`;
}
