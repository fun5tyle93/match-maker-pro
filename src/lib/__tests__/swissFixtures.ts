// Hand-built Swiss tournaments for the tests of the final results (champion, runner-up, numbers).
import { Match, Player } from '@/types';
import { PlayoffMatch, SwissRound, SwissSession } from '@/types/swiss';

export const swissPlayer = (id: string): Player => ({ id, name: `Spieler ${id}` });
/** A player whose name ends in "a.K." (out of competition) */
export const outOfCompetition = (id: string): Player => ({ id, name: `Spieler ${id} a.K.` });

let counter = 0;
type P = (id: string) => Player;
export const game = (who: P, home: string, away: string, hs: number, as: number, round = 1): Match => ({
  id: `m${++counter}`, round, homePlayer: who(home), awayPlayer: who(away), homeScore: hs, awayScore: as, isCompleted: true, phase: 'swiss',
});
export const swissRound = (n: number, matches: Match[], extra: Partial<SwissRound> = {}): SwissRound => ({
  roundNumber: n, phase: 'swiss', matches, isCompleted: true, ...extra,
});
export const playoffGame = (who: P, id: string, round: number, matchNumber: number, home: string, away: string, hs: number, as: number, suddenDeath = false): PlayoffMatch => ({
  id, round, matchNumber, homePlayer: who(home), awayPlayer: who(away), homeScore: hs, awayScore: as, isCompleted: true, suddenDeath,
});

const session = (who: P, ids: string[], rounds: SwissRound[], extra: Partial<SwissSession> = {}): SwissSession => ({
  id: 'sw', date: '2026-11-13T18:00:00Z', config: { rounds: rounds.length, refereeMode: false, endMode: 'direct' },
  players: ids.map(who), rounds, currentRound: rounds.length, isCompleted: false, ...extra,
});

/** Four players, three rounds, A wins everything, B and C level, D loses everything. `who` decides who is a.K. */
export const groupOfFour = (who: P = swissPlayer): { ids: string[]; rounds: SwissRound[] } => ({
  ids: ['A', 'B', 'C', 'D'],
  rounds: [
    swissRound(1, [game(who, 'A', 'B', 3, 0, 1), game(who, 'C', 'D', 1, 0, 1)]),
    swissRound(2, [game(who, 'A', 'C', 2, 0, 2), game(who, 'B', 'D', 1, 0, 2)]),
    swissRound(3, [game(who, 'A', 'D', 2, 1, 3), game(who, 'B', 'C', 0, 0, 3)]),
  ],
});

/** 1. Without a playoff */
export const withoutPlayoff = (who: P = swissPlayer) => { const g = groupOfFour(who); return session(who, g.ids, g.rounds); };

/** 2. With semi-finals and a final; sudden death in one semi-final and in the final. C wins the final against A. */
export const withPlayoff = (who: P = swissPlayer) => {
  const g = groupOfFour(who);
  return session(who, g.ids, g.rounds, {
    config: { rounds: 3, refereeMode: false, endMode: 'playoff', playoffStart: 'sf' },
    playoffActive: true,
    playoffMatches: [
      playoffGame(who, 'p1', 2, 1, 'A', 'D', 2, 1),
      playoffGame(who, 'p2', 2, 2, 'B', 'C', 1, 2, true),
      playoffGame(who, 'p3', 1, 1, 'A', 'C', 0, 1, true),
    ],
  });
};

/** 3. Five players with a bye in every round, referee mode */
export const withByes = (who: P = swissPlayer) => session(who, ['A', 'B', 'C', 'D', 'E'], [
  swissRound(1, [game(who, 'A', 'B', 2, 1, 1), game(who, 'C', 'D', 0, 0, 1)], { phase: 'referee', pass: 1, byePlayerId: 'E' }),
  swissRound(2, [game(who, 'A', 'C', 3, 1, 2), game(who, 'B', 'E', 1, 2, 2)], { phase: 'referee', pass: 1, byePlayerId: 'D' }),
  swissRound(3, [game(who, 'A', 'E', 1, 1, 3), game(who, 'B', 'D', 2, 0, 3)], { phase: 'referee', pass: 1, byePlayerId: 'C' }),
], { config: { rounds: 3, refereeMode: true, endMode: 'direct' } });

/** 4. Everybody level in the group (all draws 1:1): only the drawn lot decides */
export const allLevel = (who: P = swissPlayer) => session(who, ['A', 'B', 'C', 'D'], [
  swissRound(1, [game(who, 'A', 'B', 1, 1, 1), game(who, 'C', 'D', 1, 1, 1)]),
  swissRound(2, [game(who, 'A', 'C', 1, 1, 2), game(who, 'B', 'D', 1, 1, 2)]),
  swissRound(3, [game(who, 'A', 'D', 1, 1, 3), game(who, 'B', 'C', 1, 1, 3)]),
], { lot: { A: 0.2, B: 0.9, C: 0.5, D: 0.7 } });

/** 5. Playoff started but the final is not played yet */
export const playoffUnfinished = (who: P = swissPlayer) => {
  const s = withPlayoff(who);
  return { ...s, playoffMatches: s.playoffMatches!.slice(0, 2) };
};
