import { describe, expect, it } from 'vitest';
import { applySessionToLeague } from '@/lib/leagueTransfer';
import { League, PlayerStats } from '@/types';

const stat = (name: string, v: Partial<PlayerStats> = {}): PlayerStats => ({
  player: { id: `id-${name}`, name },
  wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, points: 0, pointsAgainst: 0, goalDifference: 0,
  championships: 0, viceChampionships: 0, ...v,
});
const league = (rows: PlayerStats[], isEternal = false): League => ({
  id: 'L', name: 'Liga', year: 2026, createdAt: '2026-01-01T00:00:00Z', playerStats: rows, isEternal,
});
const row = (l: League, name: string) => l.playerStats.find(s => s.player.name === name)!;

// One evening: Anna 2 wins 1 loss (6:3 goals), Bernd 1 win 1 draw 1 loss, Clara 0 wins 1 draw 2 losses
const evening = [
  stat('Anna', { wins: 2, losses: 1, goalsFor: 6, goalsAgainst: 3, points: 4, pointsAgainst: 2, goalDifference: 3 }),
  stat('Bernd', { wins: 1, draws: 1, losses: 1, goalsFor: 4, goalsAgainst: 4, points: 3, pointsAgainst: 3, goalDifference: 0 }),
  stat('Clara', { draws: 1, losses: 2, goalsFor: 1, goalsAgainst: 4, points: 1, pointsAgainst: 5, goalDifference: -3 }),
];
const none = new Map<string, string>();

describe('annual league', () => {
  const before = league([
    stat('Anna', { wins: 3, draws: 1, losses: 0, goalsFor: 12, goalsAgainst: 4, points: 7, pointsAgainst: 1, goalDifference: 8, championships: 2, viceChampionships: 0 }),
    stat('Dora', { wins: 1, points: 2, pointsAgainst: 2, goalsFor: 3, goalsAgainst: 3 }),
  ]);

  it('adds every column and the titles of 1st and 2nd place', () => {
    const after = applySessionToLeague(before, evening, 'Anna', 'Bernd', none);
    expect(row(after, 'Anna')).toMatchObject({ wins: 5, draws: 1, losses: 1, goalsFor: 18, goalsAgainst: 7, points: 11, pointsAgainst: 3, goalDifference: 11, championships: 3, viceChampionships: 0 });
    // new players are added as they played, with their title
    expect(row(after, 'Bernd')).toMatchObject({ wins: 1, draws: 1, losses: 1, points: 3, championships: 0, viceChampionships: 1 });
    expect(row(after, 'Clara')).toMatchObject({ points: 1, championships: 0, viceChampionships: 0 });
    expect(row(after, 'Dora')).toMatchObject({ points: 2, wins: 1 });
  });

  it('adds the titles to players who are already in the league (champion and runner-up)', () => {
    const l = league([
      stat('Anna', { championships: 2, viceChampionships: 1, points: 7, pointsAgainst: 1 }),
      stat('Bernd', { championships: 0, viceChampionships: 4, points: 5, pointsAgainst: 5 }),
    ]);
    const after = applySessionToLeague(l, evening, 'Anna', 'Bernd', none);
    expect(row(after, 'Anna')).toMatchObject({ championships: 3, viceChampionships: 1 });
    expect(row(after, 'Bernd')).toMatchObject({ championships: 0, viceChampionships: 5 });
    expect(row(after, 'Clara')).toMatchObject({ championships: 0, viceChampionships: 0 });
  });

  it('is sorted by points, then fewer points lost, goal difference, goals', () => {
    const after = applySessionToLeague(before, evening, 'Anna', 'Bernd', none);
    expect(after.playerStats.map(s => s.player.name)).toEqual(['Anna', 'Bernd', 'Dora', 'Clara']);
  });

  it('does not change the league it was given', () => {
    const copy = JSON.parse(JSON.stringify(before));
    applySessionToLeague(before, evening, 'Anna', 'Bernd', none);
    expect(before).toEqual(copy);
  });

  it('gives no title when the place is not decided', () => {
    const after = applySessionToLeague(before, evening, undefined, undefined, none);
    expect(after.playerStats.reduce((n, s) => n + (s.championships ?? 0), 0)).toBe(2);    // only Anna's earlier two
    expect(after.playerStats.reduce((n, s) => n + (s.viceChampionships ?? 0), 0)).toBe(0);
  });

  it('finds a player by the confirmed name, ignoring case', () => {
    const tim = stat('Timo Schwarz', { points: 4, pointsAgainst: 0, wins: 2 });
    const l = league([tim]);
    const ev = [stat('tim', { wins: 1, points: 2, pointsAgainst: 0, goalsFor: 2 })];
    const after = applySessionToLeague(l, ev, undefined, undefined, new Map([['tim', 'timo schwarz']]));
    expect(after.playerStats).toHaveLength(1);
    expect(row(after, 'Timo Schwarz')).toMatchObject({ points: 6, wins: 3 });
  });
});

describe('finding the player by name', () => {
  const eternalBefore = league([
    stat('Klaudio Lange', { points: 4379, pointsAgainst: 2859, championships: 85 }),
    stat('Harald Füßinger', { points: 6196, pointsAgainst: 1976, championships: 189 }),
  ], true);
  const one = (name: string, points = 4, pointsAgainst = 2) => [stat(name, { points, pointsAgainst })];

  it('books on the existing row when only case, spacing or umlauts differ (no second row)', () => {
    for (const name of ['klaudio lange', 'Klaudio  Lange ', 'KLAUDIO LANGE']) {
      const after = applySessionToLeague(eternalBefore, one(name), undefined, undefined, none);
      expect(after.playerStats.length).toBe(2);
      expect(row(after, 'Klaudio Lange').points).toBe(4383);
    }
    const umlaut = applySessionToLeague(eternalBefore, one('Harald Fuessinger'), 'Harald Fuessinger', undefined, none);
    expect(umlaut.playerStats.length).toBe(2);
    expect(row(umlaut, 'Harald Füßinger')).toMatchObject({ points: 6200, championships: 190 });
  });

  it('a typo creates a new row unless the user confirmed the person', () => {
    const unconfirmed = applySessionToLeague(eternalBefore, one('Klaudo Lange'), undefined, undefined, none);
    expect(unconfirmed.playerStats.length).toBe(3);
    const confirmed = applySessionToLeague(eternalBefore, one('Klaudo Lange'), undefined, undefined, new Map([['Klaudo Lange', 'Klaudio Lange']]));
    expect(confirmed.playerStats.length).toBe(2);
    expect(row(confirmed, 'Klaudio Lange').points).toBe(4383);
  });

  it('books on the main row when the league holds the same name twice', () => {
    const split = league([
      stat('Klaudio Lange', { points: 4379 }),
      stat('Klaudio Lange', { points: 36 }),
    ], true);
    const after = applySessionToLeague(split, one('klaudio lange'), undefined, undefined, none);
    expect(after.playerStats.map(s => s.points).sort((a, b) => a - b)).toEqual([36, 4383]);
  });
});

describe('finding the player by the fixed identity', () => {
  const withRef = (name: string, ref: string | undefined, v: Partial<PlayerStats> = {}): PlayerStats => ({
    ...stat(name, v), player: { id: `id-${name}`, name, ...(ref ? { ref } : {}) },
  });
  const one = (name: string, ref: string | undefined, points = 4, pointsAgainst = 2) => [withRef(name, ref, { points, pointsAgainst })];
  const eternalBefore = league([withRef('Erik Schwarz', 'R-erik', { points: 100 }), withRef('Tim', 'R-tim', { points: 10 })], true);

  it('books on the row of the same person although the name differs', () => {
    const after = applySessionToLeague(eternalBefore, one('Erik', 'R-erik'), undefined, undefined, none);
    expect(after.playerStats.length).toBe(2);
    expect(row(after, 'Erik Schwarz').points).toBe(104);
    expect(row(after, 'Erik Schwarz').player.name).toBe('Erik Schwarz'); // the league keeps its spelling
  });

  it('prefers the identity over a same name of another person', () => {
    const l = league([withRef('Tim', 'R-tim1', { points: 100 }), withRef('Tim', 'R-tim2', { points: 10 })], true);
    const after = applySessionToLeague(l, one('Tim', 'R-tim2'), undefined, undefined, none);
    expect(after.playerStats.map(s => `${s.player.ref}:${s.points}`).sort()).toEqual(['R-tim1:100', 'R-tim2:14']);
  });

  it('adds a known person who is not in the league as a new row that keeps the identity', () => {
    const after = applySessionToLeague(eternalBefore, one('Maxi Scheibitz', 'R-maxi'), undefined, undefined, none);
    expect(after.playerStats.length).toBe(3);
    expect(row(after, 'Maxi Scheibitz').player.ref).toBe('R-maxi');
  });

  it('gives a row that is found by name and has no identity the identity of the player', () => {
    const l = league([withRef('Erik Schwarz', undefined, { points: 100 })], true);
    const after = applySessionToLeague(l, one('erik schwarz', 'R-erik'), undefined, undefined, none);
    expect(row(after, 'Erik Schwarz').player.ref).toBe('R-erik');
    expect(row(after, 'Erik Schwarz').points).toBe(104);
  });

  it('never replaces the identity of a row with another one', () => {
    const l = league([withRef('Erik Schwarz', 'R-erik', { points: 100 })], true);
    const after = applySessionToLeague(l, one('Erik Schwarz', 'R-other'), undefined, undefined, new Map());
    expect(row(after, 'Erik Schwarz').player.ref).toBe('R-erik');
  });
});

describe('eternal table', () => {
  const eternal = league([
    stat('Anna', { wins: 36, draws: 12, losses: 36, goalsFor: 100, goalsAgainst: 90, points: 40, pointsAgainst: 20, championships: 5, viceChampionships: 3 }),
  ], true);

  it('books only points, points against and championships: wins, goals and vice titles stay as they were', () => {
    const after = applySessionToLeague(eternal, evening, 'Bernd', 'Anna', none);
    expect(row(after, 'Anna')).toMatchObject({
      points: 44, pointsAgainst: 22, championships: 5,             // points added; she was second: no championship
      wins: 36, draws: 12, losses: 36, goalsFor: 100, goalsAgainst: 90, viceChampionships: 3,   // untouched, no vice title booked
    });
  });

  it('a player who is new there starts with 0 wins, draws, losses and goals', () => {
    const after = applySessionToLeague(eternal, evening, 'Bernd', 'Anna', none);
    expect(row(after, 'Bernd')).toMatchObject({ points: 3, pointsAgainst: 3, championships: 1, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, viceChampionships: 0 });
  });

  it('is sorted by points, then championships; level rows keep their order', () => {
    const l = league([stat('A', { points: 10, championships: 1 }), stat('B', { points: 10, championships: 3 }), stat('C', { points: 12 })], true);
    expect(applySessionToLeague(l, [], undefined, undefined, none).playerStats.map(s => s.player.name)).toEqual(['C', 'B', 'A']);
  });

  it('gives the same result for a training evening and a Swiss tournament (same numbers in, same league out)', () => {
    // Both pages call this one function: the same inputs always give the same league
    const a = applySessionToLeague(eternal, evening, 'Bernd', 'Anna', none);
    const b = applySessionToLeague(eternal, evening, 'Bernd', 'Anna', none);
    expect(a).toEqual(b);
  });
});
