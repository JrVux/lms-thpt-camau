export const canConfirmClassDeletion = (typedName, className) =>
  typeof typedName === 'string'
  && typeof className === 'string'
  && className.length > 0
  && typedName === className;
