import { describe, expect, it } from 'vitest';
import {
  defaultAnswer,
  editDistance,
  findNameCandidates,
  findRowIndex,
  normalizeName,
  planTransferMatches,
  sameName,
} from '@/lib/nameMatching';

const row = (name: string, points = 0, championships = 0) => ({ name, points, championships });

describe('normalizeName / sameName', () => {
  it('ignores case, surrounding and double spaces, hyphens, dots and brackets', () => {
    expect(sameName('klaudio  LANGE ', 'Klaudio Lange')).toBe(true);
    expect(sameName('Daniele Di-Fabio', 'Daniele Di Fabio')).toBe(true);
    expect(sameName('Franz Mayer (Kleofasz)', 'franz mayer kleofasz')).toBe(true);
  });

  it('treats umlauts and their spelled-out form as equal, and ignores accents', () => {
    expect(sameName('Harald Füßinger', 'Harald Fuessinger')).toBe(true);
    expect(sameName('Jörn Nagel', 'Joern Nagel')).toBe(true);
    expect(sameName('Hervè Lancon', 'Herve Lancon')).toBe(true);
    expect(normalizeName('Müller')).toBe('mueller');
  });

  it('does not equal different people, and an empty name equals nothing', () => {
    expect(sameName('Jonas Karl', 'Julian Karl')).toBe(false);
    expect(sameName('', '')).toBe(false);
    expect(sameName('   ', '-')).toBe(false);
  });
});

describe('editDistance', () => {
  it('counts one swap of neighbouring letters as one edit', () => {
    expect(editDistance('lagne', 'lange')).toBe(1);
    expect(editDistance('lange', 'lange')).toBe(0);
    expect(editDistance('lange', 'lang')).toBe(1);
    expect(editDistance('abc', 'xyz')).toBe(3);
  });
});

describe('findRowIndex', () => {
  it('finds the row by normalized name', () => {
    expect(findRowIndex([{ name: 'Anna Berg', points: 1 }], 'anna  BERG')).toBe(0);
    expect(findRowIndex([{ name: 'Anna Berg', points: 1 }], 'Anna Burg')).toBe(-1);
  });

  it('takes the row with the most points when a name is in the league twice', () => {
    const rows = [{ name: 'Klaus Test', points: 36 }, { name: 'klaus test', points: 4379 }, { name: 'Klaus  Test', points: 12 }];
    expect(findRowIndex(rows, 'Klaus Test')).toBe(1);
  });
});

describe('findNameCandidates', () => {
  const league = [
    row('Klaudio Lange', 4379, 85),
    row('Max Daub', 3197, 65),
    row('Tim Hecker', 286),
    row('Tim Wieschollek', 27),
    row('Jonas Karl', 18),
    row('Julian Karl', 30),
    row('Ali Bo', 5),
  ];
  const kinds = (name: string) => findNameCandidates(name, league).map(c => `${c.name}:${c.kind}`);

  it('finds a typo: one letter too few, wrong or swapped', () => {
    expect(kinds('Klaudo Lange')).toEqual(['Klaudio Lange:typo']);
    expect(kinds('Klaudio Lenge')).toEqual(['Klaudio Lange:typo']);
    expect(kinds('Klaudio Lagne')).toEqual(['Klaudio Lange:typo']);
  });

  it('finds the same words in another order', () => {
    expect(kinds('Lange Klaudio')).toEqual(['Klaudio Lange:reordered']);
  });

  it('finds a name with an added note, and a first name alone', () => {
    expect(kinds('Max Daub a.K.')).toEqual(['Max Daub:partial']);
    expect(kinds('Tim')).toEqual(['Tim Hecker:firstname', 'Tim Wieschollek:firstname']);
  });

  it('does not offer different people with a similar name', () => {
    // Jonas / Julian Karl differ by more than a typo; Ali Bo is too short for any tolerance
    expect(kinds('Jonas Karl ')).toEqual([]);
    expect(kinds('Julian Karl')).toEqual([]);
    expect(kinds('Ali Bu')).toEqual([]);
    expect(kinds('Peter Pan')).toEqual([]);
  });

  it('does not offer the exact (normalized) name; that one is matched automatically', () => {
    expect(kinds('klaudio lange')).toEqual([]);
  });

  it('allows one typo from 7 letters and two from 11, never more', () => {
    const rows = [row('Anna Berg'), row('Klaudio Lange')];
    expect(findNameCandidates('Anna Burg', rows).map(c => c.name)).toEqual(['Anna Berg']); // 1 edit, 8 letters
    expect(findNameCandidates('Anni Burg', rows)).toEqual([]); // 2 edits in a short name
    expect(findNameCandidates('Klaudo Lenge', rows).map(c => c.name)).toEqual(['Klaudio Lange']); // 2 edits, long name
    expect(findNameCandidates('Klaudo Lenga', rows)).toEqual([]); // 3 edits
  });

  it('does not treat a very short first name as a hint', () => {
    expect(findNameCandidates('Jo', [row('Jo Schmidt')])).toEqual([]);
    expect(findNameCandidates('Joe', [row('Joe Schmidt')]).map(c => c.kind)).toEqual(['firstname']);
  });

  it('offers at most four candidates, best first', () => {
    const many = ['Tim A', 'Tim B', 'Tim C', 'Tim D', 'Tim E', 'Tim F'].map((n, i) => row(n, i));
    expect(findNameCandidates('Tim', many).map(c => c.name)).toEqual(['Tim F', 'Tim E', 'Tim D', 'Tim C']);
    const ordered = findNameCandidates('Tim', [row('Tim Hecker', 5), row('Tim', 0), row('Timo Lange', 9)]);
    expect(ordered.map(c => c.name)).toEqual(['Tim Hecker']);
  });

  it('lists the same name twice in a league as one candidate', () => {
    expect(findNameCandidates('Klaudo Lange', [row('Klaudio Lange', 36), row('klaudio lange', 4379)]).length).toBe(1);
  });
});

describe('planTransferMatches', () => {
  const eternal = { id: 'E', name: 'Ewige Tabelle', rows: [row('Klaudio Lange', 4379, 85), row('Benjamin Buza', 4160, 130)] };
  const annual = { id: 'A', name: 'Tabelle 2026', rows: [row('Klaudio Lange', 75)] };

  it('asks nothing for names that exist, and matches spelling differences automatically', () => {
    const plan = planTransferMatches(['klaudio lange', 'BENJAMIN  BUZA'], [eternal]);
    expect(plan.questions).toEqual([]);
    expect(plan.autoMatches).toEqual([
      { leagueId: 'E', eveningName: 'klaudio lange', leagueRowName: 'Klaudio Lange' },
      { leagueId: 'E', eveningName: 'BENJAMIN  BUZA', leagueRowName: 'Benjamin Buza' },
    ]);
  });

  it('lists nothing for a name that is spelled exactly like the player in the league', () => {
    const plan = planTransferMatches(['Klaudio Lange'], [eternal]);
    expect(plan.questions).toEqual([]);
    expect(plan.autoMatches).toEqual([]);
  });

  it('asks nothing for a name that is plainly new', () => {
    expect(planTransferMatches(['Peter Pan'], [eternal]).questions).toEqual([]);
  });

  it('asks per league, so the answer for one league never counts for another', () => {
    const plan = planTransferMatches(['Klaudo Lange'], [eternal, annual]);
    expect(plan.questions.map(q => q.leagueId)).toEqual(['E', 'A']);
    expect(plan.questions[0].candidates[0]).toMatchObject({ name: 'Klaudio Lange', points: 4379, championships: 85 });
  });

  it('asks once per name even when the evening lists it twice', () => {
    expect(planTransferMatches(['Klaudo Lange', 'Klaudo Lange'], [eternal]).questions.length).toBe(1);
  });

  it('preselects typos as the same person and weaker hints as a new player', () => {
    const [typo] = planTransferMatches(['Klaudo Lange'], [eternal]).questions;
    expect(defaultAnswer(typo)).toBe('Klaudio Lange');
    const [partial] = planTransferMatches(['Benjamin Buza a.K.'], [eternal]).questions;
    expect(partial.candidates[0].kind).toBe('partial');
    expect(defaultAnswer(partial)).toBeNull();
  });
});
