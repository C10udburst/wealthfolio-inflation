export const formatPeriodLabel = (value: string) => {
  if (value.length === 10) {
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!Number.isNaN(parsed.getTime())) {
      return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        year: '2-digit',
      }).format(parsed);
    }
  }

  if (value.length === 7) {
    const parsed = new Date(`${value}-01T00:00:00Z`);
    if (!Number.isNaN(parsed.getTime())) {
      return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        year: '2-digit',
      }).format(parsed);
    }
  }

  return value;
};
