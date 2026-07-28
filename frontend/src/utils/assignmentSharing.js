export const getEligibleTargetClasses = (classes, sourceClassId) => {
  const source = classes.find((item) => item.id === sourceClassId);
  if (!source) return [];

  return classes.filter(
    (item) => item.id !== sourceClassId && String(item.grade) === String(source.grade)
  );
};
