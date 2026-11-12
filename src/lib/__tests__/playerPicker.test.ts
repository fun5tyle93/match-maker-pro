import { describe, expect, it } from 'vitest';
import { buildRegistry } from '@/lib/playerRegistry';
import { cleanName, resolvePlayer, suggestPlayers } from '@/lib/playerPicker';

const registry = buildRegistry(
  [
    { id: 'r-erik', display_name: 'Erik Schwarz' },
    { id: 'r-eva', display_name: 'Eva Berg' },
    { id: 'r-maxi', display_name: 'Maxi Scheibitz' },
    { id: 'r-max', display_name: 'Max Daub' },
    { id: 'r-tim', display_name: 'Tim KumpelMaxi' },
    { id: 'r-mueller', display_name: 'Jörn Müller' },
  ],
  [{ alias: 'tim', player_id: 'r-tim' }, { alias: 'erik', player_id: 'r-erik' }],
);
const names = (list: { name: string }[]) => list.map(p => p.name);

describe('cleanName', () => {
  it('trims and collapses spaces', () => expect(cleanName('  Max   Daub ')).toBe('Max Daub'));
});

describe('suggestPlayers', () => {
  it('suggests nothing for an empty text', () => {
    expect(suggestPlayers(registry, '')).toEqual([]);
    expect(suggestPlayers(registry, '   ')).toEqual([]);
  });

  it('puts names that start with the text first, then names with a word that starts with it', () => {
    expect(names(suggestPlayers(registry, 'ma'))).toEqual(['Max Daub', 'Maxi Scheibitz', 'Tim KumpelMaxi']);
    expect(names(suggestPlayers(registry, 'sch'))).toEqual(['Erik Schwarz', 'Maxi Scheibitz']);
  });

  it('ignores case, spacing, umlauts and accents', () => {
    expect(names(suggestPlayers(registry, 'MUELLER'))).toEqual(['Jörn Müller']);
    expect(names(suggestPlayers(registry, 'jörn'))).toEqual(['Jörn Müller']);
    expect(names(suggestPlayers(registry, 'erik  s'))).toEqual(['Erik Schwarz']);
  });

  it('finds a player through an alias and gives the display name', () => {
    expect(names(suggestPlayers(registry, 'tim'))).toEqual(['Tim KumpelMaxi']);
  });

  it('orders by how well the text fits, not just alphabetically', () => {
    // starts with "ma" > a word starts with "ma" > "ma" is somewhere inside; alphabetical order would be Amanda, Marta, Zoe
    const r = buildRegistry(
      [{ id: '1', display_name: 'Amanda Berg' }, { id: '2', display_name: 'Zoe Maier' }, { id: '3', display_name: 'Marta Lang' }],
      [],
    );
    expect(names(suggestPlayers(r, 'ma'))).toEqual(['Marta Lang', 'Zoe Maier', 'Amanda Berg']);
  });

  it('finds a player that only an alias fits, and shows the display name', () => {
    const r = buildRegistry([{ id: '1', display_name: 'Isaak Berg' }], [{ alias: 'zack', player_id: '1' }]);
    expect(names(suggestPlayers(r, 'zack'))).toEqual(['Isaak Berg']);
    expect(names(suggestPlayers(r, 'zac'))).toEqual(['Isaak Berg']);
  });

  it('limits the list', () => {
    expect(suggestPlayers(registry, 'e', 2).length).toBe(2);
  });

  it('suggests nothing when nothing fits', () => {
    expect(suggestPlayers(registry, 'zzz')).toEqual([]);
  });
});

describe('resolvePlayer', () => {
  it('knows a player by display name, whatever the spelling', () => {
    expect(resolvePlayer(registry, 'erik schwarz')).toEqual({ kind: 'known', player: { ref: 'r-erik', name: 'Erik Schwarz' } });
    expect(resolvePlayer(registry, ' Joern  Mueller ')).toEqual({ kind: 'known', player: { ref: 'r-mueller', name: 'Jörn Müller' } });
  });

  it('knows a player by alias and uses the display name', () => {
    expect(resolvePlayer(registry, 'Tim')).toEqual({ kind: 'known', player: { ref: 'r-tim', name: 'Tim KumpelMaxi' } });
    expect(resolvePlayer(registry, 'ERIK')).toEqual({ kind: 'known', player: { ref: 'r-erik', name: 'Erik Schwarz' } });
  });

  it('asks for a new player and points to similar known players', () => {
    const r = resolvePlayer(registry, 'Erik Schwartz');
    expect(r.kind).toBe('new');
    if (r.kind === 'new') {
      expect(r.name).toBe('Erik Schwartz');
      expect(r.similar.map(s => `${s.name}:${s.ref}`)).toEqual(['Erik Schwarz:r-erik']);
    }
  });

  it('a first name alone that matches several players is a new player with those as hints', () => {
    const r = resolvePlayer(registry, 'Maxi');
    expect(r.kind).toBe('new');
    if (r.kind === 'new') expect(r.similar.map(s => s.name)).toEqual(['Maxi Scheibitz']);
  });

  it('a plainly new name has no hints', () => {
    const r = resolvePlayer(registry, 'Peter Pan');
    expect(r).toEqual({ kind: 'new', name: 'Peter Pan', similar: [] });
  });
});
