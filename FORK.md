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
npm i -g https://github.com/rkostko-ops/cmem/releases/download/v0.5.4-fork.3/colbymchenry-cmem-0.5.4-fork.3.tgz
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

**Not released yet:** no tag and no Release tarball exist for fork.4. The `Install` section above
still points at fork.3, so a fresh `npm i -g` from that URL will silently revert these changes.
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

## Corrections to `opis_dzialania_narzedzia.md`

That document describes the tool accurately at a high level, with two caveats:

1. It states that synthesis *"deduplicates lessons by embedding similarity"*. That was the intent, not
   the shipped behaviour: upstream and fork.2 used lexical word overlap. It became true only in
   fork.3 (change 4 above).
2. On retrieval it does not mention that lesson lookup — both the `consult` hook and the
   `search_lessons` MCP tool — filters on `project_path = ?` with **exact** string equality, defaulting
   to the current working directory. There is no cross-project search and no prefix matching, so a
   session started in a subdirectory sees none of the parent directory's lessons, and vice versa.
