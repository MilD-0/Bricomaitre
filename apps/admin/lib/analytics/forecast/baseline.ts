export function weightedAverage(values: number[]) {
  if (!values.length) return null;
  const denominator = values.reduce((sum, _value, index) => sum + index + 1, 0);
  return values.reduce((sum, value, index) => sum + value * (index + 1), 0) / denominator;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function robustWeightedAverage(values: number[]) {
  const center = median(values);
  if (center == null) return null;
  const deviation = median(values.map((value) => Math.abs(value - center))) ?? 0;
  const radius = deviation * 1.4826 * 3;
  const bounded = values.map((value) =>
    radius === 0 ? center : Math.min(center + radius, Math.max(center - radius, value)),
  );
  return weightedAverage(bounded);
}

type ForecastBaselineMethod = 'weekday' | 'seasonal-blend';

type HistoricalEconomicsDay = {
  date: string;
  trueProfitDzd: number;
  postedOrders: number;
  grossProfitDzd: number | null;
  adjustedProfitDzd: number | null;
  adCostDzd: number | null;
};

export function baselineValue(
  history: HistoricalEconomicsDay[],
  date: string,
  read: (day: HistoricalEconomicsDay) => number | null,
  method: ForecastBaselineMethod,
) {
  const values = (rows: HistoricalEconomicsDay[]) =>
    rows.flatMap((day) => {
      const value = read(day);
      return value == null ? [] : [value];
    });
  const recent = robustWeightedAverage(values(history.slice(-14)));
  const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  const sameWeekdayRows = history
    .filter((day) => new Date(`${day.date}T00:00:00.000Z`).getUTCDay() === weekday)
    .slice(-8);
  const sameWeekday =
    sameWeekdayRows.length >= 2 ? robustWeightedAverage(values(sameWeekdayRows)) : null;
  if (method === 'weekday') return sameWeekday ?? recent;
  if (sameWeekday == null) return recent;
  if (recent == null) return sameWeekday;
  return sameWeekday * 0.65 + recent * 0.35;
}

export function chooseBaselineMethod(completed: HistoricalEconomicsDay[]): ForecastBaselineMethod {
  if (completed.length < 21) return 'seasonal-blend';
  const candidates: ForecastBaselineMethod[] = ['weekday', 'seasonal-blend'];
  const validationStart = Math.max(14, completed.length - 21);
  const scores = candidates.map((method) => {
    let absoluteError = 0;
    let observations = 0;
    for (let index = validationStart; index < completed.length; index += 1) {
      const actual = completed[index]!;
      const forecast = baselineValue(
        completed.slice(0, index),
        actual.date,
        (day) => day.trueProfitDzd,
        method,
      );
      if (forecast == null) continue;
      absoluteError += Math.abs(actual.trueProfitDzd - forecast);
      observations += 1;
    }
    return { method, error: observations > 0 ? absoluteError / observations : Infinity };
  });
  return scores.sort((left, right) => left.error - right.error)[0]!.method;
}

export function robustDeviation(values: number[]) {
  const center = median(values);
  if (values.length < 2 || center == null) return 0;
  return (median(values.map((value) => Math.abs(value - center))) ?? 0) * 1.4826;
}
