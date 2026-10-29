import { describe, expect, it } from 'vitest';
import { createInterpretSchema, interpretSchema } from './schemas.js';

describe('AI message size validation', () => {
  it('accepts the default 2000 characters and rejects excess before interpretation', () => {
    expect(interpretSchema.safeParse({ message: 'a'.repeat(2000) }).success).toBe(true);
    expect(interpretSchema.safeParse({ message: 'a'.repeat(2001) }).success).toBe(false);
    expect(interpretSchema.safeParse({ message: ' '.repeat(2000) + 'a' }).success).toBe(false);
  });
  it('respects a configured limit without changing the text or accepting blank messages', () => {
    const schema = createInterpretSchema(3000);
    expect(schema.safeParse({ message: 'a'.repeat(3000) }).success).toBe(true);
    expect(schema.safeParse({ message: 'a'.repeat(3001) }).success).toBe(false);
    expect(schema.safeParse({ message: '   ' }).success).toBe(false);
    expect(schema.parse({ message: '  Gasté 35k  ' }).message).toBe('Gasté 35k');
  });
});
