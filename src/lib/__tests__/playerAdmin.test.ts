import { describe, expect, it } from 'vitest';
import { buildPlayerAdmin, describePlayerAdminError, isUnused, matchesSearch, previewMerge, PlayerAdminInput, STAT_KEYS, StatNumbers } from '@/lib/playerAdmin';

// all ten numbers; a base value makes every column different, so a forgotten or swapped column shows up
const nums = (base: number, over: Partial<StatNumbers> = {}): StatNumbers =>
  ({ ...Object.fromEntries(STAT_KEYS.map((k, i) => [k, base + i])), ...over }) as StatNumbers;

const input = (over: Partial<PlayerAdminInput> = {}): PlayerAdminInput => ({
  players: [
    { id: 'p-zora', display_name: 'Zora Test' },
    { id: 'p-anna', display_name: 'Anna Müller' },
    { id: 'p-ben', display_name: 'Ben Test' },
  ],
  aliases: [{ alias: 'anni', player_id: 'p-anna' }, { alias: 'a. müller', player_id: 'p-anna' }],
  trainingPlayers: [{ player_ref: 'p-anna' }, { player_ref: 'p-anna' }, { player_ref: 'p-ben' }, { player_ref: null }],
  matches: [
    { home_player_ref: 'p-anna', away_player_ref: 'p-ben' },
    { home_player_ref: 'p-ben', away_player_ref: 'p-anna' },
    { home_player_ref: 'p-anna', away_player_ref: null },
  ],
  leagueRows: [
    { id: 'r1', league_id: 'L2', player_name: 'Anna Müller', player_ref: 'p-anna', ...nums(0, { points: 5, championships: 1 }) },
    { id: 'r2', league_id: 'L1', player_name: 'Anna Müller', player_ref: 'p-anna', ...nums(0, { points: 9, championships: 0 }) },
    { id: 'r3', league_id: 'L1', player_name: 'Ohne Spieler', player_ref: null, ...nums(0, { points: 4, championships: 2 }) },
    { id: 'r4', league_id: 'L2', player_name: 'Ohne Spieler B', player_ref: null, ...nums(0, { points: 1, championships: 0 }) },
  ],
  leagues: [{ id: 'L1', name: 'Liga Zwei' }, { id: 'L2', name: 'Liga Eins' }],
  ...over,
});
const by = (data: ReturnType<typeof buildPlayerAdmin>, name: string) => data.players.find(p => p.displayName === name)!;

describe('buildPlayerAdmin', () => {
  it('counts evenings, matches (home and away) and league rows per player', () => {
    const data = buildPlayerAdmin(input());
    expect(by(data, 'Anna Müller')).toMatchObject({ evenings: 2, matches: 3 });
    expect(by(data, 'Ben Test')).toMatchObject({ evenings: 1, matches: 2, leagueRows: [] });
    expect(by(data, 'Anna Müller').leagueRows).toEqual([
      { leagueId: 'L2', leagueName: 'Liga Eins', stats: nums(0, { points: 5, championships: 1 }) },
      { leagueId: 'L1', leagueName: 'Liga Zwei', stats: nums(0, { points: 9, championships: 0 }) },
    ]);
  });

  it('lists the other names of a player, sorted', () => {
    expect(by(buildPlayerAdmin(input()), 'Anna Müller').aliases).toEqual(['a. müller', 'anni']);
    expect(by(buildPlayerAdmin(input()), 'Ben Test').aliases).toEqual([]);
  });

  it('sorts the players by name, German order (umlauts)', () => {
    expect(buildPlayerAdmin(input()).players.map(p => p.displayName)).toEqual(['Anna Müller', 'Ben Test', 'Zora Test']);
  });

  it('lists league rows without a player, sorted by league, then name', () => {
    expect(buildPlayerAdmin(input()).unassigned.map(r => `${r.leagueName}:${r.playerName}`)).toEqual(['Liga Eins:Ohne Spieler B', 'Liga Zwei:Ohne Spieler']);
    expect(buildPlayerAdmin(input()).unassigned[1]).toMatchObject({ id: 'r3', points: 4, championships: 2 });
  });

  it('does not count rows without a reference for anybody', () => {
    const data = buildPlayerAdmin(input());
    expect(data.players.reduce((n, p) => n + p.evenings, 0)).toBe(3); // 4 rows, one without reference
  });

  it('counts a match with the same player on both sides once', () => {
    const data = buildPlayerAdmin(input({ matches: [{ home_player_ref: 'p-ben', away_player_ref: 'p-ben' }] }));
    expect(by(data, 'Ben Test').matches).toBe(1);
  });

  it('an unknown league is shown with a question mark instead of failing', () => {
    const data = buildPlayerAdmin(input({ leagues: [] }));
    expect(data.unassigned[0].leagueName).toBe('?');
  });

  it('handles an empty database', () => {
    expect(buildPlayerAdmin({ players: [], aliases: [], trainingPlayers: [], matches: [], leagueRows: [], leagues: [] })).toEqual({ players: [], unassigned: [] });
  });
});

describe('isUnused', () => {
  it('is true only when the player is on no evening, in no match and in no league', () => {
    const data = buildPlayerAdmin(input());
    expect(isUnused(by(data, 'Zora Test'))).toBe(true);
    expect(isUnused(by(data, 'Ben Test'))).toBe(false); // evenings and matches, but no league row
    expect(isUnused({ ...by(data, 'Zora Test'), evenings: 1 })).toBe(false);
    expect(isUnused({ ...by(data, 'Zora Test'), matches: 1 })).toBe(false);
    expect(isUnused({ ...by(data, 'Zora Test'), leagueRows: [{ leagueId: 'L1', leagueName: 'x', stats: nums(0) }] })).toBe(false);
  });
});

describe('matchesSearch', () => {
  const anna = buildPlayerAdmin(input()).players.find(p => p.displayName === 'Anna Müller')!;
  it('finds by name, by other name, ignoring case, spacing, umlauts and accents', () => {
    expect(matchesSearch(anna, 'anna')).toBe(true);
    expect(matchesSearch(anna, 'MUELLER')).toBe(true);
    expect(matchesSearch(anna, ' anni ')).toBe(true);
    expect(matchesSearch(anna, 'a. mueller')).toBe(true);
    expect(matchesSearch(anna, 'ben')).toBe(false);
  });
  it('an empty search matches everybody', () => {
    expect(matchesSearch(anna, '')).toBe(true);
    expect(matchesSearch(anna, '   ')).toBe(true);
  });
});

describe('describePlayerAdminError', () => {
  it('explains the typical refusals in German', () => {
    expect(describePlayerAdminError('rename', { code: '23505' })).toMatch(/gibt es schon.*Zusammenführen/);
    expect(describePlayerAdminError('delete', { code: '23503' })).toMatch(/kommt noch vor/);
    expect(describePlayerAdminError('assign', { code: '23505' })).toMatch(/schon eine Zeile/);
  });

  it('the same code means something else for another action', () => {
    expect(describePlayerAdminError('delete', { code: '23505' })).toMatch(/Verbindung/);
    expect(describePlayerAdminError('rename', { code: '23503' })).toMatch(/Verbindung/);
  });

  it('passes on the readable message of the database function (raise exception)', () => {
    const message = 'Beide Spieler stehen in der Liga "Liga Eins". Bitte dort zuerst eine der Zeilen bereinigen.';
    expect(describePlayerAdminError('merge', { code: 'P0001', message })).toBe(message);
  });

  it('says that the right is missing, and falls back to a general message', () => {
    expect(describePlayerAdminError('merge', { code: '42501' })).toMatch(/Berechtigung/);
    expect(describePlayerAdminError('merge', { message: 'Failed to fetch' })).toMatch(/Verbindung/);
    expect(describePlayerAdminError('merge', null)).toMatch(/Verbindung/);
  });

  it('does not pass on a technical message of another kind', () => {
    expect(describePlayerAdminError('merge', { code: '08006', message: 'connection failure at host x' })).not.toMatch(/host x/);
  });
});

describe('previewMerge', () => {
  const row = (leagueId: string, base: number) => ({ leagueId, leagueName: `Liga ${leagueId}`, stats: nums(base) });
  const player = (id: string, rows: ReturnType<typeof row>[]) =>
    ({ id, displayName: id, aliases: [], evenings: 0, matches: 0, leagueRows: rows });

  it('adds rows of the same league over all ten numbers and keeps a row without counterpart unchanged', () => {
    const from = player('from', [row('L1', 10), row('L2', 100)]);
    const into = player('into', [row('L1', 1)]);
    const lines = previewMerge(from, into, null);
    expect(lines.map(l => l.leagueId)).toEqual(['L1', 'L2']);
    expect(lines[0].summed).toBe(true);
    for (const [i, key] of STAT_KEYS.entries()) expect(lines[0].after[key]).toBe(10 + i + 1 + i);
    expect(lines[1].summed).toBe(false);
    expect(lines[1].after).toEqual(nums(100));
    expect(lines[1].into).toBeNull();
  });

  it('shows only the chosen leagues, and nothing for an empty choice', () => {
    const from = player('from', [row('L1', 10), row('L2', 100)]);
    const into = player('into', []);
    expect(previewMerge(from, into, ['L2']).map(l => l.leagueId)).toEqual(['L2']);
    expect(previewMerge(from, into, [])).toEqual([]);
  });

  it('does not change the numbers of the input', () => {
    const from = player('from', [row('L1', 10)]);
    const into = player('into', [row('L1', 1)]);
    previewMerge(from, into, null);
    expect(into.leagueRows[0].stats).toEqual(nums(1));
  });
});
