# cmem — fork notes

This repository is a **fork of `@colbymchenry/cmem` 0.5.4** (MIT, © Colby McHenry). Upstream is not
published on npm and has no public repository, so this fork is **dist-only**: there are no TypeScript
sources here, only the built bundles under `dist/`. Patches are applied directly to those bundles.

See [`LICENSE`](LICENSE) and [`REDISTRIBUTION.md`](REDISTRIBUTION.md) for attribution terms.

A Polish-language walkthrough of how the tool works end to end is included as
[`opis_dzialania_narzedzia.md`](opis_dzialania_narzedzia.md) — see *Corrections* at the bottom of this
file for the two places where it describes intent rather than the shipped code.

## Install

```bash
npm i -g https://github.com/rkostko-ops/cmem/releases/download/v0.5.4-fork.7/colbymchenry-cmem-0.5.4-fork.7.tgz
```

**The package name must stay scoped (`@colbymchenry/cmem`).** Claude Code hooks reference
`$(npm root -g)/@colbymchenry/cmem/dist/hooks/{sync,consult}.js`; installing it unscoped breaks
those paths and the hooks silently stop running. The `cmem` binary name is independent of the scope.

After installing, hooks work immediately — they are fresh `node` processes per event. The MCP server
(`dist/mcp/server.js`) is long-lived, so changes to *it* require restarting Claude Code.

## Changes in this fork

### fork.1 — `vec0` KNN → `vec_distance_L2()`

`search_lessons` threw a `vec0` KNN error on this sqlite-vec version. All entry points
(`cli.js`, `hooks/consult.js`, `hooks/synthesize.js`, `mcp/server.js`) now compute distance with
`vec_distance_L2(embedding, ?)` and `ORDER BY distance ASC` instead of a `MATCH ... k=N` query.

### fork.2 — correct `project_path` attribution for synthesized lessons

Synthesis took the project path from `sessions.project_path`, which is frequently empty (no
`sessions-index.json`), so roughly 99% of auto-generated lessons landed with an empty
`project_path` and were invisible to `list_lessons`. Synthesis now threads the path from the queue
item: `projectPathOverride || session.projectPath || ""` (commit `faa9ea2`).

### fork.3 — calibrated retrieval thresholds and semantic dedup

Every number below was measured on a real installation (2,420 sessions, 3,302 active lessons,
pools of 230–839 lessons per project), not guessed.

**1. Relevance threshold: `1.2` → `0.85` (`hooks/consult.js`).**
Embeddings are normalized, so L2 distances are bounded and in practice compressed: across four
project pools the *largest* prompt-to-lesson distance observed was 1.147–1.163. A cut-off of 1.2
therefore sat above the maximum and rejected **nothing** — 100% of every pool passed the filter, and
the hook always injected the top-5 nearest neighbours regardless of relevance. `0.85` is roughly the
10th percentile of the real distribution.

**2. Slot budget: `maxSemantic` 5 → 3, `maxCore` 3 → 1.**
`getCoreLessons()` is query-independent and orders by `times_validated DESC, confidence DESC,
times_applied DESC`. Since `times_validated` is almost always 0 (22 validations against 22,395
injections on the measured install), core selection effectively ranked by `times_applied` — a counter
incremented by the act of injection itself, which makes the ranking self-reinforcing. Three of eight
injected lessons were chosen this way, with no relation to the prompt.

**3. Missing `.slice(0, maxSemantic)` (`hooks/consult.js`).**
The search fetched `maxSemantic * 2` candidates ("fetch extra since we'll filter") but never trimmed
the filtered result, so the limit applied twice. With a threshold that rejected nothing, the block was
always capped by `MAX_TOTAL_LESSONS` at exactly 8 lessons.

**4. Lexical dedup → semantic dedup (`hooks/synthesize.js`).**
`isTooSimilar()` compared word-overlap ratio and required `> 0.85`, i.e. near-identical text. Any
paraphrase passed, and cross-language paraphrases (this user works in Polish and English) always
passed: on the measured install a single fact about one CLI's behaviour existed as **17 active
lessons across 9 project paths**, with pairwise distances of 0.338–0.793. Dedup now compares
embedding distance and rejects at `< 0.48`.

**5. Symmetric dedup metric (`hooks/synthesize.js`).**
Stored lesson embeddings come from `buildEmbeddingText()` (labelled: `Title:` / `Category:` /
`When to apply:` / `Insight:` / `Reasoning:`), but dedup embedded a raw `title + trigger + insight`
concatenation — comparing differently-formatted texts inflated every distance. Both sides now use the
labelled format; the median distance between known duplicates dropped from 0.582 to 0.422.

*How `0.48` was chosen:* percentiles alone were not enough, because the distance distributions of
duplicates and of ordinary new lessons overlap (p50 0.422 vs 0.477). Twelve pairs from the decision
band were read by hand: everything in 0.328–0.453 was a genuine duplicate, and the first
non-duplicates appear at 0.528 and 0.536 — one of them stating the *opposite* advice of its neighbour,
which must not be merged. `0.48` sits inside that margin.

**6. Synthesis prompt hardened (`cli.js`, `hooks/synthesize.js`).**
The extraction prompt now states a hard limit of at most 3 lessons per session, prefers one durable
lesson over several mediocre ones, treats an empty array as the correct answer for a routine session,
and forbids restating what is obvious from the codebase. A `.slice(0, 3)` guard backs this up in code.
Previously only `cli.js` carried the prompt patch while the hook — the path that actually runs after
every `Stop` — did not.

**Measured effect** (same prompts, before → after): an on-topic prompt went from 8 lessons /
~1,481 tokens to 3 lessons / ~547 tokens, and an off-topic prompt from 8 lessons / ~1,552 tokens to
1 lesson / ~160 tokens.

### fork.4 — stop presenting lessons as established fact; decircularise the core slot

Only `hooks/consult.js` is patched — `getCoreLessons()` is duplicated in four bundles (`cli.js`,
`mcp/server.js`, `hooks/consult.js`, `hooks/synthesize.js`), and the injection path is the only one
where the self-reinforcing ranking does damage; the others merely order listings.

**1. The injected block no longer asserts truth.**
`formatForInjection()` opened with *"The following is established knowledge about this project."*
Lessons are LLM-synthesized claims that nothing verifies, and on the measured install two false
lessons about cmem itself were being injected under that heading — one contradicting the code, one
contradicting the hook configuration. The header now reads *"Claims from earlier sessions — may be
stale or wrong; verify before relying on them."* (one line, no extra tokens).

**2. `_(High confidence …)_` no longer contradicts its own number.**
The footer printed `_(High confidence - validated ${timesValidated} times)_` whenever
`confidence >= 0.8`. Since `times_validated` is ~0 corpus-wide (25 validations against 12,629
injections), the block could literally claim *"High confidence – validated 0 times"* — asserting
authority from a counter that says the opposite. It now prints `_(Validated N times)_` only when
`times_validated > 0`, so the label appears solely where a human actually confirmed something.

**3. Core-slot tiebreaker: `times_applied DESC` → `created_at DESC`.**
`times_applied` is incremented by injection, not by usefulness, so ranking on it is self-confirming:
2,276 of 3,309 active lessons have 0, while 84 lessons with 50+ would hold the core slot forever.
Ordering is now `times_validated DESC, confidence DESC, created_at DESC` — recency is at least
non-circular. Note the fork.3 note above overstated this: `times_applied` was already the *third*
key behind a `confidence >= 0.7` gate, so with `maxCore = 1` the blast radius is one slot.

*Verified end-to-end* against a WAL-consistent snapshot of the real database with `HOME` redirected
(`CMEM_DIR` is hardcoded to `$HOME/.cmem` — there is no env override): an on-topic prompt returned
4 lessons, an off-topic prompt 1 (core only), and the live database was left untouched.

*Corpus note:* the fork.3 figure of "17 active lessons across 9 project paths" holds up when counted
by lessons whose **title** carries the fact. A wider `title OR insight LIKE` count returns 44, but 27
of those merely mention the fact while covering something else — do not read that as redundancy. The
genuine within-project surplus was 5 pairs, archived after reading each pair in full.

### fork.5 — recalibrated dedup threshold (0.48 → 0.35) and aligned CLI bundle

**1. Threshold `0.48` → `0.35` (`hooks/synthesize.js`).** The fork.3 figure was calibrated on twelve
hand-read pairs drawn from the decision band — too small and too biased a sample. Measured over the
full distribution instead (distance to the nearest *other* lesson, three project pools, ~1,600
lessons), `0.48` would reject **65–88% of genuinely distinct lessons** had they arrived as new. From
about `0.38` upwards the matches come from **rhetorical form** rather than content: two unrelated
pieces of advice that merely open with the same phrase sit at `0.403`. Below `0.35` every borderline
pair inspected was a real duplicate.

| threshold | share of existing, distinct lessons that would be rejected as duplicates |
|---|---|
| 0.32 | 0–8% |
| **0.35** | 4–19% |
| 0.40 | 28–38% |
| 0.48 | 65–88% |

Under-merge is the safe failure mode here: a duplicated lesson costs one injection slot, a wrongly
rejected one costs the knowledge for good — and it costs exactly the class of knowledge that reading
the code cannot recover (decisions, rationale, "what we deliberately did not build").

**2. The CLI bundle was still running the pre-fork.3 dedup (`cli.js`).** fork.3 patched only the hook.
`cli.js` embedded a raw `title trigger insight` concatenation — asymmetric against the labelled text
the database stores — and decided with the lexical `isTooSimilar()` (word overlap > 0.85). So
`cmem synthesize` from the CLI behaved differently from the automatic path after `Stop`. Both entry
points now build the same labelled embedding text and apply the same threshold.

**3. Correction to the fork.3 note above: semantic dedup does NOT catch cross-language paraphrases.**
That claim was wrong. Measured: a paraphrase of the same fact in the other language sits **0.575**
from its original and falls outside the ten nearest neighbours, while the same paraphrase in the
original language sits at **0.327** (neighbour #1). The embedding model clusters by language before
content. **No threshold fixes this — do not tune for it.** Cross-language duplicates are caught only
when shared literals (identifiers, hostnames, file names) dominate the text.

**Also worth knowing:** `dedupeAndStore()` has a `catch` that stores the lesson **without** dedup when
`getEmbedding()` throws. That is deliberate fail-open behaviour for a memory system — losing the dedup
is cheaper than losing the lesson — but it means an embedding outage silently disables deduplication.

## Working on this fork

Because there are no sources, edits go straight into `dist/*.js` in this repository — then commit,
then copy the changed files into the global install:

```bash
cp dist/hooks/{consult,synthesize}.js "$(npm root -g)/@colbymchenry/cmem/dist/hooks/"
cp package.json "$(npm root -g)/@colbymchenry/cmem/package.json"
```

Two traps worth knowing:

- **Constants are duplicated across bundles.** `consult.js`, `synthesize.js`, `mcp/server.js` and
  `cli.js` each carry their own copy, and the same identifier can mean different things —
  `SIMILARITY_THRESHOLD` is an L2 distance cut-off in `consult.js` and a word-overlap ratio in
  `synthesize.js`. Patching one file changes nothing in the others.
- **Patching only the install silently diverges from this repo** and is erased by the next reinstall.
  After any change, `diff` every bundle between the repo and the install, and bump the version on both
  sides.

Release flow: edit `dist/` → commit → `npm pack` → tag `v<version>` → GitHub Release with the tarball
as an asset (the install command above points at that asset).

### fork.6 — the "core" slot was frozen on a single lesson, and it was not relevant

`getCoreLessons` orders by `times_validated`, a counter that is greater than zero for only a handful
of lessons in any real corpus. The result is not a ranking but a **permanent winner**: the same lesson
was injected into **435 of 487 real prompts (89.3%)**, taking roughly **26% of the injection budget**
regardless of what was asked.

Blind relevance rating (Opus, raters given no position or distance information, 45 real prompts):

| candidate source | rated RELEVANT |
|---|---|
| core slot (39 injections) | **8%** |
| a lesson picked **at random** from the same project | **7%** |
| top-1 semantic neighbour | 56% |

The core slot was statistically indistinguishable from random selection, so `maxCore` goes `1 → 0`
in `hooks/consult.js`. Measured over 43 prompts, dropping it **dominates** the previous behaviour:

| variant | slots/prompt | precision | coverage |
|---|---|---|---|
| core + 3 semantic | 3.86 | 36.7% | 76.7% |
| **3 semantic only** | **3.00** | **45.0%** | **76.7%** |

Fewer tokens, higher precision, coverage unchanged.

> **Caveat on the absolute numbers.** The replay queries *today's* corpus with *historical* prompts,
> so 28.8% of the rated lessons did not yet exist when the prompt was issued — and those score 57.1%
> versus 20.2% for genuinely available ones. Restricted to lessons that existed at prompt time,
> top-1 relevance is **25%**, not 51%, and overall precision is nearer **30% than 44%**. The
> *comparisons* above hold (every variant was scored against the same corpus, so the leak applies
> uniformly); the absolute figures are optimistic.

### fork.7 — mark lessons that a newer one supersedes (shadow mode by default)

Semantic dedup (`0.35`) catches **textual twins**, never **contradictions**, so the corpus quietly
accumulates successive *versions* of the same decision, all of them active. Measured on a real
corpus: one project had 98 active lessons about a single module, two of them written on the same day
describing **opposite** variants of the same decision — both still active long after the choice had
been reversed. Blind rating confirmed such lessons reach the output labelled **MISLEADING**, which is
the most expensive failure mode: the model acts on a false premise and nothing signals it.

The check runs **at write time and in the background** (synthesis is already a detached process), so
it adds nothing to the latency of the user's prompt path. After a lesson is stored, up to five
**older** neighbours from the `0.35–0.60` band are sent to a single `haiku` call asking whether the
new lesson **invalidates** any of them. Verdicts land in new columns `superseded_by`, `superseded_at`
and `superseded_reason` (added idempotently via `ensureSupersedeColumns`).

Mode is set by `CMEM_SUPERSEDE`: **`shadow`** (default — records the verdict, changes nothing),
`enforce` (also sets `archived = 1`), `off`. It ships in shadow mode deliberately: the mechanism's
accuracy on a given corpus is unknown, and a wrong archival costs knowledge permanently.

**Prompt calibration matters more than the threshold.** The first version wrongly marked a lesson
listing four independent facts as superseded, because the new lesson changed exactly one of them —
it would have discarded three still-valid facts. Lessons are **multi-fact**, so the prompt now carries
a *wholeness test*: answer SUPERSEDED only when the candidate's **entire** content is obsolete; if a
single fact still holds, answer KEEP. After the fix the multi-fact case scored 5/5 KEEP and a
genuinely reversed single-fact lesson was correctly marked.

Safeguards: at most 2 marks per new lesson, verdicts accepted only for ids from the candidate list,
fail-open on both model errors and unparseable JSON, and a JSONL audit trail at `~/.cmem/supersede.log`.
Verified against a database copy: shadow does not archive · the 2-mark cap holds · garbage from the
model changes nothing · a model error changes nothing · foreign ids are rejected · `enforce` archives
· `off` is inert.

Both bundles were patched. `cli.js` and `hooks/synthesize.js` carry **separate copies** of
`dedupeAndStore` — the same divergence fork.3 had to repair — and the inserted blocks were verified
byte-identical. The manual `save_lesson` path is deliberately untouched.

## Corrections to `opis_dzialania_narzedzia.md`

That document describes the tool accurately at a high level, with two caveats:

1. It states that synthesis *"deduplicates lessons by embedding similarity"*. That was the intent, not
   the shipped behaviour: upstream and fork.2 used lexical word overlap. It became true only in
   fork.3 (change 4 above).
2. On retrieval it does not mention that lesson lookup — both the `consult` hook and the
   `search_lessons` MCP tool — filters on `project_path = ?` with **exact** string equality, defaulting
   to the current working directory. There is no cross-project search and no prefix matching, so a
   session started in a subdirectory sees none of the parent directory's lessons, and vice versa.
