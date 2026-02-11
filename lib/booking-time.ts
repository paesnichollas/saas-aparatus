export const BOOKING_TIMEZONE = "America/Sao_Paulo";
export const BOOKING_SLOT_BUFFER_MINUTES = 5;

type DateOnlyParts = {
  year: number;
  month: number;
  day: number;
};

type ZonedDateTimeParts = DateOnlyParts & {
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
};

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;

const dateTimeFormatterCache = new Map<string, Intl.DateTimeFormat>();

const padNumber = (value: number, size: number) => {
  return String(value).padStart(size, "0");
};

const isValidDateOnlyParts = ({ year, month, day }: DateOnlyParts) => {
  if (!Number.isInteger(year) || year < 1) {
    return false;
  }

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return false;
  }

  if (!Number.isInteger(day) || day < 1 || day > 31) {
    return false;
  }

  const utcDate = new Date(Date.UTC(year, month - 1, day));
  return (
    utcDate.getUTCFullYear() === year &&
    utcDate.getUTCMonth() + 1 === month &&
    utcDate.getUTCDate() === day
  );
};

const isValidZonedDateTimeParts = ({
  year,
  month,
  day,
  hour,
  minute,
  second,
  millisecond,
}: ZonedDateTimeParts) => {
  if (!isValidDateOnlyParts({ year, month, day })) {
    return false;
  }

  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    return false;
  }

  if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
    return false;
  }

  if (!Number.isInteger(second) || second < 0 || second > 59) {
    return false;
  }

  if (!Number.isInteger(millisecond) || millisecond < 0 || millisecond > 999) {
    return false;
  }

  return true;
};

const parseDateOnlyParts = (value: string): DateOnlyParts | null => {
  const match = value.match(DATE_ONLY_PATTERN);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = { year, month, day };

  return isValidDateOnlyParts(parsed) ? parsed : null;
};

const getDateTimeFormatter = (timeZone: string) => {
  const cachedFormatter = dateTimeFormatterCache.get(timeZone);
  if (cachedFormatter) {
    return cachedFormatter;
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  dateTimeFormatterCache.set(timeZone, formatter);
  return formatter;
};

const getDateTimePartsInTimeZone = (date: Date, timeZone: string) => {
  const parts = getDateTimeFormatter(timeZone).formatToParts(date);
  const partByType = parts.reduce<Record<string, string>>((accumulator, part) => {
    if (part.type !== "literal") {
      accumulator[part.type] = part.value;
    }
    return accumulator;
  }, {});

  const year = Number(partByType.year);
  const month = Number(partByType.month);
  const day = Number(partByType.day);
  const hour = Number(partByType.hour);
  const minute = Number(partByType.minute);
  const second = Number(partByType.second);

  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    Number.isNaN(second)
  ) {
    throw new Error("Nao foi possivel obter partes de data/hora no timezone.");
  }

  return { year, month, day, hour, minute, second };
};

const getTimeZoneOffsetInMinutes = (date: Date, timeZone: string) => {
  const parts = getDateTimePartsInTimeZone(date, timeZone);
  const utcTimeFromParts = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    0,
  );

  return Math.round((utcTimeFromParts - date.getTime()) / 60_000);
};

const zonedDateTimeToUtc = (parts: ZonedDateTimeParts, timeZone: string): Date => {
  if (!isValidZonedDateTimeParts(parts)) {
    throw new Error("Partes de data/hora invalidas.");
  }

  const utcGuess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond,
  );

  const firstOffset = getTimeZoneOffsetInMinutes(new Date(utcGuess), timeZone);
  const firstPassDate = new Date(utcGuess - firstOffset * 60_000);

  const secondOffset = getTimeZoneOffsetInMinutes(firstPassDate, timeZone);
  if (secondOffset !== firstOffset) {
    return new Date(utcGuess - secondOffset * 60_000);
  }

  return firstPassDate;
};

const getDateKeyFromParts = ({ year, month, day }: DateOnlyParts) => {
  return `${padNumber(year, 4)}-${padNumber(month, 2)}-${padNumber(day, 2)}`;
};

const addDaysToDateKey = (dateKey: string, days: number) => {
  const parts = parseDateOnlyParts(dateKey);
  if (!parts) {
    return null;
  }

  const utcDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return getDateKeyFromParts({
    year: utcDate.getUTCFullYear(),
    month: utcDate.getUTCMonth() + 1,
    day: utcDate.getUTCDate(),
  });
};

const getBookingDayOfWeekFromDateKey = (dateKey: string) => {
  const parts = parseDateOnlyParts(dateKey);
  if (!parts) {
    return null;
  }

  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
};

export const getBookingDateKey = (date: Date) => {
  const parts = getDateTimePartsInTimeZone(date, BOOKING_TIMEZONE);
  return getDateKeyFromParts(parts);
};

export const getBookingMinuteOfDay = (date: Date) => {
  const parts = getDateTimePartsInTimeZone(date, BOOKING_TIMEZONE);
  return parts.hour * 60 + parts.minute;
};

export const isSameBookingDay = (left: Date, right: Date) => {
  return getBookingDateKey(left) === getBookingDateKey(right);
};

export const parseBookingDateOnly = (value: string): Date | null => {
  const normalizedValue = value.trim();
  const parsedParts = parseDateOnlyParts(normalizedValue);
  if (!parsedParts) {
    return null;
  }

  let parsedDate: Date;
  try {
    parsedDate = zonedDateTimeToUtc(
      {
        ...parsedParts,
        hour: 0,
        minute: 0,
        second: 0,
        millisecond: 0,
      },
      BOOKING_TIMEZONE,
    );
  } catch {
    return null;
  }

  return getBookingDateKey(parsedDate) === normalizedValue ? parsedDate : null;
};

export const parseBookingDateTime = (value: string): Date | null => {
  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return null;
  }

  const localDateTimeMatch = normalizedValue.match(LOCAL_DATE_TIME_PATTERN);
  if (localDateTimeMatch) {
    const year = Number(localDateTimeMatch[1]);
    const month = Number(localDateTimeMatch[2]);
    const day = Number(localDateTimeMatch[3]);
    const hour = Number(localDateTimeMatch[4]);
    const minute = Number(localDateTimeMatch[5]);
    const second = Number(localDateTimeMatch[6] ?? "0");
    const millisecond = Number((localDateTimeMatch[7] ?? "0").padEnd(3, "0"));

    const zonedDateTimeParts = {
      year,
      month,
      day,
      hour,
      minute,
      second,
      millisecond,
    };
    if (!isValidZonedDateTimeParts(zonedDateTimeParts)) {
      return null;
    }

    let parsedDate: Date;
    try {
      parsedDate = zonedDateTimeToUtc(zonedDateTimeParts, BOOKING_TIMEZONE);
    } catch {
      return null;
    }

    const parsedParts = getDateTimePartsInTimeZone(parsedDate, BOOKING_TIMEZONE);
    const expectedDateKey = getDateKeyFromParts({ year, month, day });
    const parsedDateKey = getDateKeyFromParts(parsedParts);

    if (
      expectedDateKey !== parsedDateKey ||
      parsedParts.hour !== hour ||
      parsedParts.minute !== minute ||
      parsedParts.second !== second
    ) {
      return null;
    }

    return parsedDate;
  }

  const parsedDate = new Date(normalizedValue);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate;
};

export const getBookingDayBounds = (date: Date) => {
  const dateKey = getBookingDateKey(date);
  const start = parseBookingDateOnly(dateKey);
  if (!start) {
    throw new Error("Nao foi possivel calcular o inicio do dia de reserva.");
  }

  const nextDateKey = addDaysToDateKey(dateKey, 1);
  if (!nextDateKey) {
    throw new Error("Nao foi possivel calcular o proximo dia da reserva.");
  }

  const endExclusive = parseBookingDateOnly(nextDateKey);
  if (!endExclusive) {
    throw new Error("Nao foi possivel calcular o fim do dia de reserva.");
  }

  const dayOfWeek = getBookingDayOfWeekFromDateKey(dateKey);
  if (dayOfWeek === null) {
    throw new Error("Nao foi possivel calcular o dia da semana da reserva.");
  }

  return {
    dateKey,
    dayOfWeek,
    start,
    endExclusive,
  };
};

export const isBookingDateTimeAtOrBeforeNowWithBuffer = (
  date: Date,
  bufferMinutes = BOOKING_SLOT_BUFFER_MINUTES,
  now = new Date(),
) => {
  return date.getTime() <= now.getTime() + bufferMinutes * 60_000;
};
