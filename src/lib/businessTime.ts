export const BUSINESS_TIME_ZONE = "Asia/Kolkata";

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function toDate(input: string | number | Date): Date {
  return input instanceof Date ? input : new Date(input);
}

function formatDateParts(date: Date): string {
  const parts = dateFormatter.formatToParts(date);
  const year = parts.find(p => p.type === "year")?.value;
  const month = parts.find(p => p.type === "month")?.value;
  const day = parts.find(p => p.type === "day")?.value;
  if (!year || !month || !day) return "";
  return `${year}-${month}-${day}`;
}

export function toBusinessDateString(input?: string | number | Date | null): string {
  if (input === null || input === undefined || input === "") return "";
  const date = toDate(input);
  if (Number.isNaN(date.getTime())) return "";
  return formatDateParts(date);
}

export function toBusinessMonthString(input?: string | number | Date | null): string {
  const dateString = toBusinessDateString(input);
  return dateString ? dateString.slice(0, 7) : "";
}

export function getCurrentBusinessDateString(): string {
  return toBusinessDateString(new Date());
}

export function getCurrentBusinessMonthString(): string {
  return getCurrentBusinessDateString().slice(0, 7);
}

export function isWithinBusinessDateRange(
  input: string | number | Date | null | undefined,
  start: string,
  end: string
): boolean {
  if (!start || !end) return false;
  const dateString = toBusinessDateString(input);
  return Boolean(dateString && dateString >= start && dateString <= end);
}
