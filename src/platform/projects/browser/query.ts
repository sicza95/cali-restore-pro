import { browserItemStatuses, projectVisibilities } from '../browser-contracts';
import type { BrowserItemDescriptor } from '../browser-contracts';

export const queryLimits = { characters: 1024, terms: 32 } as const;
const fields = [
  'name',
  'owner',
  'creator',
  'status',
  'visibility',
  'created',
  'modified',
  'archived',
] as const;
export type QueryField = (typeof fields)[number];
export type QueryComparison = '=' | '>' | '>=' | '<' | '<=';
export type QueryTerm = {
  field: QueryField;
  value: string;
  comparison: QueryComparison;
  start: number;
  end: number;
};
export type QueryAst = { terms: QueryTerm[] };
export type QueryDiagnostic = { message: string; start: number; end: number };
export type ParsedQuery = { ast: QueryAst | null; diagnostics: QueryDiagnostic[] };
export type QueryToken = {
  kind: 'word' | 'quoted' | 'symbol';
  value: string;
  start: number;
  end: number;
};
export type QuerySubject = Pick<
  BrowserItemDescriptor,
  'name' | 'owners' | 'createdBy' | 'status' | 'visibility' | 'createdAt' | 'updatedAt'
> & {
  archived?: boolean;
  creatorName?: string;
};

class QueryError extends Error {
  constructor(readonly diagnostic: QueryDiagnostic) {
    super(diagnostic.message);
  }
}
const fail = (message: string, start: number, end = start + 1): never => {
  throw new QueryError({ message, start, end });
};

/** Positions are zero-based UTF-16 offsets, with exclusive ends (suitable for input selections). */
export function tokenizeQuery(input: string): {
  tokens: QueryToken[];
  diagnostics: QueryDiagnostic[];
} {
  const tokens: QueryToken[] = [];
  try {
    if (input.length > queryLimits.characters)
      fail('Query exceeds 1024 characters', queryLimits.characters, input.length);
    let i = 0;
    while (i < input.length) {
      if (/\s/.test(input[i]!)) {
        i++;
        continue;
      }
      const start = i;
      const char = input[i++]!;
      if (char === '"') {
        let value = '';
        let closed = false;
        while (i < input.length) {
          const next = input[i++]!;
          if (next === '"') {
            closed = true;
            break;
          }
          if (next === '\\') {
            const escaped = input[i++];
            if (escaped !== '"' && escaped !== '\\')
              fail('Invalid quoted escape', i - 2, Math.min(i, input.length));
            value += escaped;
          } else value += next;
        }
        if (!closed) fail('Unclosed quote', start, input.length);
        tokens.push({ kind: 'quoted', value, start, end: i });
      } else if ('[]:><='.includes(char)) {
        let value = char;
        if ('><'.includes(char) && input[i] === '=') value += input[i++];
        tokens.push({ kind: 'symbol', value, start, end: i });
      } else {
        if ('()*|!'.includes(char)) fail('Unsupported query syntax', start, i);
        while (i < input.length && !/[\s"[\]:><=()*|!]/.test(input[i]!)) i++;
        tokens.push({ kind: 'word', value: input.slice(start, i), start, end: i });
      }
    }
    return { tokens, diagnostics: [] };
  } catch (error) {
    if (!(error instanceof QueryError)) throw error;
    return { tokens, diagnostics: [error.diagnostic] };
  }
}

function validDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseQuery(input: string): ParsedQuery {
  const { tokens, diagnostics } = tokenizeQuery(input);
  if (diagnostics.length) return { ast: null, diagnostics };
  const terms: QueryTerm[] = [];
  let i = 0;
  const peek = () => tokens[i];
  const take = () => {
    const token = tokens[i++];
    if (!token) return fail('Expected a value', input.length, input.length);
    return token;
  };
  const valueToken = () => {
    const token = take();
    if (token.kind === 'symbol' || !token.value.length)
      fail('Expected a value', token.start, token.end);
    return token;
  };
  try {
    while (peek()) {
      const start = peek()!.start;
      if (terms.length === queryLimits.terms) fail('Query exceeds 32 terms', start, input.length);
      const bracket = peek()?.value === '[' && peek()?.kind === 'symbol';
      if (bracket) take();
      const key = valueToken();
      let field: QueryField = 'name';
      let value = key;
      let comparison: QueryComparison = '=';
      const clause = peek()?.kind === 'symbol' && peek()?.value === ':';
      if (clause) {
        take();
        const lower = key.value.toLowerCase();
        if (!fields.includes(lower as QueryField)) fail('Unknown field', key.start, key.end);
        field = lower as QueryField;
        if (peek()?.kind === 'symbol' && ['=', '>', '>=', '<', '<='].includes(peek()!.value)) {
          const operator = take();
          if (field !== 'created' && field !== 'modified')
            fail('Only dates accept comparators', operator.start, operator.end);
          comparison = operator.value as QueryComparison;
        }
        value = valueToken();
      } else if (bracket) fail('Brackets require a field clause', key.start, key.end);
      const normal = value.value.toLowerCase();
      if ((field === 'created' || field === 'modified') && !validDay(value.value))
        fail('Expected a valid YYYY-MM-DD date', value.start, value.end);
      if (field === 'status' && !browserItemStatuses.some((item) => item === normal))
        fail('Unknown status', value.start, value.end);
      if (field === 'visibility' && !projectVisibilities.some((item) => item === normal))
        fail('Unknown visibility', value.start, value.end);
      if (field === 'archived' && !['true', 'false'].includes(normal))
        fail('Expected true or false', value.start, value.end);
      let end = value.end;
      if (bracket) {
        const close = take();
        if (close.kind !== 'symbol' || close.value !== ']')
          fail('Expected closing bracket', close.start, close.end);
        end = close.end;
      }
      if (peek() && !/\s/.test(input.slice(end, peek()!.start)))
        fail('Expected whitespace between terms', peek()!.start, peek()!.end);
      terms.push({ field, value: normal, comparison, start, end });
    }
    return { ast: { terms }, diagnostics: [] };
  } catch (error) {
    if (!(error instanceof QueryError)) throw error;
    return { ast: null, diagnostics: [error.diagnostic] };
  }
}

/** Uses the same IANA timezone as the UI; omitted means the device's displayed timezone. */
export function evaluateQuery(ast: QueryAst, item: QuerySubject, timeZone?: string): boolean {
  const contains = (text: string | null | undefined, value: string) =>
    text?.toLowerCase().includes(value) ?? false;
  return ast.terms.every(({ field, value, comparison }) => {
    switch (field) {
      case 'name':
        return contains(item.name, value);
      case 'owner':
        return item.owners.some(
          (owner) => contains(owner.name, value) || contains(owner.id, value),
        );
      case 'creator':
        return contains(item.createdBy, value) || contains(item.creatorName, value);
      case 'status':
        return item.status === value;
      case 'visibility':
        return item.visibility === value;
      case 'archived':
        return item.archived !== undefined && String(item.archived) === value;
      case 'created':
      case 'modified': {
        const timestamp = field === 'created' ? item.createdAt : item.updatedAt;
        if (timestamp === null || !Number.isFinite(timestamp)) return false;
        const parts = new Intl.DateTimeFormat('en', {
          timeZone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).formatToParts(timestamp);
        const part = (name: string) => parts.find(({ type }) => type === name)!.value;
        const day = `${part('year').padStart(4, '0')}-${part('month')}-${part('day')}`;
        switch (comparison) {
          case '=':
            return day === value;
          case '>':
            return day > value;
          case '>=':
            return day >= value;
          case '<':
            return day < value;
          case '<=':
            return day <= value;
        }
      }
    }
  });
}
