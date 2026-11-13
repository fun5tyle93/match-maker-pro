import { describe, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} })); // swissHelpers imports the storage layer
import { computeFinalSwissStats, convertSwissToTrainingSession } from '@/pages/swissHelpers';
import { applySessionToLeague } from '@/lib/leagueTransfer';
import { checkLeague, openingsFor, OpeningLookup } from '@/lib/leagueCheck';
import { League, Player } from '@/types';
import { SwissSession } from '@/types/swiss';
import * as f from './swissFixtures';

// Players need a fixed identity, otherwise their rows are not checked
const withRef = (id: string): Player => ({ ...f.swissPlayer(id), ref: `R-${id}` });
const withRefOutOfCompetition = (id: string): Player => ({ ...f.outOfCompetition(id), ref: `R-${id}` });
const aK = (who: string) => (id: string) => (id === who ? withRefOutOfCompetition(id) : withRef(id));

const empty = (isEternal: boolean): League => ({ id: 'L', name: 'Liga', year: 2026, createdAt: '', playerStats: [], isEternal });
const noOpenings: OpeningLookup = new Map();

/** The league as the transfer of the tournament leaves it, and the saved evening as the check reads it (with the lot) */
function transferThenCheck(s: SwissSession, isEternal: boolean) {
  const { stats, championName, viceChampionName } = computeFinalSwissStats(s);
  const league = applySessionToLeague(empty(isEternal), stats, championName, viceChampionName, new Map());
  const saved = { ...convertSwissToTrainingSession(s), isCompleted: true, transferredToLeagues: ['L'], swissLot: s.lot };
  return { league, saved, result: checkLeague(league, [saved], noOpenings) };
}

const tournaments: [string, SwissSession][] = [
  ['without a playoff', f.withoutPlayoff(withRef)],
  ['with semi-finals, final and sudden death', f.withPlayoff(withRef)],
  ['with byes and referee mode', f.withByes(withRef)],
  ['everybody level, decided by the lot', f.allLevel(withRef)],
  ['playoff not finished', f.playoffUnfinished(withRef)],
  ['the winner of the group is out of competition', f.withoutPlayoff(aK('A'))],
  ['a finalist out of competition', f.withPlayoff(aK('C'))],
];

describe('transfer = check for Swiss tournaments', () => {
  for (const [name, tournament] of tournaments) {
    for (const isEternal of [false, true]) {
      it(`${name}, ${isEternal ? 'eternal table' : 'annual league'}: the check passes`, () => {
        const { result } = transferThenCheck(tournament, isEternal);
        expect(result).toMatchObject({ ok: true, differences: [], missingRows: [], notChecked: [] });
        expect(result.checkedRows).toBe(tournament.players.length);
      });
    }
  }

  it('notices a number changed by hand in a league that came from a Swiss tournament', () => {
    const { league, saved } = transferThenCheck(f.withPlayoff(withRef), false);
    league.playerStats[0] = { ...league.playerStats[0], goalsFor: league.playerStats[0].goalsFor + 1 };
    const result = checkLeague(league, [saved], noOpenings);
    expect(result.ok).toBe(false);
    expect(result.differences).toEqual([expect.objectContaining({ column: 'goalsFor', stored: league.playerStats[0].goalsFor, computed: league.playerStats[0].goalsFor - 1 })]);
  });

  it('without the lot, a complete tie in the group shows a difference (titles follow the lot); with it the check passes', () => {
    const { league, saved } = transferThenCheck(f.allLevel(withRef), false);
    const withoutLot = checkLeague(league, [{ ...saved, swissLot: undefined }], noOpenings);
    const withLot = checkLeague(league, [saved], noOpenings);
    expect(withLot.ok).toBe(true);
    expect(withoutLot.ok).toBe(false);
    expect(withoutLot.differences.length).toBeGreaterThan(0);
  });

  it('"take over as new state" makes a league pass that was changed by hand, also with a Swiss tournament', () => {
    const { league, saved } = transferThenCheck(f.withPlayoff(withRef), false);
    league.playerStats[0] = { ...league.playerStats[0], points: league.playerStats[0].points + 10 };
    const lookup: OpeningLookup = new Map(openingsFor(league, [saved]).map(o => [o.ref, o.opening]));
    expect(checkLeague(league, [saved], lookup).ok).toBe(true);
  });
});
