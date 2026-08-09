# Phase 13 Milestone 7 — Enterprise LinkedIn Profile Optimizer

## Goal

Generate a complete, recruiter-grade LinkedIn profile — headline,
About, experience, projects, skills, featured section, career
interests, recruiter/networking messages, banner tagline, and
personal-branding bios — plus an SEO analysis and an 11-part profile
score, all grounded in the candidate's real resume, the Resume Rewrite
Engine's accepted output (when available), and a JD match's ATS
analysis (when available). Unlike Milestone 6's cover letters, this is
resume-driven, not job-application-driven: a LinkedIn profile outlives
any one job application.

## Architecture

```
Resume (required)
        +
RewriteRecord (optional, accepted Experience section — Milestone 5)
        +
JdMatchResult (optional, matched/missing skills — Milestone 1)
        │
        ▼
POST /api/ai/linkedin              LinkedinService.start()
  {resumeId, rewriteId?,             │  resolves resume/rewrite/JD-match
   jdMatchId?, careerGoal?,          │  read-only, defaults targetRole
   targetRole?, industry?,           │  from JD jobTitle, industry from
   yearsOfExperience?,               │  JD domain — no LLM call yet
   volunteerWork?, publications?,    ▼
   patents?, licenses?}        LinkedinRecord (empty sections)
        │
        ├─► POST .../headline {style}       → headline-generator.ts  (1 call/style)
        ├─► POST .../headline/accept {style}
        ├─► POST .../about {storyType}      → about-generator.ts     (1 call/story, 2600-char cap)
        ├─► POST .../about/accept {storyType}
        ├─► POST .../experience             → experience-generator.ts (1 bulk call, 1 variant/bullet)
        ├─► POST .../projects               → experience-generator.ts (1 bulk call, 1 variant/project)
        ├─► POST .../skills                 → skills-generator.ts    (1 call + possession backstop)
        ├─► POST .../featured               → featured-generator.ts  (deterministic, no LLM)
        ├─► POST .../recommendations        → recommendation-generator.ts (1 call, 6 types)
        ├─► POST .../banner                 → banner-generator.ts    (1 call, tagline + 6 bios)
        ├─► POST .../career-interests        → passthrough merge (user-supplied only)
        ├─► GET  .../seo                    → seo-engine.ts          (deterministic)
        ├─► GET  .../score                  → profile-score.ts       (deterministic)
        └─► GET  .../export?format=...      → export-service.ts      (6 formats)
```

Every generator that calls the LLM shares `validator.ts`'s
`SAFETY_RULES_PROMPT` and is checked by `validateLinkedinContent()`
before being stored; a failed check triggers one corrective retry with
the specific violations named, then either drops the offending
item (bulk experience/project bullets fall back to the original text
per-item) or raises an error (single-output artifacts with no
"original" to fall back to).

## Design decisions

**Sections with no resume field are user-input-driven, never
invented.** `resume-schema.ts` has no `volunteerWork`/`publications`/
`patents`/`licenses` fields, so these four sections only ever contain
text the user explicitly typed into the setup form — an empty input
means an omitted section, never a fabricated one.

**Profile Variants are a `targetRole` UI preset, not a backend
concept.** The 8 named archetypes (Enterprise/Startup/FAANG/AI
Engineer/Full Stack/Solution Architect/Technical Lead/Engineering
Manager) are one-click buttons in `LinkedinSetupForm` that fill the
`targetRole` field — every prompt already takes `targetRole` as
framing context, so this avoids inventing a second, expensive
regenerate-everything axis on top of Headline's own 7 tone styles.

**Cost shape: one call per requested artifact, never N-styles ×
M-variants in one call.** Direct reuse of Milestone 5's real lesson (a
bulk call asking for too much per-item output silently truncates its
own array) — every bulk generator (experience, projects) asks for
exactly one variant per item and states "EXACTLY N entries" explicitly
in the prompt.

## Generation flow

- **Headline** — one call per requested style (short output, cheap to
  regenerate in every style before choosing).
- **About** — one call per requested story-type; the 2600-character cap
  is stated in the prompt and enforced with a deterministic post-check
  in `linkedin-service.ts` (retry with a "tighten this" correction if
  over-length), independent of the anti-fabrication validator retry.
- **Experience** — one bulk call, one rewrite per bullet, sourced from
  the Resume Rewrite Engine's accepted Experience section when present
  (`rewriteRecord.sections.experience.current`), else the raw resume.
  ATS keywords per bullet are re-derived deterministically by
  substring-matching the JD's real skill list against the rewritten
  text — never trusting the model's own self-reported keyword list.
- **Projects** — same one-variant-per-item bulk shape, sourced from
  `resume.projects`; short-circuits to an empty array with no LLM call
  when the resume has no projects, rather than inventing one.
- **Skills** — one LLM categorization call into the package's own
  12-category scheme, filtered through a deterministic
  `filterToActuallyPossessedSkills` backstop (ported from Milestone
  5's `skills-rewriter.ts`) that drops anything not actually present on
  the resume.
- **Featured** — fully deterministic, no LLM call. Builds suggestions
  from `resume.contact.github`/`website` (real link if present, else an
  `isGap: true` "add this" suggestion), `resume.projects`, and
  `resume.certifications` — Featured needs real, clickable content, not
  creative writing.
- **Recommendation/networking messages** — one call, all 6 types
  (Connection Request/Recruiter Outreach/Hiring Manager Outreach/
  Follow-up/Thank-you/Referral Request) together, using
  `[Name]`/`[Recruiter's Name]` placeholders rather than inventing a
  real person.
- **Banner & personal branding** — one call, a tagline plus all 6
  platform bios (Professional/Conference/Medium/GitHub/Portfolio/
  Twitter-X) together.
- **SEO** and **Profile Score** — fully deterministic, recomputed fresh
  on every call from whatever has actually been generated/accepted so
  far, never cached stale.

## SEO engine

`computeSeoReport()` resolves its keyword list from
`JdMatchResult.matchedSkills + missingSkills` when a JD match is
present, else falls back to the resume's own `skills + technicalSkills`.
For each keyword it checks presence in the accepted headline, accepted
About text, generated skills, and generated experience bullets via a
word-boundary substring match (`containsWholeTermLoose`), then computes:

- `searchRankingScore = coverageRatio * 70 + headlineHitRatio * 30`
- `recruiterVisibilityScore = coverageRatio * 60 + sectionsPresentRatio * 40`

plus templated recommendations naming the specific missing keywords.
Critically, when a JD demands a more specific technology than the
resume actually has (e.g. "Spring Boot"/"Spring Security" vs. the
resume's plain "Spring"), the engine reports it as a **missing**
keyword rather than ever treating it as already covered — the same
"never trust self-report, only real grounded skills" discipline the
validator enforces on generated text.

## Profile score algorithm

`computeProfileScore()` derives all 11 sub-scores directly from what is
actually present on the record — no LLM call:

| Score | Basis |
|---|---|
| Headline | 0 none generated, 70 generated not accepted, 100 accepted |
| About | 0 none generated, 70 generated not accepted, 100 accepted |
| Experience | 0 not generated, 80 generated |
| Skills | scaled by category/skill count generated |
| Projects | 0 if resume has no projects or none generated, else scaled |
| Keyword | reuses the SEO report's own coverage ratio when computed |
| Recruiter | scaled by whether Headline/About/Skills/messages exist |
| SEO | reuses `seo.searchRankingScore` |
| Networking | 100 once recommendation messages are generated |
| Visibility | reuses `seo.recruiterVisibilityScore` |
| Overall | average of the 10 section scores |

Every entry pairs its numeric score with a templated, non-empty
`recommendation` string explaining what to do next to raise it — a
hard spec requirement, verified in real testing (see below).

## Validation rules

`validator.ts` is ported near-verbatim from Milestone 6's
twice-hardened `cover-letter/validator.ts`, adapted to build its
grounding corpus from the resume **and** the Resume Rewrite Engine's
accepted sections **and** (when present) the JD, rather than resume+JD
only:

1. Well-known companies mentioned that aren't a real resume employer.
2. Certification names not matching a real `resume.certifications[].name`.
3. Named technologies grounded in neither the resume/rewrite corpus nor
   the JD.
4. **Possession-claim check** — a technology grounded only in the JD
   (not the resume/rewrite corpus) counts as fabrication when it
   follows a first-person possession phrase ("my expertise/skills/
   experience/background", "I have/bring/possess/am proficient/am
   skilled/am experienced") — via the negative-lookbehind regex that
   took two iterations to get right in Milestone 6, applied here from
   the start: the possession marker only fires when *not* immediately
   preceded by an aspirational verb (deepen/expand/grow/develop/build/
   strengthen/broaden/learn/improve/advance), so honest phrasing like
   "eager to expand my skills in PostgreSQL" is correctly never flagged.
5. Numbers/metrics and dates not grounded in the resume/rewrite corpus.
6. Never invent volunteer work, publications, patents, or licenses —
   only ever reference ones explicitly supplied via the setup form's
   optional fields; an unsupplied section is omitted, not invented.

## What real testing found

A full end-to-end HTTP walkthrough was run on a fresh dev server
(resume upload → JD match → Resume Rewrite Engine Experience section
generated and accepted → LinkedIn session started with all three IDs →
3 headline styles generated and one accepted → 2 About story-types
generated, both under the 2600-char cap, one accepted → Experience
bullets generated with the full 4/4 item count intact → Projects
correctly returned empty with no LLM call, since the sample resume has
no Projects section → Skills categorized, correctly limited to the
resume's real 6 skills → Featured suggestions built with real GitHub/
certification links and honest gap flags for the missing portfolio/blog
→ all 6 recommendation message types generated → banner tagline + all 6
branding bios generated → SEO analysis correctly reported "Spring
Boot"/"Spring Security" as **missing** keywords rather than claiming
them, since the resume only has plain "Spring" → profile score computed
with all 11 sub-scores carrying a non-empty recommendation → all 6
export formats downloaded successfully, including the new "LinkedIn
Ready Text" copy-paste format → chat integration used to regenerate the
About section in Leadership style (mutation confirmed via a follow-up
GET) and to ask for SEO improvement suggestions).

**No new bugs were found** — every proactively-ported fix from
Milestones 5 and 6 (one-variant-per-item bulk generation, the
negative-lookbehind possession-claim backstop, deterministic-only
Featured/SEO/Score sections) held correctly on the first real test
pass, with zero fabricated technologies, employers, certifications, or
metrics observed anywhere in the generated content. The chat
integration also correctly performed both a mutation (About regenerate)
and a read-oriented request (SEO suggestions) without hitting the
misrouting failure mode Milestones 4/6 found with bare terse commands —
the tested phrasings carried enough resume/LinkedIn signal for the
protected Planner to route correctly. That known, inherited limitation
(a sufficiently terse or ambiguous chat command can still be misrouted
before ever reaching `resume-tool`, since routing itself lives in the
protected Planner) is not re-solved here — it simply wasn't triggered
by this pass's testing.

## Export pipeline

All 6 formats live in one `export-service.ts` (per this milestone's own
15-file budget), fed by a shared `buildLinkedinExportSections()`:
`renderLinkedinMarkdown`/`renderLinkedinPlainText` (flowing document)/
`renderLinkedinHtml` (`#0a66c2` LinkedIn-blue accents)/`renderLinkedinPdf`/
`renderLinkedinDocx` (via `pdfkit`/`docx`, same libraries every export
in this arc uses), plus the new `renderLinkedinReadyText` — labeled
blocks (`HEADLINE:`, `ABOUT:`, `EXPERIENCE N DESCRIPTION:`, `SKILLS
(add each individually):`, `BANNER TAGLINE:`, etc.) matching LinkedIn's
actual profile edit fields, so a user can copy each block directly into
the corresponding LinkedIn UI field. The API route is a thin
format-switch caller identical in shape to Milestone 6's.

## Known limitations

- The `KNOWN_TECHNOLOGIES`/`WELL_KNOWN_COMPANIES` lists in
  `validator.ts` are deliberately short and curated, not exhaustive.
- Featured, SEO, and Profile Score are intentionally deterministic —
  they will never surface a suggestion beyond what real resume/JD data
  supports, which is correct for anti-fabrication but means they can't
  suggest genuinely creative featured content (e.g. an article title)
  the candidate hasn't written yet.
- Chat-driven generation still depends on the protected Planner routing
  the message to `resume-tool`; a sufficiently bare command with no
  resume/LinkedIn signal word can still be misrouted (inherited from
  Milestones 4/6, not re-solved here).
- Career interests are a direct user-input passthrough with light
  formatting only — there is no AI suggestion for preferred roles/
  locations, by design (these are personal preferences, not something
  to infer from a resume).

## Future extensions

- **Cross-artifact consistency pass**: Headline, About, Experience, and
  banner bios are currently generated independently and can lead with
  different achievements; a future pass could feed the accepted
  Headline/About into later prompts so the whole profile reads as one
  coherent narrative.
- **SEO-driven regeneration loop**: surface `seo.missingKeywords` as
  one-click "regenerate emphasizing this" actions on the Headline/About/
  Skills tabs, closing the loop between the SEO report and the content
  that drives it.
- **Recommendation message personalization**: accept an actual
  recipient name/context as an explicit input (mirroring Milestone 6's
  referral-name extension idea) so outreach messages can be sent
  without manual placeholder editing.
- **Multi-profile-variant comparison**: generate the same section under
  two different `targetRole` presets side by side, to help a candidate
  decide which framing to lead with.
