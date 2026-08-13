import {
  addDays,
  asRecords,
  localDateKey,
  normalizeToken,
  startOfLocalDay,
} from './reportUtils.js';


function jobDate(job) {
  const candidates = [
    job?.completed_at,
    job?.ended_at,
    job?.closed_at,
    job?.scheduled_at,
    job?.scheduled_date,
    job?.planned_date,
    job?.created_at,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const parsed = candidate instanceof Date ? candidate : new Date(candidate);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return null;
}


export function linearRegression(points, valueKey = 'total') {
  const values = points
    .map((point, index) => ({ x: index, y: Number(point?.[valueKey]) }))
    .filter((point) => Number.isFinite(point.y));

  if (values.length < 2) {
    return {
      slope: 0,
      intercept: values[0]?.y ?? 0,
      r2: null,
      sampleSize: values.length,
      direction: 'stable',
    };
  }

  const count = values.length;
  const meanX = values.reduce((sum, point) => sum + point.x, 0) / count;
  const meanY = values.reduce((sum, point) => sum + point.y, 0) / count;
  const covariance = values.reduce(
    (sum, point) => sum + (point.x - meanX) * (point.y - meanY),
    0,
  );
  const varianceX = values.reduce(
    (sum, point) => sum + (point.x - meanX) ** 2,
    0,
  );
  const slope = varianceX === 0 ? 0 : covariance / varianceX;
  const intercept = meanY - slope * meanX;
  const totalVariance = values.reduce(
    (sum, point) => sum + (point.y - meanY) ** 2,
    0,
  );
  const residualVariance = values.reduce((sum, point) => {
    const predicted = intercept + slope * point.x;
    return sum + (point.y - predicted) ** 2;
  }, 0);
  const r2 = totalVariance === 0
    ? 1
    : Math.max(0, Math.min(1, 1 - residualVariance / totalVariance));
  const epsilon = 0.05;

  return {
    slope,
    intercept,
    r2,
    sampleSize: count,
    direction: slope > epsilon ? 'up' : slope < -epsilon ? 'down' : 'stable',
  };
}


export function buildDailySeries(jobs, range) {
  const start = startOfLocalDay(range.start);
  const end = startOfLocalDay(range.end);
  const buckets = new Map();

  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    const key = localDateKey(cursor);
    buckets.set(key, {
      key,
      date: new Date(cursor),
      total: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    });
  }

  asRecords(jobs).forEach((job) => {
    const date = jobDate(job);
    if (!date) return;
    const bucket = buckets.get(localDateKey(date));
    if (!bucket) return;

    bucket.total += 1;
    const status = normalizeToken(job?.status);
    if (status === 'completed') bucket.completed += 1;
    if (status === 'failed') bucket.failed += 1;
    if (status === 'cancelled') bucket.cancelled += 1;
  });

  return [...buckets.values()].map((bucket) => {
    const terminal = bucket.completed + bucket.failed + bucket.cancelled;
    return {
      ...bucket,
      successRate: terminal > 0 ? bucket.completed / terminal * 100 : null,
    };
  });
}


export function buildTrendAnalytics(jobs, range) {
  const daily = buildDailySeries(jobs, range);
  const volume = linearRegression(daily, 'total');
  const completed = linearRegression(daily, 'completed');
  const nonEmptyDays = daily.filter((point) => point.total > 0).length;

  return {
    daily,
    volume,
    completed,
    nonEmptyDays,
    canInterpret: daily.length >= 3 && nonEmptyDays >= 2,
  };
}


export function trendExplanation(trend, noun = 'volume') {
  if (!trend || trend.sampleSize < 2) {
    return `Pas assez de données pour estimer la tendance du ${noun}.`;
  }

  if (trend.direction === 'stable') {
    return `Le ${noun} est globalement stable sur la période.`;
  }

  const amount = new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: 2,
  }).format(Math.abs(trend.slope));

  return trend.direction === 'up'
    ? `Le ${noun} augmente d’environ ${amount} intervention(s) par jour selon la tendance linéaire.`
    : `Le ${noun} diminue d’environ ${amount} intervention(s) par jour selon la tendance linéaire.`;
}
