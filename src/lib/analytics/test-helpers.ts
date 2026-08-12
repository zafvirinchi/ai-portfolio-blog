// Shared only by this package's own tests — not imported by any
// production code. A fake of supabase-js's chainable query builder
// that actually APPLIES eq/neq/in/gte/lte/lt/not/limit filters against
// the given fixture rows (rather than a dumb passthrough) — so a test
// asserting ".in('status', [...]) actually excludes rows" catches a
// real regression instead of always passing regardless of the query
// code's filter calls.
export function makeQueryBuilder<T extends Record<string, unknown>>(rows: T[]) {
  let filtered = [...rows];

  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      filtered = filtered.filter((row) => row[column] === value);
      return builder;
    },
    neq: (column: string, value: unknown) => {
      filtered = filtered.filter((row) => row[column] !== value);
      return builder;
    },
    in: (column: string, values: unknown[]) => {
      filtered = filtered.filter((row) => values.includes(row[column]));
      return builder;
    },
    gte: (column: string, value: unknown) => {
      filtered = filtered.filter((row) => (row[column] as string | number) >= (value as string | number));
      return builder;
    },
    lte: (column: string, value: unknown) => {
      filtered = filtered.filter((row) => (row[column] as string | number) <= (value as string | number));
      return builder;
    },
    lt: (column: string, value: unknown) => {
      filtered = filtered.filter((row) => (row[column] as string | number) < (value as string | number));
      return builder;
    },
    not: (column: string, operator: string, value: unknown) => {
      if (operator === "is" && value === null) {
        filtered = filtered.filter((row) => row[column] !== null && row[column] !== undefined);
      }
      return builder;
    },
    order: (column: string, options?: { ascending?: boolean }) => {
      const ascending = options?.ascending ?? true;
      filtered = [...filtered].sort((a, b) => {
        const left = a[column] as string | number;
        const right = b[column] as string | number;
        if (left < right) return ascending ? -1 : 1;
        if (left > right) return ascending ? 1 : -1;
        return 0;
      });
      return builder;
    },
    limit: (count: number) => {
      filtered = filtered.slice(0, count);
      return builder;
    },
    maybeSingle: () => Promise.resolve({ data: filtered[0] ?? null, error: null }),
    single: () => Promise.resolve({ data: filtered[0] ?? null, error: null }),
    then: (resolve: (value: { data: T[]; error: null }) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve({ data: filtered, error: null }).then(resolve, reject),
  };

  return builder;
}
