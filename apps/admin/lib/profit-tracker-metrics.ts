export type ProfitTrackerSettings = {
  fxRate: number;
  defaultReturnRate: number;
  restFrom: string | null;
};

export type ProfitTrackerDayInput = {
  date: string;
  spendEur: number | null;
  impressions?: number | null;
  fbPurchases: number | null;
  cpm: number | null;
  ctr: number | null;
  linkClicks: number | null;
  landingPageViews: number | null;
  grossProfitDzd: number | null;
  returnRatePct: number | null;
  confirmedOrders: number | null;
  note: string | null;
  fxRateUsed: number | null;
  metaSyncedAt?: string | null;
  grossProfitSource?: 'manual' | 'automatic' | 'missing';
  returnRateSource?: 'manual' | 'default' | 'missing';
  confirmedOrdersSource?: 'manual' | 'automatic' | 'missing';
  postedOrders?: number;
  costCompleteOrders?: number;
  projectedCoveragePct?: number | null;
};

export type ProfitTrackerMetrics = {
  adCostDzd: number | null;
  adjustedProfitDzd: number | null;
  netProfitDzd: number | null;
  profitX: number | null;
  netProfitBeforeReturnsDzd: number | null;
  profitXBeforeReturns: number | null;
  costPerConfirmedDzd: number | null;
  confirmationRatePct: number | null;
  clickToPageRatePct: number | null;
};

export type ProfitTrackerDay = ProfitTrackerDayInput & {
  metrics: ProfitTrackerMetrics;
  isRestDay: boolean;
  rolledInDzd: number;
  rolledOutDzd: number;
};

export type ProfitTrackerOperatingCost = {
  id?: number;
  name: string;
  amountDzd: number;
  period: 'monthly' | 'once';
  startDate: string;
  endDate: string | null;
};

export type ProfitTrackerSummary = {
  spendEur: number;
  impressions: number;
  rawAdCostDzd: number;
  ratioAdCostDzd: number;
  grossProfitDzd: number;
  adjustedProfitDzd: number;
  netProfitDzd: number;
  operatingCostDzd: number;
  trueProfitDzd: number;
  profitX: number | null;
  profitXBeforeReturns: number | null;
  confirmedOrders: number;
  fbPurchases: number;
  costPerConfirmedDzd: number | null;
  confirmationRatePct: number | null;
  clickToPageRatePct: number | null;
  postedOrders: number;
  costCompleteOrders: number;
  projectedCoveragePct: number | null;
};

export type ProfitTrackerWeek = {
  weekStart: string;
  trackedDays: number;
  spendEur: number;
  adCostDzd: number;
  adjustedProfitDzd: number;
  netProfitDzd: number;
  operatingCostDzd: number;
  trueProfitDzd: number;
  profitX: number | null;
};

function isNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseDateParts(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return { year, month, day };
}

function toUtcDate(date: string) {
  const { year, month, day } = parseDateParts(date);
  return new Date(Date.UTC(year, month - 1, day));
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: string, amount: number) {
  const value = toUtcDate(date);
  value.setUTCDate(value.getUTCDate() + amount);
  return isoDate(value);
}

function isFriday(date: string) {
  return toUtcDate(date).getUTCDay() === 5;
}

function daysInMonth(date: string) {
  const { year, month } = parseDateParts(date);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function fridayWeekStart(date: string) {
  const value = toUtcDate(date);
  const offset = (value.getUTCDay() - 5 + 7) % 7;
  value.setUTCDate(value.getUTCDate() - offset);
  return isoDate(value);
}

export function computeProfitTrackerMetrics(
  day: ProfitTrackerDayInput,
  fallbackFxRate: number,
  extraAdCostDzd = 0,
): ProfitTrackerMetrics {
  const fxRate = day.fxRateUsed || fallbackFxRate;
  let adCostDzd: number | null;

  if (isNumber(day.spendEur)) {
    adCostDzd = day.spendEur * fxRate + extraAdCostDzd;
  } else if (extraAdCostDzd) {
    adCostDzd = extraAdCostDzd;
  } else {
    adCostDzd = null;
  }

  const adjustedProfitDzd =
    isNumber(day.grossProfitDzd) && isNumber(day.returnRatePct)
      ? day.grossProfitDzd * (1 - day.returnRatePct / 100)
      : null;
  const netProfitDzd =
    adjustedProfitDzd !== null && adCostDzd !== null ? adjustedProfitDzd - adCostDzd : null;
  const profitX = adjustedProfitDzd !== null && adCostDzd ? adjustedProfitDzd / adCostDzd : null;
  const netProfitBeforeReturnsDzd =
    isNumber(day.grossProfitDzd) && adCostDzd !== null ? day.grossProfitDzd - adCostDzd : null;
  const profitXBeforeReturns =
    isNumber(day.grossProfitDzd) && adCostDzd ? day.grossProfitDzd / adCostDzd : null;
  const costPerConfirmedDzd =
    adCostDzd !== null && day.confirmedOrders ? adCostDzd / day.confirmedOrders : null;
  const confirmationRatePct =
    isNumber(day.confirmedOrders) && day.fbPurchases
      ? (day.confirmedOrders / day.fbPurchases) * 100
      : null;
  const clickToPageRatePct =
    isNumber(day.landingPageViews) && day.linkClicks
      ? (day.landingPageViews / day.linkClicks) * 100
      : null;

  return {
    adCostDzd,
    adjustedProfitDzd,
    netProfitDzd,
    profitX,
    netProfitBeforeReturnsDzd,
    profitXBeforeReturns,
    costPerConfirmedDzd,
    confirmationRatePct,
    clickToPageRatePct,
  };
}

export function applyProfitTrackerRollforward(
  days: ProfitTrackerDayInput[],
  settings: Pick<ProfitTrackerSettings, 'fxRate' | 'restFrom'>,
): ProfitTrackerDay[] {
  const ascending = [...days].sort((left, right) => left.date.localeCompare(right.date));
  let carryDzd = 0;

  return ascending
    .map((day) => {
      const fxRate = day.fxRateUsed || settings.fxRate;
      const restDay = Boolean(
        settings.restFrom &&
        day.date >= settings.restFrom &&
        isFriday(day.date) &&
        day.grossProfitDzd == null &&
        day.confirmedOrders == null,
      );

      if (restDay) {
        const rolledOutDzd = (day.spendEur || 0) * fxRate;
        carryDzd += rolledOutDzd;
        const metrics = computeProfitTrackerMetrics(day, settings.fxRate);
        metrics.adCostDzd = 0;
        metrics.netProfitDzd =
          metrics.adjustedProfitDzd === null ? null : metrics.adjustedProfitDzd;
        metrics.profitX = null;
        metrics.costPerConfirmedDzd = null;
        return {
          ...day,
          metrics,
          isRestDay: true,
          rolledInDzd: 0,
          rolledOutDzd,
        };
      }

      const rolledInDzd = carryDzd;
      carryDzd = 0;
      return {
        ...day,
        metrics: computeProfitTrackerMetrics(day, settings.fxRate, rolledInDzd),
        isRestDay: false,
        rolledInDzd,
        rolledOutDzd: 0,
      };
    })
    .reverse();
}

export function operatingCostForDay(date: string, costs: readonly ProfitTrackerOperatingCost[]) {
  return costs.reduce((total, cost) => {
    if (cost.period === 'monthly') {
      const isActive = cost.startDate <= date && (!cost.endDate || date <= cost.endDate);
      return isActive ? total + cost.amountDzd / daysInMonth(date) : total;
    }

    return cost.startDate === date ? total + cost.amountDzd : total;
  }, 0);
}

export function operatingCostBetween(
  startDate: string,
  endDate: string,
  costs: readonly ProfitTrackerOperatingCost[],
) {
  if (startDate > endDate) return 0;
  let total = 0;
  for (let date = startDate; date <= endDate; date = addDays(date, 1)) {
    total += operatingCostForDay(date, costs);
  }
  return total;
}

export function summarizeProfitTracker(
  days: readonly ProfitTrackerDay[],
  costs: readonly ProfitTrackerOperatingCost[],
  startDate: string | null,
  endDate: string | null,
): ProfitTrackerSummary {
  const completeDays = days.filter((day) => day.metrics.adjustedProfitDzd !== null);
  const spendEur = days.reduce((total, day) => total + (day.spendEur || 0), 0);
  const impressions = days.reduce((total, day) => total + (day.impressions || 0), 0);
  const rawAdCostDzd = days.reduce(
    (total, day) => total + (day.spendEur || 0) * (day.fxRateUsed || 0),
    0,
  );
  const ratioAdCostDzd = days.reduce(
    (total, day) => total + (day.metrics.adCostDzd || 0),
    0,
  );
  const grossProfitDzd = completeDays.reduce((total, day) => total + (day.grossProfitDzd || 0), 0);
  const adjustedProfitDzd = completeDays.reduce(
    (total, day) => total + (day.metrics.adjustedProfitDzd || 0),
    0,
  );
  const netProfitDzd = adjustedProfitDzd - ratioAdCostDzd;
  const confirmedOrders = days.reduce(
    (total, day) => total + (day.confirmedOrders || 0),
    0,
  );
  const fbPurchases = days.reduce((total, day) => total + (day.fbPurchases || 0), 0);
  const linkClicks = days.reduce((total, day) => total + (day.linkClicks || 0), 0);
  const landingPageViews = days.reduce(
    (total, day) => total + (day.landingPageViews || 0),
    0,
  );
  const operatingCostDzd =
    startDate && endDate ? operatingCostBetween(startDate, endDate, costs) : 0;
  const beforeReturnsProfitX = ratioAdCostDzd > 0 ? grossProfitDzd / ratioAdCostDzd : null;
  const postedOrders = days.reduce((total, day) => total + (day.postedOrders || 0), 0);
  const costCompleteOrders = days.reduce((total, day) => total + (day.costCompleteOrders || 0), 0);

  return {
    spendEur,
    impressions,
    rawAdCostDzd,
    ratioAdCostDzd,
    grossProfitDzd,
    adjustedProfitDzd,
    netProfitDzd,
    operatingCostDzd,
    trueProfitDzd: netProfitDzd - operatingCostDzd,
    profitX: ratioAdCostDzd > 0 ? adjustedProfitDzd / ratioAdCostDzd : null,
    profitXBeforeReturns: beforeReturnsProfitX,
    confirmedOrders,
    fbPurchases,
    costPerConfirmedDzd:
      confirmedOrders > 0 && ratioAdCostDzd > 0 ? ratioAdCostDzd / confirmedOrders : null,
    confirmationRatePct: fbPurchases > 0 ? (confirmedOrders / fbPurchases) * 100 : null,
    clickToPageRatePct: linkClicks > 0 ? (landingPageViews / linkClicks) * 100 : null,
    postedOrders,
    costCompleteOrders,
    projectedCoveragePct: postedOrders > 0 ? (costCompleteOrders / postedOrders) * 100 : null,
  };
}

export function buildProfitTrackerWeeks(
  days: readonly ProfitTrackerDay[],
  costs: readonly ProfitTrackerOperatingCost[],
  capDate?: string,
): ProfitTrackerWeek[] {
  const weeks = new Map<
    string,
    Omit<ProfitTrackerWeek, 'netProfitDzd' | 'trueProfitDzd' | 'profitX'>
  >();

  for (const day of days) {
    const weekStart = fridayWeekStart(day.date);
    const current = weeks.get(weekStart) ?? {
      weekStart,
      trackedDays: 0,
      spendEur: 0,
      adCostDzd: 0,
      adjustedProfitDzd: 0,
      operatingCostDzd: 0,
    };
    current.trackedDays += 1;
    current.spendEur += day.spendEur || 0;
    current.adCostDzd += (day.spendEur || 0) * (day.fxRateUsed || 0);
    current.adjustedProfitDzd += day.metrics.adjustedProfitDzd || 0;
    weeks.set(weekStart, current);
  }

  return [...weeks.values()]
    .map((week) => {
      const weekEnd = addDays(week.weekStart, 6);
      const costEnd = capDate && capDate < weekEnd ? capDate : weekEnd;
      const operatingCostDzd = operatingCostBetween(week.weekStart, costEnd, costs);
      const netProfitDzd = week.adjustedProfitDzd - week.adCostDzd;
      return {
        ...week,
        operatingCostDzd,
        netProfitDzd,
        trueProfitDzd: netProfitDzd - operatingCostDzd,
        profitX: week.adCostDzd > 0 ? week.adjustedProfitDzd / week.adCostDzd : null,
      };
    })
    .sort((left, right) => right.weekStart.localeCompare(left.weekStart));
}
