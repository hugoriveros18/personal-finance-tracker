import { moneyPositiveIntSchema } from '../../shared/zod.js';

export function hasAmountEvidence(message: string, expression: string): boolean {
  const source = message.toLowerCase();
  const candidate = expression.trim().toLowerCase();
  if (!candidate) return false;
  for (
    let start = source.indexOf(candidate);
    start >= 0;
    start = source.indexOf(candidate, start + 1)
  ) {
    const before = source.slice(0, start);
    const after = source.slice(start + candidate.length);
    if (/[\d.,]$/.test(before) || /(?:[+−-]|menos)\s*\$?\s*$/.test(before) || /^[\d.,]/.test(after))
      continue;
    if (/^\s*(?:k|mil|mill[oó]n|millones)\b/.test(after)) continue;
    return true;
  }
  return false;
}

/** Parse COP text using integer arithmetic. Never delegate unit conversion to the model. */
export function parseAmountText(text: string | null): number | null {
  if (!text) return null;
  const cleaned = text
    .trim()
    .toLowerCase()
    .replace(/^\$\s*/, '')
    .replace(/\s*(?:pesos(?:\s+colombianos)?|cop)$/, '')
    .trim();
  const match = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?(?:\s*(k|mil|mill[oó]n|millones))?$/.exec(
    cleaned,
  );
  if (!match) return null;
  const whole = BigInt(match[1]!.replaceAll('.', ''));
  const fraction = BigInt((match[2] ?? '').padEnd(2, '0'));
  const multiplier = !match[3] ? 1n : ['mil', 'k'].includes(match[3]) ? 1000n : 1_000_000n;
  const cents = (whole * 100n + fraction) * multiplier;
  if (cents > 999_999_999_999n || cents <= 0n) return null;
  const result = moneyPositiveIntSchema.safeParse(Number(cents));
  return result.success ? result.data : null;
}

export function resolveAmount(message: string, expression: string | null): number | null {
  if (expression && hasAmountEvidence(message, expression)) {
    const amount = parseAmountText(expression);
    if (amount !== null) return amount;
  }
  // Recover a single explicit k amount when a model expands it or leaves it empty.
  // Other source numbers make this fallback ambiguous and require manual review.
  const compact = [
    ...message.matchAll(
      /(?<![\p{L}\p{N}.,+−-])(?:\$\s*)?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?\s*k\b/giu,
    ),
  ];
  if (compact.length !== 1) return null;
  const candidate = compact[0]!;
  const rest =
    message.slice(0, candidate.index) + message.slice(candidate.index + candidate[0].length);
  if (/\d/.test(rest) || !hasAmountEvidence(message, candidate[0])) return null;
  const amount = parseAmountText(candidate[0]);
  return expression === null || parseAmountText(expression) === amount ? amount : null;
}
