# Phase 13 Milestone 4 — AI Mock Interview Engine

## Goal

Turn Milestone 3's static prep report into an actual interview: one
question at a time, a real typed answer, an honest evaluation, optional
follow-ups, live feedback, and a full readiness report at the end. A
dedicated, stateful `mock-interview` session module — not a replacement
for the existing chatbot, and additive only.

## Architecture

```
Resume  +  JD Match  +  (optional) Prep Report  +  Interview Knowledge Base
        │
        ▼
POST /api/ai/mock-interview  ──────────────────────────►  SessionService.start()
        │
        ▼
question-selector.ts   KB → Prep Report → Resume Projects → JD template → LLM fallback
        │              (priority order; each stage is free until the LLM fallback)
        ▼
interviewer-agent.ts   wraps the question in interviewer-voice text (no LLM call)
        │
        ▼
   candidate answers  ──►  POST /api/ai/mock-interview/[id]/answer
        │
        ▼
evaluation-agent.ts    the ONE real LLM call per turn — scores only the
        │              dimensions relevant to this question's type,
        │              decides if a follow-up is warranted
        ▼
answer-evaluator.ts    composes the raw LLM result into a scored
        │              AnswerEvaluation (weighted overallScore)
        ▼
   follow-up? ──yes──► interviewer-agent presents it, loop repeats
        │no
        ▼
question-selector.ts picks the next question
        │
   ... repeats until "End Interview" ...
        │
        ▼
session-manager.ts (end)  →  score-engine.ts + feedback-agent.ts +
                              buildLearningRoadmap() (reused, read-only)
        │
        ▼
              SessionReport  →  Score / Report / History tabs, 3-format export
```

Session state (`SessionRecord`) lives in an in-memory, 2-hour-TTL store —
the same pattern every service in this arc uses (`resumeService`,
`jdMatchService`, `prepService`).

## Session flow

`session-service.ts` owns persistence and orchestration;
`session-manager.ts` owns the pure state-transition logic for
Pause/Resume/Restart/Skip/Previous/Next/End. The split mirrors this
arc's established "raw operation vs. orchestrating service" pattern
(e.g. Milestone 3's `question-generator.ts` vs `prep-service.ts`):

- **Pause/Resume** — a status flip; `submitAnswer` is rejected while
  paused.
- **Restart** — clears questions/transcript/report, immediately selects
  a fresh Q1 (so the candidate isn't left with an empty session).
- **Skip** — marks the current question (or pending follow-up) as
  missed, then immediately selects and presents the next question.
- **Previous/Next** — pure history navigation through already-asked
  questions (not a way to jump ahead of generation).
- **End** — status → `completed`, then builds the `SessionReport`.
- **"Harder"/"Easier"** — a one-shot `preferredDifficulty` override
  consumed by the next `question-selector.ts` call, then combined with
  Skip to abandon the current question for a new one at that difficulty.

A **Mixed** interview doesn't literally tag every question `type:
"Mixed"` — each question is resolved to a concrete rotating sub-type
(Technical → HR → Project Deep Dive → System Design → Coding
Discussion → Behavioral → Leadership) before question-selector and
evaluation-agent ever see it. This matters: dimension scoring and
category attribution both key off the question's own type, and a
literal "Mixed" type would either force every answer to be scored on
all 12 dimensions or make the report's category breakdown meaningless.

## Question selection strategy

`question-selector.ts` implements the spec's exact priority order:

1. **Knowledge Base** — reuses Milestone 3's `coverTechnicalTopicsFromKb()`
   directly (read-only import from the protected `interview-prep`
   package), which already carries its own word-boundary relevance
   filtering — a topic with real KB coverage never touches the LLM.
2. **Previous Interview Preparation** — if a `prepId` was supplied,
   pulls the next not-yet-asked question straight out of that report's
   already-generated (and already-answered) technical/HR/project/
   system-design question banks. Zero additional cost — this is the
   spec's own named input, made real rather than nominal.
3. **Resume Projects** — deterministic templates ("Walk me through the
   architecture of X...", "What trade-offs did you make...") rotated
   per project so repeated coverage doesn't repeat wording.
4. **JD-driven templates** — deterministic, topic-filled sentences for
   technical topics, plus curated behavioral/coding templates for
   HR and Coding Discussion topics.
5. **LLM fallback** — a single structured-output call, only once 1-4
   are exhausted for the requested type/difficulty.

Every candidate at every stage is checked against a per-session,
normalized set of already-asked question keys — nothing repeats within
a session.

## Evaluation strategy

`evaluation-agent.ts` is the one real per-turn LLM call. It scores only
the dimensions relevant to the question's type (a `DIMENSIONS_BY_TYPE`
table shared with `score-engine.ts`'s category attribution, so both
stay in sync) — a Behavioral question is never scored on
`security`/`performance`, a Technical one is never scored on
`confidence`. `answer-evaluator.ts` then computes the single weighted
`overallScore` as the mean of whichever relevant dimensions the model
actually populated, with a defensive fallback if it scores none of
them.

Follow-ups are decided in the same call: the spec's own example ("I
used Spring Boot" → "Why Spring Boot instead of Quarkus?") is baked
into the prompt as a worked example, and a genuinely thorough answer
can still legitimately trigger a deeper follow-up — this isn't gated
purely on a low score.

## Feedback pipeline

`feedback-agent.ts` has two distinct, both-deterministic responsibilities:
`formatLiveFeedback()` shapes one evaluation for the Live Feedback tab,
and `aggregateSessionFeedback()` ranks recurring strengths/weaknesses/
missing-concepts across the whole transcript by how often they showed
up — a weakness mentioned in 4 of 6 answers surfaces above one
mentioned once. The aggregated summary is then reshaped into the exact
`WeaknessAnalysis` input shape Milestone 3's own (protected, unmodified)
`buildLearningRoadmap()` expects, so the final report's learning plan
reuses real, already-proven bucketing logic rather than re-implementing
one.

`score-engine.ts` is pure math over already-computed per-answer scores:
category scores are attributed by the *question's* type (not just its
raw dimensions, since categories like "Coding" and "Leadership" don't
map to a single dimension name), the overall score is a plain mean of
every answered turn (deliberately *not* a blend of the category
breakdown, since a single-type session would otherwise get dragged
toward untouched categories' zeros), and Interview Readiness blends the
session's demonstrated overall score with Milestone 3's own predicted
readiness (70/30, weighted toward what was just actually demonstrated).

## What real testing found (and fixed)

Two real issues surfaced during live end-to-end testing against the
production routes (resume upload → JD match → prep → session start →
answer → follow-up → controls → hint → end → export → chat), consistent
with this arc's practice of testing against real routes rather than
synthetic checks:

1. **Dimension scores silently on the wrong scale.** The evaluation
   prompt told the model *which* dimensions to score but never stated
   the numeric range — the model defaulted to an implicit 0-5 scale
   (`correctness: 5`, `completeness: 4`, ...) while the schema declared
   0-100. A genuinely strong, fully correct answer scored `overallScore:
   4`, reading as a near-total failure. **Fixed** by adding an explicit
   0-100 range with anchors ("0 means completely wrong/absent, 50 is
   mediocre, 100 is excellent... a genuinely strong answer should score
   80-100") to `evaluation-agent.ts`'s prompt. Re-verified on a fresh
   session: the same class of strong technical answer now scored 95/100,
   and a genuinely vague one still scored realistically low (2-4/100) —
   confirming this was a scale-labeling gap, not a leniency change.

2. **Chat-driven mock-interview replies are sometimes mangled by the
   protected multi-agent layer** (Research/Reviewer/Summarizer,
   `src/lib/ai/multi-agent/`) — an issue *discovered*, not introduced,
   and not fixable within this milestone's scope since that pipeline is
   explicitly protected. Root cause, confirmed via server logs: the
   Coordinator (`multi-agent/coordinator.ts`, protected) already carries
   a special bypass that skips Research/Reviewer/Summarizer entirely
   for `intent === "resume"`, with the comment "resume-tool's context is
   already complete... nothing for Research/Reviewer to meaningfully
   check." That bypass doesn't extend to `intent === "interview"` — so
   mock-interview's self-contained, non-RAG conversational context
   (e.g., "Skip this interview question" → the next question) gets run
   through Reviewer/Summarizer anyway, which were built around
   RAG-snippet-shaped content and sometimes rewrite the reply down to a
   generic greeting or "not available in the knowledge base," even
   though the underlying action **did** succeed. Confirmed via logs
   (`[mock-interview] Question Asked` fired correctly) and by re-fetching
   session state afterward (the skip had genuinely advanced the
   session) that this is purely a reply-phrasing issue, not a state bug.
   **Not fixed** — `ConversationService`, the LangGraph topology, and
   the multi-agent workflow are all explicitly protected for this
   milestone. Documented here as a known limitation instead: chat-driven
   mock interview commands reliably mutate session state, but their
   spoken reply is occasionally unhelpful. The dedicated `/mock-interview`
   page (fully verified — every control, both modes, all three exports)
   is the reliable, primary interface; chat (Section 13) is a best-effort
   secondary layer on top of it, same as the spec frames it ("Extend AI
   Chat," not "chat becomes the interview").

No fabrication observed in this milestone's testing — Technical/System
Design `betterAnswer`/`idealAnswer` content was genuine engineering
guidance, and Behavioral/HR content stayed in the established
second-person coaching voice ("A strong answer would include...")
rather than inventing a first-person narrative, confirming the
anti-fabrication prompt technique proven in Milestone 3 carried over
correctly to this milestone's own evaluation prompt.

## Known limitations

- The model doesn't always score every dimension the prompt asks for
  (e.g. scoring 4 of a Technical question's 6 relevant dimensions,
  leaving the rest null) — `answer-evaluator.ts`'s weighting already
  handles partial coverage correctly (mean over whatever was scored),
  so this is a minor, non-breaking prompt-compliance gap, same class as
  Milestone 3's own documented "occasionally redundant question" gap.
- Category scores read as `0` for any category a session's questions
  never touched (e.g. a pure Technical session shows `leadership: 0`,
  `coding: 0`) — this means "not assessed," not "failed," and the UI
  frames it that way, but the raw number alone doesn't distinguish the
  two.
- The chat integration's command-phrase matching (`matchMockCommand` in
  `interview.tool.ts`) is a fixed set of regex patterns, not
  comprehension — an unusual phrasing of "give me a harder question"
  may not match and will instead be treated as the candidate's answer.
- Chat cannot *start* a new mock interview session from freeform text
  alone (no way to reliably infer interview type/mode from a sentence
  like "Start Java interview" without risking a wrong guess) — a
  session must be started from `/mock-interview`'s Setup tab first;
  chat then commands whatever session is already active.

## Future voice interview extension

Nothing here was built with voice in mind, but the shape is
voice-ready: `interviewer-agent.ts`'s `presentQuestion()`/
`presentClosing()` already produce plain text suitable for TTS with no
markup to strip; `evaluation-agent.ts` and `answer-evaluator.ts` accept
`answerText: string` regardless of whether it originated from typing or
STT transcription, so a voice front-end would only need to add
speech-to-text on the way in and text-to-speech on the way out of the
existing `/answer` route — no changes to the scoring/feedback pipeline
itself. A real voice mode would additionally want: a hard timeout per
question (a human interviewer doesn't wait indefinitely), a
"thinking..." filler cue while `evaluation-agent.ts`'s call is in
flight (currently 5-10s), and probably a lower `temperature` on the
interviewer-voice template pool's tone to keep spoken transitions
predictable.

## Validation results

- Real end-to-end runs via the production routes on a fresh dev server
  (the same Turbopack module-duplication artifact documented in
  Milestone 3 recurred once here after a mid-session code edit —
  resolved the same way, a clean `.next` removal + restart; not a
  production/Vercel concern).
- Full session lifecycle verified: start (KB-sourced Q1) → vague answer
  → follow-up triggered → stronger answer → hint correctly rejected in
  Interview Mode → skip → harder (difficulty override honored) →
  previous/next history navigation → pause blocks answer submission →
  resume → answer → end → report (category scores, topic scores,
  blended readiness score, learning roadmap reuse) → all 3 export
  formats verified as valid files (PDF signature, DOCX signature,
  readable Markdown).
- A second session (HR type, Practice Mode) verified: hint returns
  real, non-answer-leaking guidance; chat-driven skip/answer both
  correctly mutated server-side session state (confirmed via
  `[mock-interview]` logs and a follow-up state fetch), despite the
  documented reply-phrasing limitation above.
- No fabricated LeetCode/HackerRank problem names anywhere — coding
  guidance stays topic/difficulty/platform only, same discipline as
  Milestone 3.
- `npm run lint` — 0 errors (1 pre-existing, unrelated warning).
- `npx tsc --noEmit` — clean.
- `npm run build` — clean; all 6 new routes (`/api/ai/mock-interview`
  and its 5 sub-routes) and the new `/mock-interview` page registered;
  every pre-existing route unchanged.
