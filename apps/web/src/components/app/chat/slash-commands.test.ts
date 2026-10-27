import { describe, expect, it } from 'vitest';

import { filterSlashCommands, parseSlashToken, SLASH_COMMANDS } from './slash-commands';

describe('parseSlashToken', () => {
  it('detects a bare slash at the start of the draft', () => {
    expect(parseSlashToken('/')).toEqual({ query: '', start: 0 });
  });

  it('detects a partial command and its offset after other text', () => {
    expect(parseSlashToken('hola /res')).toEqual({ query: 'res', start: 5 });
  });

  it('returns null when the tail is not a slash token', () => {
    expect(parseSlashToken('')).toBeNull();
    expect(parseSlashToken('quiero viajar')).toBeNull();
    expect(parseSlashToken('a/b')).toBeNull();
    expect(parseSlashToken('/buscar playa')).toBeNull();
    expect(parseSlashToken('@casa')).toBeNull();
  });
});

describe('filterSlashCommands', () => {
  it('lists every command on an empty query', () => {
    expect(filterSlashCommands('')).toHaveLength(SLASH_COMMANDS.length);
  });

  it('filters by command-name prefix', () => {
    expect(filterSlashCommands('re').map((c) => c.key)).toEqual(['reservas', 'reclamo']);
    expect(filterSlashCommands('wal').map((c) => c.key)).toEqual(['wallet']);
    expect(filterSlashCommands('xyz')).toHaveLength(0);
  });
});
