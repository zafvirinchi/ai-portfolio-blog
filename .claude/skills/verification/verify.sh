#!/usr/bin/env bash
# Verification skill — see SKILL.md / reference.md for full explanation.
# Runs this repo's REAL commands (no invented tooling) plus a pattern-based
# governance sweep. Never modifies source. Exits non-zero only on a
# FAIL-level finding (build/lint/tsc/test failure, or a high-confidence
# security/weakened-test finding).
#
# Two modes, both always run (they cover different, non-overlapping things
# — this is not an either/or choice the caller makes):
#
#   MODE A — working-tree verification. Does not depend on git diff size at
#   all: tsc/eslint/vitest/build always run over the whole project (steps
#   1-4), and the security/code-quality hooks' batch-scan CLI mode (step 5)
#   runs over every currently changed-or-untracked .ts/.tsx file in a single
#   Node process each — cheap even at 100+ files (~176ms Node-startup cost
#   is paid once per hook, not once per file), and correct even when the
#   repo has a large uncommitted backlog with no meaningful "PR-sized diff".
#
#   MODE B — changed-files/PR verification (steps 6-18 below). Diff-based:
#   inspects git diff content per file (added/removed test blocks, etc.),
#   which is only a meaningful signal for a PR-sized change. Bounded by
#   MAX_DIFF_FILES (defined below, currently 60) — when the changed-file
#   count exceeds that, Mode B is skipped with an explicit WARN rather than
#   run against the whole tree (which would be slow and not meaningful: not
#   "reviewing a change," just re-auditing everything file-by-file).

# Deliberately no `set -u`: this script's bash arrays (FINDINGS) are
# declared-but-possibly-empty for most of the script's life, and some
# Git-for-Windows MSYS bash builds treat a zero-element array reference as
# "unbound" under nounset (a real, observed cross-platform inconsistency,
# not a hypothetical one). Every variable that genuinely needs a fallback
# already has one (`|| echo ""`, etc.) at the point it's set.
cd "$(dirname "$0")/../../.." || exit 1

FAILS=0
WARNS=0
declare -a FINDINGS

fail() { FINDINGS+=("[FAIL] $1"); FAILS=$((FAILS + 1)); }
warn() { FINDINGS+=("[WARN] $1"); WARNS=$((WARNS + 1)); }

echo "VERIFICATION REPORT"
echo "===================="

# ---------------------------------------------------------------------------
# 1. TypeScript
# ---------------------------------------------------------------------------
TSC_OUT=$(npx tsc --noEmit 2>&1)
TSC_EXIT=$?
if [ $TSC_EXIT -eq 0 ]; then
  echo "TSC:      PASS"
else
  echo "TSC:      FAIL"
  fail "tsc --noEmit reported errors (see full output below)"
fi

# ---------------------------------------------------------------------------
# 2. ESLint
# ---------------------------------------------------------------------------
LINT_OUT=$(npx eslint . 2>&1)
LINT_EXIT=$?
if [ $LINT_EXIT -eq 0 ]; then
  echo "LINT:     PASS"
else
  echo "LINT:     FAIL"
  fail "eslint reported errors (see full output below)"
fi

# ---------------------------------------------------------------------------
# 3. Tests
# ---------------------------------------------------------------------------
TEST_OUT=$(npx vitest run 2>&1)
TEST_EXIT=$?
TEST_SUMMARY=$(echo "$TEST_OUT" | grep -E "Tests\s+[0-9]+" | tail -1)
if [ $TEST_EXIT -eq 0 ]; then
  echo "TESTS:    PASS ($TEST_SUMMARY)"
else
  echo "TESTS:    FAIL ($TEST_SUMMARY)"
  fail "vitest run reported failures"
fi

# ---------------------------------------------------------------------------
# 4. Production build
# ---------------------------------------------------------------------------
BUILD_OUT=$(npm run build 2>&1)
BUILD_EXIT=$?
if [ $BUILD_EXIT -eq 0 ]; then
  echo "BUILD:    PASS"
else
  echo "BUILD:    FAIL"
  fail "npm run build failed"
fi

echo ""

# ---------------------------------------------------------------------------
# 5. Changed files (best-effort; falls back gracefully if no git history)
# ---------------------------------------------------------------------------
BASE_REF=$(git merge-base HEAD origin/main 2>/dev/null || git rev-parse HEAD~1 2>/dev/null || echo "")
if [ -n "$BASE_REF" ]; then
  CHANGED_FILES=$(git diff --name-only "$BASE_REF" -- '*.ts' '*.tsx' 2>/dev/null)
else
  CHANGED_FILES=$(git diff --name-only HEAD -- '*.ts' '*.tsx' 2>/dev/null)
fi
# Also include untracked new files (git diff misses these).
UNTRACKED=$(git ls-files --others --exclude-standard -- '*.ts' '*.tsx' 2>/dev/null)
CHANGED_FILES=$(printf '%s\n%s\n' "$CHANGED_FILES" "$UNTRACKED" | sed '/^$/d' | sort -u)
CHANGED_COUNT=$(printf '%s\n' "$CHANGED_FILES" | sed '/^$/d' | wc -l | tr -d ' ')

CHANGED_TESTS=$(printf '%s\n' "$CHANGED_FILES" | grep '\.test\.ts$' || true)
CHANGED_TEST_COUNT=$(printf '%s\n' "$CHANGED_TESTS" | sed '/^$/d' | wc -l | tr -d ' ')

echo "CHANGED FILES: $CHANGED_COUNT"
echo "CHANGED TESTS: $CHANGED_TEST_COUNT"
echo ""

# ---------------------------------------------------------------------------
# 5b. Security & code-quality batch scan (MODE A — whole working tree)
# ---------------------------------------------------------------------------
# Deliberately NOT gated by MAX_DIFF_FILES: this is a single-process content
# scan (see security-check.mjs / code-quality-check.mjs's CLI batch-scan
# entry points), not a per-file diff-based analysis, so it stays cheap and
# meaningful even when CHANGED_COUNT is in the hundreds.
if [ "$CHANGED_COUNT" -eq 0 ]; then
  echo "SECURITY SCAN:      (no changed .ts/.tsx files to scan)"
  echo "CODE-QUALITY SCAN:  (no changed .ts/.tsx files to scan)"
else
  SEC_SCAN_OUT=$(printf '%s\n' "$CHANGED_FILES" | xargs -d '\n' node .claude/hooks/security-check.mjs 2>&1)
  SEC_SCAN_EXIT=$?
  if [ $SEC_SCAN_EXIT -eq 0 ]; then
    echo "SECURITY SCAN:      PASS ($CHANGED_COUNT file(s) scanned)"
  else
    echo "SECURITY SCAN:      FAIL ($CHANGED_COUNT file(s) scanned)"
    fail "security-check.mjs batch scan found a blocking-severity issue (see scan output below)"
  fi

  CQ_SCAN_OUT=$(printf '%s\n' "$CHANGED_FILES" | xargs -d '\n' node .claude/hooks/code-quality-check.mjs 2>&1)
  echo "CODE-QUALITY SCAN:  ADVISORY (never fails; see scan output below if findings exist)"
fi
echo ""

# ---------------------------------------------------------------------------
# 6-18. Diff-based checks (MODE B — changed-files/PR verification)
# ---------------------------------------------------------------------------
# Designed for a PR-sized change. In a long-running session with many
# uncommitted milestones (this repo's own real history: 30+ commits behind
# HEAD is normal), the "changed files" set against a stale base ref can
# balloon to the entire working tree, making per-file diff analysis both
# slow and not actually meaningful (it's not reviewing "a change," it's
# re-auditing everything). Cap it explicitly rather than hanging silently.
MAX_DIFF_FILES=60
if [ "$CHANGED_COUNT" -eq 0 ]; then
  echo "(no changed .ts/.tsx files detected against $BASE_REF — skipping diff-based checks 6-18)"
elif [ "$CHANGED_COUNT" -gt "$MAX_DIFF_FILES" ]; then
  echo "WARN: diff-based review skipped because working tree exceeds configured threshold."
  echo "($CHANGED_COUNT changed files exceeds the MAX_DIFF_FILES=$MAX_DIFF_FILES-file diff-review threshold —"
  echo " skipping checks 6-18. This usually means the base ref (HEAD~1 or merge-base) is stale relative to a"
  echo " long uncommitted session, not that $CHANGED_COUNT files were genuinely changed in one PR. Mode A"
  echo " above (tsc/eslint/vitest/build + the whole-tree security/code-quality batch scan) already ran"
  echo " regardless of this threshold. Re-run with a narrower base ref (e.g. 'git diff --name-only"
  echo " <recent-commit>') if you want Mode B's per-file diff checks for a real change.)"
  warn "diff-based review (checks 6-18) skipped: $CHANGED_COUNT changed files exceeds MAX_DIFF_FILES=$MAX_DIFF_FILES"
else
  # -------------------------------------------------------------------------
  # 6/7. Weakened / removed tests
  # -------------------------------------------------------------------------
  for f in $CHANGED_TESTS; do
    [ -f "$f" ] || continue
    if [ -n "$BASE_REF" ]; then
      DIFF_OUT=$(git diff "$BASE_REF" -- "$f" 2>/dev/null)
    else
      DIFF_OUT=$(git diff HEAD -- "$f" 2>/dev/null)
    fi
    REMOVED_ITS=$(printf '%s\n' "$DIFF_OUT" | grep -cE '^-.*\b(it|test)\(')
    ADDED_ITS=$(printf '%s\n' "$DIFF_OUT" | grep -cE '^\+.*\b(it|test)\(')
    if [ "$REMOVED_ITS" -gt "$ADDED_ITS" ]; then
      fail "$f: removed more it()/test() blocks ($REMOVED_ITS) than were added ($ADDED_ITS)"
    fi
    if printf '%s\n' "$DIFF_OUT" | grep -qE '^\+.*\.(skip|todo)\('; then
      fail "$f: adds .skip(/.todo( to an existing test"
    fi
    if printf '%s\n' "$DIFF_OUT" | grep -qE '^\+\s*//.*expect\('; then
      fail "$f: comments out an expect( assertion"
    fi
  done

  # Vitest include-allowlist check for brand-new test files
  for f in $UNTRACKED; do
    case "$f" in
      *.test.ts)
        if [ -f vitest.config.mts ] && ! grep -qF "$f" vitest.config.mts 2>/dev/null; then
          warn "$f: new test file not present in vitest.config.mts's include list — it will never run"
        fi
        ;;
    esac
  done

  # -------------------------------------------------------------------------
  # 8/9. API security / admin authorization
  # -------------------------------------------------------------------------
  for f in $CHANGED_FILES; do
    case "$f" in
      src/app/api/*/route.ts|src/app/api/*/route.tsx)
        [ -f "$f" ] || continue
        if ! grep -qE "requireUserId|getOptionalUserId|requireRecruiterId|requirePlatformAdmin|requireAdminRoute|getTenantContext|auth\.getUser" "$f"; then
          warn "$f: no server-side identity resolution call found — confirm this route is intentionally unauthenticated"
        fi
        case "$f" in
          src/app/api/admin/*)
            if ! grep -qE "requireAdminRoute|requirePlatformAdmin" "$f"; then
              fail "$f: under src/app/api/admin/** with no requireAdminRoute()/requirePlatformAdmin() call"
            fi
            ;;
        esac
        if grep -qE '(const|let)\s*\{[^}]*\b(userId|recruiterId|organizationId|role|plan)\b[^}]*\}\s*=\s*await\s*req\.json\(\)' "$f"; then
          warn "$f: destructures an identity-shaped field (userId/recruiterId/organizationId/role/plan) directly from the request body — confirm it is never trusted as an authorization decision"
        fi
        ;;
    esac
  done

  # -------------------------------------------------------------------------
  # 10. IDOR/ownership
  # -------------------------------------------------------------------------
  OWNERSHIP_TABLES="recruiter_candidates recruiter_jobs resume_versions platform_billing_customers platform_subscriptions platform_entitlement_overrides"
  for f in $CHANGED_FILES; do
    case "$f" in
      src/lib/*/*.ts)
        [ -f "$f" ] || continue
        for t in $OWNERSHIP_TABLES; do
          if grep -q "\.from(\"$t\")" "$f"; then
            if ! grep -qE '\.eq\("(recruiter_id|user_id)"' "$f"; then
              warn "$f: queries $t with no visible .eq(\"recruiter_id\"|\"user_id\", ...) filter in the file — confirm ownership scoping"
            fi
          fi
        done
        ;;
    esac
  done

  # -------------------------------------------------------------------------
  # 11/12. LLM call protection
  # -------------------------------------------------------------------------
  for f in $CHANGED_FILES; do
    case "$f" in
      src/app/api/ai/*/route.ts)
        [ -f "$f" ] || continue
        if grep -qE "openai\.(chat|responses|embeddings)\.|new ChatOpenAI" "$f"; then
          if ! grep -qE "requireFeature\(|requireQuota\(" "$f"; then
            warn "$f: directly invokes an LLM client with no requireFeature()/requireQuota() in this file — confirm the gate lives in the called service instead, or that this route is intentionally anonymous/free"
          fi
        fi
        ;;
    esac
  done

  # -------------------------------------------------------------------------
  # 13. Stripe/billing changes
  # -------------------------------------------------------------------------
  for f in $CHANGED_FILES; do
    case "$f" in
      src/lib/billing/platform-stripe-provider.ts|src/lib/billing/platform-billing-service.ts|src/lib/billing/platform-subscription-service.ts|src/app/api/billing/*/webhook/route.ts|src/lib/billing/stripe-provider.ts|src/lib/billing/billing-service.ts)
        warn "$f: Stripe/billing-critical file changed — manually re-verify signature verification, raw-body handling, and event-ordering guard before merging"
        ;;
    esac
  done

  # -------------------------------------------------------------------------
  # 14. Supabase access patterns
  # -------------------------------------------------------------------------
  for f in $CHANGED_FILES; do
    case "$f" in
      src/lib/supabase/admin.ts|src/lib/supabase-server.ts|src/lib/supabase-browser.ts|*.test.ts) ;;
      src/lib/*/*.ts|src/app/api/*/*.ts)
        [ -f "$f" ] || continue
        if grep -qE "createClient\(" "$f"; then
          warn "$f: constructs a Supabase client outside the established supabaseAdmin/supabase-server/supabase-browser helpers"
        fi
        ;;
    esac
  done

  # -------------------------------------------------------------------------
  # 15. React/Next.js conventions
  # -------------------------------------------------------------------------
  for f in $CHANGED_FILES; do
    base=$(basename "$f")
    if [ "$base" = "middleware.ts" ]; then
      fail "$f: this Next.js 16 repo uses proxy.ts, not middleware.ts — confirm this is intentional"
    fi
    if [ -f "$f" ] && head -5 "$f" | grep -q '"use server"'; then
      warn "$f: introduces a \"use server\" Server Action — none exist in this repo today; confirm this is a deliberate convention shift"
    fi
    case "$f" in
      src/app/api/*/route.ts)
        [ -f "$f" ] || continue
        if grep -qE '\{\s*params\s*\}' "$f" && ! grep -qE 'await\s+params' "$f"; then
          warn "$f: destructures { params } without an await params — params is a Promise in this Next.js version"
        fi
        ;;
    esac
  done

  # -------------------------------------------------------------------------
  # 16. Performance regressions
  # -------------------------------------------------------------------------
  for f in $CHANGED_FILES; do
    [ -f "$f" ] || continue
    # Single grep -A pass instead of a per-match subprocess loop — same
    # signal (an entitlement/identity call within 8 lines after a .map()/
    # .forEach()), far cheaper on a file with many matches.
    if grep -A8 -E "\.(map|forEach)\(" "$f" 2>/dev/null | grep -qE "requireUserId\(|requireFeature\(|requireQuota\(|getOptionalUserId\("; then
      warn "$f: an entitlement/identity resolution call appears near a .map()/.forEach() block — confirm this isn't a per-item re-check that should happen once"
    fi
  done

  # -------------------------------------------------------------------------
  # 17. Error handling — secret/raw-object leakage
  # -------------------------------------------------------------------------
  for f in $CHANGED_FILES; do
    [ -f "$f" ] || continue
    if grep -qE "console\.(log|error)\([^)]*process\.env" "$f"; then
      fail "$f: logs process.env directly — risk of leaking a secret"
    fi
    if grep -qE "NextResponse\.json\(\s*\{[^}]*process\.env" "$f"; then
      fail "$f: response body includes process.env directly"
    fi
  done

  # -------------------------------------------------------------------------
  # 18. Accessibility (changed .tsx only)
  # -------------------------------------------------------------------------
  for f in $CHANGED_FILES; do
    case "$f" in
      *.tsx)
        [ -f "$f" ] || continue
        if grep -qE "<button[^>]*>\s*</button>|role=\"button\"[^>]*>\s*</" "$f"; then
          warn "$f: possible interactive element with no visible text/aria-label — spot check"
        fi
        ;;
    esac
  done
fi

echo ""
if [ ${#FINDINGS[@]} -gt 0 ]; then
  printf '%s\n' "${FINDINGS[@]}"
  echo ""
fi

if [ $TSC_EXIT -ne 0 ]; then
  echo "--- tsc output ---"
  echo "$TSC_OUT" | tail -60
  echo ""
fi
if [ $LINT_EXIT -ne 0 ]; then
  echo "--- eslint output ---"
  echo "$LINT_OUT" | tail -60
  echo ""
fi
if [ $TEST_EXIT -ne 0 ]; then
  echo "--- vitest output (tail) ---"
  echo "$TEST_OUT" | tail -80
  echo ""
fi
if [ $BUILD_EXIT -ne 0 ]; then
  echo "--- build output (tail) ---"
  echo "$BUILD_OUT" | tail -60
  echo ""
fi
if [ -n "$SEC_SCAN_OUT" ]; then
  echo "--- security-check.mjs batch scan output ---"
  echo "$SEC_SCAN_OUT"
  echo ""
fi
if [ -n "$CQ_SCAN_OUT" ]; then
  echo "--- code-quality-check.mjs batch scan output ---"
  echo "$CQ_SCAN_OUT"
  echo ""
fi

if [ $FAILS -gt 0 ]; then
  echo "RESULT: FAIL ($FAILS fail-level finding(s), $WARNS warning(s))"
  exit 1
elif [ $WARNS -gt 0 ]; then
  echo "RESULT: PASS WITH WARNINGS ($WARNS warning(s))"
  exit 0
else
  echo "RESULT: PASS"
  exit 0
fi
