import { BadRequestException } from "./errors/bad-request.error.js";

export type DateOnlyString = `${number}-${number}-${number}`;
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;

const utcCalendarDate = (year: number, month: number, day: number): Date => {
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date;
};

export const isDateOnlyString = (value: string): value is DateOnlyString => {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || year > 9999) return false;
  const date = utcCalendarDate(year, month, day);
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

export const parseDateOnly = (value: string): Date => {
  if (!isDateOnlyString(value)) {
    throw new BadRequestException(
      "Date must be a real YYYY-MM-DD calendar date.",
    );
  }
  const match = DATE_ONLY_PATTERN.exec(value);
  if (match === null) {
    throw new BadRequestException("Date must use YYYY-MM-DD format.");
  }
  return utcCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]));
};

export const serializeDateOnly = (value: Date): DateOnlyString => {
  const serialized = [
    value.getUTCFullYear().toString().padStart(4, "0"),
    (value.getUTCMonth() + 1).toString().padStart(2, "0"),
    value.getUTCDate().toString().padStart(2, "0"),
  ].join("-");
  if (!isDateOnlyString(serialized)) {
    throw new BadRequestException("Unable to serialize an invalid date.");
  }
  return serialized;
};

export const serializeNullableDateOnly = (
  value: Date | null,
): DateOnlyString | null => (value === null ? null : serializeDateOnly(value));
