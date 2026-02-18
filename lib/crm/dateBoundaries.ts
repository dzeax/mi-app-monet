const MADRID_TIME_ZONE = "Europe/Madrid";

const getDatePartsInTimeZone = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error(`Unable to resolve date parts for time zone ${timeZone}`);
  }
  return { year, month, day };
};

export const getTodayIsoInTimeZone = (timeZone: string) => {
  const { year, month, day } = getDatePartsInTimeZone(new Date(), timeZone);
  return `${year}-${month}-${day}`;
};

export const getTodayIsoInMadrid = () => getTodayIsoInTimeZone(MADRID_TIME_ZONE);
