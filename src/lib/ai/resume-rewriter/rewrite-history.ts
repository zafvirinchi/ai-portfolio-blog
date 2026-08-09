import { SectionVersionEntry } from "./rewrite-types";

// Pure version-list management + the word-level diff that backs the
// side-by-side UI's Green=Added / Yellow=Modified / Grey=Reordered
// highlighting. No dependency — this is a small, bounded, well-
// contained LCS diff, not a general-purpose need worth a library.

export function appendVersion(versions: SectionVersionEntry[], value: string[], label: string): SectionVersionEntry[] {
  return [...versions, { value, label, createdAt: new Date().toISOString() }];
}

export function restoreVersion(versions: SectionVersionEntry[], versionIndex: number): SectionVersionEntry {
  const target = versions[versionIndex];

  if (!target) {
    throw new Error(`No version at index ${versionIndex}.`);
  }

  return target;
}

export type DiffTokenType = "unchanged" | "added" | "modified" | "reordered";

export interface DiffToken {
  type: DiffTokenType;
  text: string;
}

function tokenize(text: string): string[] {
  return text.match(/\S+|\s+/g) ?? [];
}

/** Standard LCS DP table over token arrays — small inputs (one resume line/bullet), no need for a library. */
function lcsMatrix(a: string[], b: string[]): number[][] {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0));

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      matrix[i][j] = a[i - 1] === b[j - 1] ? matrix[i - 1][j - 1] + 1 : Math.max(matrix[i - 1][j], matrix[i][j - 1]);
    }
  }

  return matrix;
}

interface RawDiffOp {
  type: "match" | "add" | "remove";
  text: string;
  aIndex?: number;
  bIndex?: number;
}

function backtrackDiff(a: string[], b: string[], matrix: number[][]): RawDiffOp[] {
  const ops: RawDiffOp[] = [];
  let i = a.length;
  let j = b.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      ops.unshift({ type: "match", text: b[j - 1], aIndex: i - 1, bIndex: j - 1 });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || matrix[i][j - 1] >= matrix[i - 1][j])) {
      ops.unshift({ type: "add", text: b[j - 1], bIndex: j - 1 });
      j--;
    } else {
      ops.unshift({ type: "remove", text: a[i - 1], aIndex: i - 1 });
      i--;
    }
  }

  return ops;
}

/**
 * Word-level diff of `rewritten` against `original`. Tokens present only
 * in `original` aren't rendered (the output represents the rewritten
 * text, annotated). An added run immediately preceded by a removed run
 * is a substitution ("modified", yellow) rather than a pure insertion
 * ("added", green). A matched token whose position among matches isn't
 * monotonically increasing relative to the previous match is
 * "reordered" (grey) — it moved rather than changed.
 */
export function wordDiff(original: string, rewritten: string): DiffToken[] {
  const a = tokenize(original);
  const b = tokenize(rewritten);
  const ops = backtrackDiff(a, b, lcsMatrix(a, b));

  type Run = { type: "match" | "add" | "remove"; ops: RawDiffOp[] };
  const runs: Run[] = [];

  for (const op of ops) {
    const last = runs[runs.length - 1];
    if (last && last.type === op.type) {
      last.ops.push(op);
    } else {
      runs.push({ type: op.type, ops: [op] });
    }
  }

  const matches = ops.filter((op) => op.type === "match");
  let lastBIndex = -1;
  const reorderedBIndexes = new Set<number>();

  for (const match of matches) {
    if (match.bIndex! < lastBIndex) {
      reorderedBIndexes.add(match.bIndex!);
    } else {
      lastBIndex = match.bIndex!;
    }
  }

  const tokens: DiffToken[] = [];

  runs.forEach((run, index) => {
    if (run.type === "remove") return;

    if (run.type === "match") {
      for (const op of run.ops) {
        tokens.push({ type: reorderedBIndexes.has(op.bIndex!) ? "reordered" : "unchanged", text: op.text });
      }
      return;
    }

    const precededByRemove = runs[index - 1]?.type === "remove";
    const tag: DiffTokenType = precededByRemove ? "modified" : "added";

    for (const op of run.ops) {
      tokens.push({ type: tag, text: op.text });
    }
  });

  return tokens;
}
