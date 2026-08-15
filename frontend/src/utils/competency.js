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

export const buildMappingPayload = (assignmentId, rows = []) => rows
  .filter((row) => row.competency_id)
  .map((row) => ({
    assignment_id: assignmentId,
    competency_id: row.competency_id,
    test_case_id: row.test_case_id || null,
    difficulty: Number(row.difficulty),
    weight: Number(row.weight),
    status: row.approved ? 'approved' : (row.status ?? 'proposed'),
  }));

export const buildCompetencySummary = (snapshots = []) => snapshots.reduce((summary, item) => {
  const counts = summary[item.competency_id] ?? {
    insufficient: 0, emerging: 0, achieved: 0, mastered: 0,
  };
  if (Number(item.confidence) < MIN_CONFIDENCE) counts.insufficient += 1;
  else if (Number(item.mastery) < 60) counts.emerging += 1;
  else if (Number(item.mastery) < 80) counts.achieved += 1;
  else counts.mastered += 1;
  return { ...summary, [item.competency_id]: counts };
}, {});
