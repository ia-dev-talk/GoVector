export function linearRegression(points, valueKey = 'total') {
  const values = points
    .map((point, index) => ({ x: index, y: Number(point?.[valueKey]) }))
    .filter((point) => Number.isFinite(point.y));

  if (values.length < 2) {
    return { slope: 0, intercept: values[0]?.y ?? 0, r2: null, sampleSize: values.length, direction: 'stable' };
  }

  const count = values.length;
  const meanX = values.reduce((sum, point) => sum + point.x, 0) / count;
  const meanY = values.reduce((sum, point) => sum + point.y, 0) / count;
  const covariance = values.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0);
  const varianceX = values.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0);
  const slope = varianceX === 0 ? 0 : covariance / varianceX;
  const intercept = meanY - slope * meanX;
  const totalVariance = values.reduce((sum, point) => sum + (point.y - meanY) ** 2, 0);
  const residualVariance = values.reduce((sum, point) => {
    const predicted = intercept + slope * point.x;
    return sum + (point.y - predicted) ** 2;
  }, 0);
  const r2 = totalVariance === 0 ? 1 : Math.max(0, Math.min(1, 1 - residualVariance / totalVariance));
  const epsilon = 0.05;

  return {
    slope,
    intercept,
    r2,
    sampleSize: count,
    direction: slope > epsilon ? 'up' : slope < -epsilon ? 'down' : 'stable',
  };
}
