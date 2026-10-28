/** Five-field POSIX cron: minute hour day-of-month month day-of-week. */

export interface CronFields {
  minute: number[];
  hour: number[];
  dayOfMonth: number[];
  month: number[];
  dayOfWeek: number[];
}

const RANGES: [number, number][] = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 6],
];

function expand(field: string, [min, max]: [number, number]): number[] {
  const values = new Set<number>();
  for (const part of field.split(",")) {
    const [range, stepText] = part.split("/");
    const step = stepText === undefined ? 1 : Number(stepText);
    if (!Number.isInteger(step) || step < 1) {
      throw new Error(`invalid step in "${part}"`);
    }
    let low = min;
    let high = max;
    if (range !== "*") {
      const [from, to] = range!.split("-");
      low = Number(from);
      high = to === undefined ? (stepText === undefined ? low : max) : Number(to);
      if (
        !Number.isInteger(low) ||
        !Number.isInteger(high) ||
        low < min ||
        high > max ||
        low > high
      ) {
        throw new Error(`"${part}" is outside ${min}-${max}`);
      }
    }
    for (let value = low; value <= high; value += step) values.add(value);
  }
  return [...values].sort((a, b) => a - b);
}

export function parseCron(expression: string): CronFields {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`schedule "${expression}" has ${parts.length} fields, expected 5`);
  }
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts.map((part, i) =>
    expand(part, RANGES[i]!),
  );
  return {
    minute: minute!,
    hour: hour!,
    dayOfMonth: dayOfMonth!,
    month: month!,
    dayOfWeek: dayOfWeek!,
  };
}

/**
 * POSIX semantics: when both day fields are restricted, a date matching either
 * one fires. When one is a wildcard, the other decides.
 */
export function matches(fields: CronFields, date: Date): boolean {
  if (!fields.minute.includes(date.getUTCMinutes())) return false;
  if (!fields.hour.includes(date.getUTCHours())) return false;
  if (!fields.month.includes(date.getUTCMonth() + 1)) return false;

  const dom = fields.dayOfMonth.includes(date.getUTCDate());
  const dow = fields.dayOfWeek.includes(date.getUTCDay());
  const domRestricted = fields.dayOfMonth.length !== 31;
  const dowRestricted = fields.dayOfWeek.length !== 7;
  if (domRestricted && dowRestricted) return dom || dow;
  return dom && dow;
}

/** The slot is the scheduled UTC minute, truncated — the unit of de-duplication. */
export function slotFor(date: Date): string {
  const copy = new Date(date);
  copy.setUTCSeconds(0, 0);
  return copy.toISOString();
}
