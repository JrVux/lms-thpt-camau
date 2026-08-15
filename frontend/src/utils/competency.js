export const MIN_CONFIDENCE = 40;

const toneByLabel = {
  'Chưa hình thành': 'danger',
  'Đang hình thành': 'warning',
  'Đạt': 'info',
  'Thành thạo': 'success',
};

export const displayMastery = ({ mastery, confidence, label }) => {
  if (Number(confidence) < MIN_CONFIDENCE) {
    return { label: 'Chưa đủ dữ liệu', tone: 'neutral', value: null };
  }
  return {
    label,
    tone: toneByLabel[label] ?? 'neutral',
    value: Number(mastery),
  };
};

export const sortCompetencies = (items = []) => [...items]
  .sort((left, right) => String(left.code).localeCompare(String(right.code), 'en'));
