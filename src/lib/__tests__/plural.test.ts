import { describe, expect, it } from 'vitest';
import { pluralize } from '@/lib/plural';

describe('pluralize', () => {
  it('uses the singular for exactly one', () => {
    expect(pluralize(1, 'Spiel', 'Spiele')).toBe('1 Spiel');
    expect(pluralize(1, 'Runde', 'Runden')).toBe('1 Runde');
  });

  it('uses the plural for zero and for more than one', () => {
    expect(pluralize(0, 'Spiel', 'Spiele')).toBe('0 Spiele');
    expect(pluralize(2, 'Runde', 'Runden')).toBe('2 Runden');
    expect(pluralize(10, 'Spiel', 'Spiele')).toBe('10 Spiele');
  });
});
