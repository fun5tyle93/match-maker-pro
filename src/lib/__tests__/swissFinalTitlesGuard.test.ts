import { describe, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
// The final ranking is replaced by a deliberately wrong order, to show where the titles do NOT come from
vi.mock('@/lib/swissRanking', async importOriginal => {
  const original = await importOriginal<typeof import('@/lib/swissRanking')>();
  const wrong = ['D', 'B', 'A', 'C'].map((id, i) => ({ place: i + 1, player: { id, name: `Spieler ${id}` }, outIn: 'swiss', points: 0, playoffPoints: 0, goalDifference: 0 }));
  return { ...original, sessionFinalRanking: () => wrong };
});
import { computeFinalSwissStats } from '@/pages/swissHelpers';
import * as f from './swissFixtures';

describe('titles after a finished playoff', () => {
  it('are the two finalists, whatever order the final ranking has; the final ranking only orders the rest', () => {
    const r = computeFinalSwissStats(f.withPlayoff());
    expect([r.championName, r.viceChampionName]).toEqual(['Spieler C', 'Spieler A']);
  });

  it('a finalist out of competition is skipped, then the rest follow in the order of the final ranking', () => {
    const who = (id: string) => (id === 'C' ? f.outOfCompetition(id) : f.swissPlayer(id));
    const r = computeFinalSwissStats(f.withPlayoff(who));
    // finalists A (loser of the final) and C a.K., then the rest D, B: champion A, runner-up D
    expect([r.championName, r.viceChampionName]).toEqual(['Spieler A', 'Spieler D']);
  });
});
