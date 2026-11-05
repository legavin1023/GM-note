export function koreanDate(value = Date.now()) {
  return new Date(new Date(value).getTime() + 9 * 3600000)
    .toISOString()
    .slice(0, 10);
}
export function calendarDays(month) {
  const [year, number] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, number - 1, 1));
  const start = first.getTime() - first.getUTCDay() * 86400000;
  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(start + i * 86400000);
    const key = date.toISOString().slice(0, 10);
    return { key, day: date.getUTCDate(), inMonth: key.startsWith(month) };
  });
}
export function shiftMonth(month, offset) {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number - 1 + offset, 1))
    .toISOString()
    .slice(0, 7);
}
export function monthRange(month) {
  return {
    start: new Date(`${month}-01T00:00:00+09:00`).toISOString(),
    end: new Date(`${shiftMonth(month, 1)}-01T00:00:00+09:00`).toISOString(),
  };
}
