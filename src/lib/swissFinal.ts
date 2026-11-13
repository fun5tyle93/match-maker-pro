/**
 * Final result of a Swiss tournament from its players and its flat matches: the numbers that are booked into the
 * leagues and the two title holders. Pure; used by the transfer (computeFinalSwissStats, from the running tournament)
 * and by the league check (from the saved evening), so both always book exactly the same.
 */
import { Match, Player, PlayerStats } from '@/types';
import { finalRankingSwiss, titleHoldersFromOrder } from './ranking';
import { roundsOf } from './swissRanking';
import { computeSwissStats } from './swissPairing';
import { getPlayoffFinalists, PLAYOFF_PLACEHOLDER_PREFIX, toPlayoffMatches } from './tournamentPhases';

const isPlaceholder = (p: Player) => !p || !p.id || p.id.startsWith(PLAYOFF_PLACEHOLDER_PREFIX) || p.name === '–';

/**
 * Group phase plus all played playoff games.
 * Champion / runner-up come from the playoff final when it is finished, otherwise from the standings of the group.
 * A player out of competition ("a.K.") gets no title, the next one moves up.
 *
 * `groupMatches` are the matches of the group phase (phase 'swiss'), `playoffMatches` the saved playoff matches
 * (phase 'playoff', empty places are placeholders). `lot` is the drawn lot for a complete tie in the group.
 */
export function finalSwissResult(
  players: Player[],
  groupMatches: Match[],
  playoffMatches: Match[],
  lot?: Record<string, number>,
): { stats: PlayerStats[]; championName?: string; viceChampionName?: string } {
  const swissStats = computeSwissStats(players, roundsOf(groupMatches), lot);

  const acc = new Map<string, PlayerStats>();
  swissStats.forEach(st => {
    acc.set(st.player.id, {
      player: st.player,
      wins: st.wins,
      draws: st.draws,
      losses: st.losses,
      goalsFor: st.goalsFor,
      goalsAgainst: st.goalsAgainst,
      points: st.points,
      pointsAgainst: st.gamesPlayed * 2 - st.points,
      goalDifference: st.goalDifference,
    });
  });

  for (const pm of playoffMatches) {
    if (pm.isBye || !pm.isCompleted || pm.homeScore === null || pm.awayScore === null) continue;
    if (isPlaceholder(pm.homePlayer) || isPlaceholder(pm.awayPlayer)) continue;

    const apply = (playerId: string, gf: number, ga: number) => {
      const cur = acc.get(playerId);
      if (!cur) return;
      const win = gf > ga;
      const draw = gf === ga;
      const points = win ? 2 : draw ? 1 : 0;
      acc.set(playerId, {
        ...cur,
        wins: cur.wins + (win ? 1 : 0),
        draws: cur.draws + (draw ? 1 : 0),
        losses: cur.losses + (!win && !draw ? 1 : 0),
        goalsFor: cur.goalsFor + gf,
        goalsAgainst: cur.goalsAgainst + ga,
        points: cur.points + points,
        pointsAgainst: cur.pointsAgainst + (2 - points),
        goalDifference: cur.goalDifference + (gf - ga),
      });
    };

    apply(pm.homePlayer.id, pm.homeScore, pm.awayScore);
    apply(pm.awayPlayer.id, pm.awayScore, pm.homeScore);
  }

  const stats = Array.from(acc.values());

  // The order the titles come from: after a finished playoff the two finalists, then the rest of the final ranking
  // (SO § 9 Abs. 6); otherwise the standings of the group. Players out of competition ("a.K.") are skipped, the next
  // player moves up. Either title may stay undefined: fewer than two players, or no one left who is eligible.
  // The final ranking is built on the group order WITHOUT the lot, as it always was (see rankSession).
  const groupOrder = computeSwissStats(players, roundsOf(groupMatches)).map(st => st.player.id);
  const final = playoffMatches.length > 0 ? finalRankingSwiss(players, groupMatches, playoffMatches, groupOrder) : null;
  const finalists = playoffMatches.length > 0 ? getPlayoffFinalists(toPlayoffMatches(playoffMatches)) : { champion: null, runnerUp: null };

  let titleOrder: Player[] = swissStats.map(st => st.player);
  if (finalists.champion) {
    const top = [finalists.champion, ...(finalists.runnerUp ? [finalists.runnerUp] : [])];
    titleOrder = [...top, ...(final ?? []).map(r => r.player).filter(p => !top.some(t => t.id === p.id))];
  }
  const { winner, runnerUp } = titleHoldersFromOrder(titleOrder);

  // Final ranking order: by the round of elimination, then points, goal difference, opponent (SO § 9 Abs. 6);
  // without a playoff the Swiss standings decide. The numbers in `stats` stay whole (win 2, loss 0) for the leagues.
  const order = final ? final.map(r => r.player.id) : swissStats.map(st => st.player.id);
  const position = (id: string) => { const i = order.indexOf(id); return i === -1 ? order.length : i; };
  stats.sort((a, b) => position(a.player.id) - position(b.player.id));

  return { stats, championName: winner?.name, viceChampionName: runnerUp?.name };
}
