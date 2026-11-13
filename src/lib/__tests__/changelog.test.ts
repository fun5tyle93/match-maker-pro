import { describe, expect, it } from 'vitest';
import { CHANGELOG, CURRENT_VERSION, nextVersion } from '@/lib/changelog';

describe('changelog', () => {
  it('starts with the newest entry, whose version is the current version', () => {
    expect(CURRENT_VERSION).toBe(CHANGELOG[0].version);
  });

  it('versions are unique and each one follows from the older entry by its kind (major, minor, patch)', () => {
    expect(new Set(CHANGELOG.map(e => e.version)).size).toBe(CHANGELOG.length);
    for (let i = 0; i < CHANGELOG.length - 1; i++) {
      const entry = CHANGELOG[i];
      expect(entry.kind, `${entry.version} is not the first entry`).not.toBe('start');
      expect(entry.version, `${entry.version} after ${CHANGELOG[i + 1].version}`).toBe(nextVersion(CHANGELOG[i + 1].version, entry.kind as 'major' | 'minor' | 'patch'));
    }
    expect(CHANGELOG[CHANGELOG.length - 1].kind).toBe('start');
  });

  it('dates are valid and never get older going up the list', () => {
    for (const e of CHANGELOG) expect(Number.isNaN(Date.parse(e.date)), e.version).toBe(false);
    for (let i = 0; i < CHANGELOG.length - 1; i++) expect(CHANGELOG[i].date >= CHANGELOG[i + 1].date, CHANGELOG[i].version).toBe(true);
  });

  it('every entry has a title and at least one short change; pull requests appear only once', () => {
    const prs: number[] = [];
    for (const e of CHANGELOG) {
      expect(e.title.length, e.version).toBeGreaterThan(0);
      expect(e.changes.length, e.version).toBeGreaterThan(0);
      for (const c of e.changes) expect(c.length, `${e.version}: ${c}`).toBeLessThanOrEqual(200);
      prs.push(...e.prs);
    }
    expect(new Set(prs).size).toBe(prs.length);
  });

  it('nextVersion resets the lower parts', () => {
    expect(nextVersion('1.4.7', 'major')).toBe('2.0.0');
    expect(nextVersion('1.4.7', 'minor')).toBe('1.5.0');
    expect(nextVersion('1.4.7', 'patch')).toBe('1.4.8');
  });
});
