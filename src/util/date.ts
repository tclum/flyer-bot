export interface DerivedDateParts {
  weekday: string;
  weekdayShort: string;
  monthName: string;
  monthShort: string;
  day: number;
  year: number;
  formattedDate: string;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Derives weekday/month/day labels from a YYYY-MM-DD string so the model
 * never has to do calendar math. `day` and `year` come directly from the
 * parsed digits; weekday and month names come from Intl.DateTimeFormat
 * anchored at noon UTC, which is safely within the same calendar date for
 * every IANA timezone except the far-eastern edge (UTC+13/14).
 */
export function deriveDateParts(isoDate: string, timeZone: string): DerivedDateParts {
  const match = ISO_DATE.exec(isoDate);
  if (!match) {
    throw new Error(`expected YYYY-MM-DD, got ${JSON.stringify(isoDate)}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const anchor = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

  const fmt = (opts: Intl.DateTimeFormatOptions): string =>
    new Intl.DateTimeFormat("en-US", { timeZone, ...opts }).format(anchor);

  const weekday = fmt({ weekday: "long" });
  const weekdayShort = fmt({ weekday: "short" });
  const monthName = fmt({ month: "long" });
  const monthShort = fmt({ month: "short" });

  return {
    weekday,
    weekdayShort,
    monthName,
    monthShort,
    day,
    year,
    formattedDate: `${weekdayShort}, ${monthShort} ${day}`,
  };
}
