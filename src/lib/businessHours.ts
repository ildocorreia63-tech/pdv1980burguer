// Business hours utilities. Stored as JSON keyed by weekday (0=Sun..6=Sat).
export type DayHours = { open: boolean; from: string; to: string };
export type BusinessHours = Record<string, DayHours>;

export const WEEKDAYS = [
  { key: "0", label: "Domingo", short: "Dom" },
  { key: "1", label: "Segunda", short: "Seg" },
  { key: "2", label: "Terça", short: "Ter" },
  { key: "3", label: "Quarta", short: "Qua" },
  { key: "4", label: "Quinta", short: "Qui" },
  { key: "5", label: "Sexta", short: "Sex" },
  { key: "6", label: "Sábado", short: "Sáb" },
];

export const DEFAULT_HOURS: BusinessHours = {
  "0": { open: false, from: "18:00", to: "23:00" },
  "1": { open: true, from: "18:00", to: "23:00" },
  "2": { open: true, from: "18:00", to: "23:00" },
  "3": { open: true, from: "18:00", to: "23:00" },
  "4": { open: true, from: "18:00", to: "23:00" },
  "5": { open: true, from: "18:00", to: "23:00" },
  "6": { open: true, from: "18:00", to: "23:00" },
};

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

export function isOpenNow(hours: BusinessHours | null | undefined, now = new Date()): boolean {
  if (!hours) return true;
  const day = String(now.getDay());
  const cfg = hours[day];
  if (!cfg || !cfg.open) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  const from = toMinutes(cfg.from);
  const to = toMinutes(cfg.to);
  // Support overnight ranges (e.g. 18:00 -> 02:00)
  if (to <= from) return cur >= from || cur < to;
  return cur >= from && cur < to;
}

export function nextOpeningLabel(hours: BusinessHours | null | undefined, now = new Date()): string {
  if (!hours) return "";
  const curMin = now.getHours() * 60 + now.getMinutes();
  for (let i = 0; i <= 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    const cfg = hours[String(d.getDay())];
    if (!cfg?.open) continue;
    if (i === 0 && toMinutes(cfg.from) <= curMin) continue;
    const label = i === 0 ? "hoje" : i === 1 ? "amanhã" : WEEKDAYS[d.getDay()].label;
    return `Abrimos ${label} às ${cfg.from}`;
  }
  return "";
}
