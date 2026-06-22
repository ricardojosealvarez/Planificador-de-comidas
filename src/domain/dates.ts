const DAY_MS = 86_400_000;

export function getWeekStart(date = new Date()): string {
  const copy = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() - day + 1);
  return formatDate(copy);
}

export function addDays(dateIso: string, days: number): string {
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  return formatDate(new Date(date.getTime() + days * DAY_MS));
}

export function formatDisplayDate(dateIso: string): string {
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short' }).format(
    new Date(`${dateIso}T00:00:00.000Z`),
  );
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
