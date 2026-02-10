export type MinuteInterval = {
  startMinute: number;
  endMinute: number;
};

export const toMinuteOfDay = (date: Date) =>
  date.getHours() * 60 + date.getMinutes();

export const hasMinuteIntervalOverlap = (
  startMinute: number,
  durationInMinutes: number,
  intervals: MinuteInterval[],
) => {
  const endMinute = startMinute + durationInMinutes;
  return intervals.some(
    (interval) =>
      startMinute < interval.endMinute && endMinute > interval.startMinute,
  );
};

export const toTimeSlotLabel = (minute: number) => {
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};
