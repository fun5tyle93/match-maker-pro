import { describe, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} })); // swissHelpers imports the storage layer
import { computeFinalSwissStats } from '@/pages/swissHelpers';
import * as f from './swissFixtures';

/** wins,draws,losses,goalsFor,goalsAgainst,points,pointsAgainst,goalDifference of every row, in the order of the final ranking */
const rows = (s: Parameters<typeof computeFinalSwissStats>[0]) =>
  computeFinalSwissStats(s).stats.map(r => [r.player.id, r.wins, r.draws, r.losses, r.goalsFor, r.goalsAgainst, r.points, r.pointsAgainst, r.goalDifference].join(','));
const titles = (s: Parameters<typeof computeFinalSwissStats>[0]) => {
  const r = computeFinalSwissStats(s);
  return [r.championName, r.viceChampionName];
};

// What computeFinalSwissStats returned BEFORE the rule for players out of competition was added. Without such a
// player nothing may change: these tests were written against the old code and must stay as they are.
describe('final results of a Swiss tournament (nobody out of competition): unchanged', () => {
  it('without a playoff the standings of the group decide, whole numbers for the leagues', () => {
    expect(titles(f.withoutPlayoff())).toEqual(['Spieler A', 'Spieler C']);
    expect(rows(f.withoutPlayoff())).toEqual(['A,3,0,0,7,1,6,0,6', 'C,1,1,1,1,2,3,3,-1', 'B,1,1,1,1,3,3,3,-2', 'D,0,0,3,1,4,0,6,-3']);
  });

  it('with a finished playoff, champion and runner-up are the finalists; the numbers include the playoff games', () => {
    expect(titles(f.withPlayoff())).toEqual(['Spieler C', 'Spieler A']);
    expect(rows(f.withPlayoff())).toEqual(['C,3,1,1,4,3,7,3,1', 'A,4,0,1,9,3,8,2,6', 'B,1,1,2,2,5,3,5,-3', 'D,0,0,4,2,6,0,8,-4']);
  });

  it('a bye gives no points and no game; referee mode changes nothing about the results', () => {
    expect(titles(f.withByes())).toEqual(['Spieler A', 'Spieler E']);
    expect(rows(f.withByes())).toEqual(['A,2,1,0,6,3,5,1,3', 'E,1,1,0,3,2,3,1,1', 'B,1,0,2,4,4,2,4,0', 'C,0,1,1,1,3,1,3,-2', 'D,0,1,1,0,2,1,3,-2']);
  });

  it('with everybody level the drawn lot decides', () => {
    expect(titles(f.allLevel())).toEqual(['Spieler A', 'Spieler C']);
    expect(rows(f.allLevel()).map(r => r.split(',')[0])).toEqual(['A', 'C', 'D', 'B']);
  });

  it('with a playoff that is not finished the group decides the titles; the numbers include the games played', () => {
    expect(titles(f.playoffUnfinished())).toEqual(['Spieler A', 'Spieler C']);
    expect([...rows(f.playoffUnfinished())].sort()).toEqual(['A,4,0,0,9,2,8,0,7', 'B,1,1,2,2,5,3,5,-3', 'C,2,1,1,3,3,5,3,0', 'D,0,0,4,2,6,0,8,-4']);
  });
});


// A player out of competition ("a.K.") plays and scores like everybody, but gets no title: the next player moves up
// (decision of the club, 13.11.2026; the same rule as for training evenings, see leagueTitleHolders).
describe('final results of a Swiss tournament with a player out of competition', () => {
  /** Which players of the fixtures are out of competition */
  const without = (...ak: string[]) => (id: string) => (ak.includes(id) ? f.outOfCompetition(id) : f.swissPlayer(id));

  it('without a playoff: the group winner out of competition gets no title, the next two do', () => {
    // group order A, C, B, D
    expect(titles(f.withoutPlayoff(without('A')))).toEqual(['Spieler C', 'Spieler B']);
  });

  it('without a playoff: the runner-up out of competition is skipped', () => {
    expect(titles(f.withoutPlayoff(without('C')))).toEqual(['Spieler A', 'Spieler B']);
  });

  it('with a playoff: the final winner out of competition gives the championship to the loser of the final', () => {
    // final C beats A; semi-final losers B (better) and D
    expect(titles(f.withPlayoff(without('C')))).toEqual(['Spieler A', 'Spieler B']);
  });

  it('with a playoff: the loser of the final out of competition is skipped for the runner-up title', () => {
    expect(titles(f.withPlayoff(without('A')))).toEqual(['Spieler C', 'Spieler B']);
  });

  it('with a playoff: both finalists out of competition, the best of the rest follow', () => {
    expect(titles(f.withPlayoff(without('A', 'C')))).toEqual(['Spieler B', 'Spieler D']);
  });

  it('with an unfinished playoff the group decides, and players out of competition are skipped there too', () => {
    expect(titles(f.playoffUnfinished(without('A')))).toEqual(['Spieler C', 'Spieler B']);
  });

  it('a lot decision is skipped the same way', () => {
    // order A, C, D, B
    expect(titles(f.allLevel(without('A')))).toEqual(['Spieler C', 'Spieler D']);
  });

  it('with only players out of competition on top and nobody else, there is no title', () => {
    const everybody = (id: string) => f.outOfCompetition(id);
    expect(titles(f.withoutPlayoff(everybody))).toEqual([undefined, undefined]);
  });

  it('the numbers and the order of the rows are exactly the same as without the marker', () => {
    expect(rows(f.withPlayoff(without('C')))).toEqual(rows(f.withPlayoff()));
    expect(rows(f.withoutPlayoff(without('A')))).toEqual(rows(f.withoutPlayoff()));
  });
});
