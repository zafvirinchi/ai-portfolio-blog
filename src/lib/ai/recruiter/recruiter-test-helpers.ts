import { makeQueryBuilder } from "../../analytics/test-helpers";

// Shared only by this package's own tests (candidate-service.test.ts,
// recruiter-job-service.test.ts) — not imported by any production
// code. Extends analytics/test-helpers.ts's read-only chainable mock
// with insert/update/delete and multi-table storage, since both
// services here are full CRUD against supabaseAdmin (mirrors
// resume-version-service.test.ts's own single-table extension of the
// same base helper).
export function makeMultiTableSupabaseAdminMock(tables: Record<string, Record<string, unknown>[]>) {
  let idCounter = 0;

  return {
    from: (table: string) => {
      if (!tables[table]) tables[table] = [];
      const rows = tables[table];

      const builder = makeQueryBuilder(rows) as unknown as Record<string, unknown>;

      builder.insert = (payload: Record<string, unknown>) => {
        idCounter += 1;
        const row = { id: `${table}-row-${idCounter}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...payload };
        rows.push(row);
        return makeQueryBuilder([row]);
      };

      builder.update = (payload: Record<string, unknown>) => {
        // Predicates support both .eq() (single value) and .in() (a
        // set) — bulkUpdateStatus() needs .eq("recruiter_id", ...)
        // AND .in("id", candidateIds) on the same update chain.
        const predicates: ((row: Record<string, unknown>) => boolean)[] = [];
        let wantsSelect = false;

        const chain = {
          eq: (column: string, value: unknown) => {
            predicates.push((row) => row[column] === value);
            return chain;
          },
          in: (column: string, values: unknown[]) => {
            predicates.push((row) => values.includes(row[column]));
            return chain;
          },
          select: () => {
            wantsSelect = true;
            return chain;
          },
          single: () => {
            const target = rows.find((row) => predicates.every((p) => p(row)));
            if (target) Object.assign(target, payload);
            return Promise.resolve({ data: target ?? null, error: target ? null : { message: "not found" } });
          },
          then: (resolve: (v: { data: Record<string, unknown>[] | null; error: null }) => unknown) => {
            const matched = rows.filter((row) => predicates.every((p) => p(row)));
            matched.forEach((row) => Object.assign(row, payload));
            return Promise.resolve({ data: wantsSelect ? matched : null, error: null }).then(resolve);
          },
        };
        return chain;
      };

      builder.delete = () => {
        const filters: { column: string; value: unknown }[] = [];
        const chain = {
          eq: (column: string, value: unknown) => {
            filters.push({ column, value });
            return chain;
          },
          then: (resolve: (v: { data: null; error: null }) => unknown) => {
            const toDelete = rows.filter((row) => filters.every((f) => row[f.column] === f.value));
            toDelete.forEach((row) => {
              const index = rows.indexOf(row);
              if (index >= 0) rows.splice(index, 1);
            });
            return Promise.resolve({ data: null, error: null }).then(resolve);
          },
        };
        return chain;
      };

      return builder;
    },
  };
}
