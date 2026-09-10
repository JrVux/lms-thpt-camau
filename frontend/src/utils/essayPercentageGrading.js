const bounded = (value, minimum, maximum, label) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) throw new Error(`${label} không hợp lệ.`);
  return number;
};

export const scoreFromPercentage = (maxScore, percentage) => {
  const maximum = bounded(maxScore, Number.EPSILON, Number.MAX_SAFE_INTEGER, 'Điểm tối đa');
  const percent = bounded(percentage, 0, 100, 'Phần trăm');
  return Number((maximum * percent / 100).toFixed(1));
};

export const percentageFromScore = (maxScore, score) => {
  const maximum = bounded(maxScore, Number.EPSILON, Number.MAX_SAFE_INTEGER, 'Điểm tối đa');
  const reviewedScore = bounded(score, 0, maximum, 'Điểm');
  return Number((reviewedScore * 100 / maximum).toFixed(1));
};
