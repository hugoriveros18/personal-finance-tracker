export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function calendarToday(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (name: string) => parts.find((item) => item.type === name)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

const normalize = (text: string) =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
const weekdays = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const weekdayPattern = weekdays.join('|');
const months = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];
const monthPattern = [...months, 'setiembre'].join('|');
const namedDatePattern = `\\d{1,2}\\s+(?:de\\s+)?(?:${monthPattern})(?:\\s+(?:(?:de|del)\\s+)?(?:ano\\s+)?\\d+)?`;
const references = new RegExp(
  `\\b(?:${namedDatePattern}|\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[/-]\\d{1,2}[/-]\\d{4}|hace\\s+\\d{1,3}\\s+(?:dias?|semanas?)|(?:${weekdayPattern})\\s+(?:de\\s+la\\s+semana\\s+pasada|pasado|anterior)|(?:pasado|ultimo)\\s+(?:${weekdayPattern})|pasado\\s+manana|anteayer|hoy|ayer|manana)\\b`,
  'g',
);
const otherDate =
  /\b(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo|hoy|ayer|anteayer|manana|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b|\b\d{1,2}[/-]\d{1,2}\b|\b(?:semana|mes|ano)\s+(?:pasad[oa]|anterior|proxim[oa])\b|\bhace\s+\d+\s+(?:dias?|semanas?|meses?)\b/;

export function resolveDate(text: string | null, today: string): string | null {
  const expression = normalize(text ?? 'hoy').replace(/^el\s+/, '');
  if (isCalendarDate(expression)) return expression;
  const named = new RegExp(
    `^(\\d{1,2})\\s+(?:de\\s+)?(${monthPattern})(?:\\s+(?:(?:de|del)\\s+)?(?:ano\\s+)?(\\d+))?$`,
  ).exec(expression);
  if (named) {
    const year = named[3] ?? today.slice(0, 4);
    const month = named[2] === 'setiembre' ? 9 : months.indexOf(named[2]!) + 1;
    const result = `${year}-${String(month).padStart(2, '0')}-${named[1]!.padStart(2, '0')}`;
    return isCalendarDate(result) ? result : null;
  }
  const absolute = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(expression);
  if (absolute) {
    const result = `${absolute[3]}-${absolute[2]!.padStart(2, '0')}-${absolute[1]!.padStart(2, '0')}`;
    return isCalendarDate(result) ? result : null;
  }
  const date = new Date(`${today}T00:00:00.000Z`);
  const offsets: Record<string, number> = {
    hoy: 0,
    ayer: -1,
    anteayer: -2,
    manana: 1,
    'pasado manana': 2,
  };
  const ago = /^hace\s+(\d{1,3})\s+(dias?|semanas?)$/.exec(expression);
  let offset = ago ? -Number(ago[1]) * (ago[2]!.startsWith('semana') ? 7 : 1) : offsets[expression];
  if (offset === undefined) {
    const weekday = weekdays.findIndex((name) => new RegExp(`\\b${name}\\b`).test(expression));
    if (weekday < 0) return null;
    if (expression === `${weekdays[weekday]} de la semana pasada`) {
      // Calendar weeks start on Monday, independent of the UTC/locale week convention.
      offset = -((date.getUTCDay() + 6) % 7) - 7 + ((weekday + 6) % 7);
    } else if (
      new RegExp(
        `^(?:(?:pasado|ultimo) (?:${weekdayPattern})|(?:${weekdayPattern}) (?:pasado|anterior))$`,
      ).test(expression)
    ) {
      // "Last Friday" always precedes today, even when today is Friday.
      offset = -((date.getUTCDay() - weekday + 7) % 7 || 7);
    } else return null;
  }
  date.setUTCDate(date.getUTCDate() + offset);
  const result = date.toISOString().slice(0, 10);
  return isCalendarDate(result) ? result : null;
}

/** The source expression is authoritative; the model never invents the calendar date. */
export function resolveMessageDate(
  message: string,
  modelText: string | null,
  today: string,
): {
  date: string | null;
  dateSource: 'mentioned' | 'today' | 'missing';
} {
  const text = normalize(message);
  const found = [...new Set(text.match(references) ?? [])];
  const remaining = text.replace(references, ' ');
  if (found.length > 1 || otherDate.test(remaining)) return { date: null, dateSource: 'missing' };
  if (found.length === 1) {
    const date = resolveDate(found[0]!, today);
    return { date, dateSource: date ? 'mentioned' : 'missing' };
  }
  if (modelText === null || !text.includes(normalize(modelText)))
    return { date: today, dateSource: 'today' };
  return { date: null, dateSource: 'missing' };
}
