import { describe, expect, it } from 'vitest';
import { evaluateQuery, parseQuery, tokenizeQuery, queryLimits } from './query';
import type { QuerySubject } from './query';

const item: QuerySubject = {
  name: 'North wall Chapel',
  owners: [{ id: 'owner-1', name: 'Csaba' }],
  createdBy: 'creator-2',
  creatorName: 'Anna',
  status: 'synced',
  visibility: 'listed',
  createdAt: Date.parse('2024-02-29T23:30:00Z'),
  updatedAt: Date.parse('2026-11-24T14:30:00Z'),
  archived: false,
};
function matches(query: string, subject = item, zone = 'UTC') {
  const parsed = parseQuery(query);
  expect(parsed.diagnostics).toEqual([]);
  return evaluateQuery(parsed.ast!, subject, zone);
}

describe('browser query grammar', () => {
  it.each([
    '',
    'chapel',
    '"north wall"',
    'north chapel',
    'name:WALL',
    'owner:csaba',
    '"owner":"csaba"',
    '["owner":"csaba"]',
    '[ "OWNER" : "Csaba" ]',
    'owner : csaba creator:Anna',
    'creator:creator-2',
    'status:SYNCED visibility:listed archived:false',
    'created:2024-02-29 modified:>=2026-01-01 modified:<2027-01-01',
    'created: <= "2024-02-29"',
    'created:=2024-02-29',
  ])('matches %s', (query) => {
    expect(matches(query)).toBe(true);
  });
  it.each([
    '"wall north"',
    'north south',
    'owner:Anna',
    'creator:csaba',
    'status:local',
    'visibility:private',
    'archived:true',
    'created:>2024-02-29',
    'modified:<=2026-01-01',
  ])('does not match %s', (query) => {
    expect(matches(query)).toBe(false);
  });
  it('supports only quote and backslash escapes', () => {
    expect(matches(String.raw`"a \"b\" \\ c"`, { ...item, name: 'a "b" \\ c' })).toBe(true);
    expect(tokenizeQuery('name:"a\\nb"').diagnostics[0]).toMatchObject({ start: 7, end: 9 });
  });
  it.each([
    'created:2023-02-29',
    'modified:2024-02-30',
    'created:2024-13-01',
    'created:2024-1-01',
    'created:0000-01-01',
    'created:2024-02-29T00:00:00Z',
    'status:saved',
    'visibility:public',
    'archived:yes',
    'name:>wall',
    'owner:=csaba',
    'unknown:x',
    'owner:',
    '[owner:csaba',
    '[chapel]',
    '[owner:csaba]]',
    '"unterminated',
    'name:""',
    'name:"north"wall',
    'north*',
    '(north)',
    'owner::csaba',
    'created:>>2024-02-29',
    '[owner:csaba]name:north',
  ])('rejects %s without an AST', (query) => {
    const parsed = parseQuery(query);
    expect(parsed.ast).toBeNull();
    expect(parsed.diagnostics).toHaveLength(1);
    expect(parsed.diagnostics[0]!.start).toBeGreaterThanOrEqual(0);
    expect(parsed.diagnostics[0]!.end).toBeLessThanOrEqual(query.length);
  });
  it('provides exact token and diagnostic offsets including EOF', () => {
    expect(tokenizeQuery(' "owner":x').tokens).toEqual([
      { kind: 'quoted', value: 'owner', start: 1, end: 8 },
      { kind: 'symbol', value: ':', start: 8, end: 9 },
      { kind: 'word', value: 'x', start: 9, end: 10 },
    ]);
    expect(parseQuery('north xyz:value').diagnostics).toEqual([
      { message: 'Unknown field', start: 6, end: 9 },
    ]);
    expect(parseQuery('owner:').diagnostics[0]).toMatchObject({ start: 6, end: 6 });
  });
  it('bounds characters and terms with inclusive limits', () => {
    expect(parseQuery('x'.repeat(queryLimits.characters)).ast).not.toBeNull();
    expect(parseQuery('x'.repeat(queryLimits.characters + 1)).diagnostics[0]!.start).toBe(1024);
    expect(parseQuery(Array(32).fill('x').join(' ')).ast!.terms).toHaveLength(32);
    expect(parseQuery(Array(33).fill('x').join(' ')).ast).toBeNull();
  });
  it('compares calendar days in the displayed timezone, including DST', () => {
    expect(matches('created:2024-03-01', item, 'Europe/Budapest')).toBe(true);
    expect(matches('created:2024-02-29', item, 'America/New_York')).toBe(true);
    const dst = { ...item, updatedAt: Date.parse('2026-03-08T07:30:00Z') };
    expect(matches('modified:2026-03-08', dst, 'America/New_York')).toBe(true);
    expect(matches('modified:2026-03-07', dst, 'America/Los_Angeles')).toBe(true);
  });
  it('unknown history and unauthorised archived metadata never match', () => {
    expect(matches('created:<2027-01-01', { ...item, createdAt: null })).toBe(false);
    expect(matches('modified:>=2020-01-01', { ...item, updatedAt: null })).toBe(false);
    expect(matches('creator:anna', { ...item, createdBy: null, creatorName: undefined })).toBe(
      false,
    );
    expect(matches('archived:false', { ...item, archived: undefined })).toBe(false);
  });
});
