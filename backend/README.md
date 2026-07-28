# Ratify Backend

This is the platform that actually reads repositories, builds doctrine, and
reviews pull requests. It is not a thin wrapper around a language model —
most of what it does is deterministic: parsing code, building a graph of
how a repository fits together, mining the history of how a team actually
works, and running explicit policy checks. A model is only ever asked to
reason over context this backend has already assembled; it is never asked
to rediscover the repository from scratch.

This document describes what each part of the system does. It is internal
documentation for a proprietary system — not a setup guide, and this code
is not intended to be run outside of Ratify's own infrastructure.

## How a pull request gets reviewed

```
GitHub  →  webhook receiver  →  job queue  →  worker pipeline  →  API server  →  app
```

**Webhook receiver.** The single entry point for everything GitHub sends
Ratify — installations, pull request events, pushes. Its only job is to
confirm a request genuinely came from GitHub, make sure the same event
isn't processed twice, and hand the work off. It does no analysis itself,
which is deliberate: this is the one component that has to stay fast and
available no matter how much load the rest of the pipeline is under.

**Job queue.** Every unit of work — indexing a repository, analyzing a
pull request, generating evidence, publishing a result — is represented as
an explicit, stateful job record, not a fire-and-forget task. That means
any step can fail, be retried with backoff, or be replayed later without
losing track of what happened or doing duplicate work.

**Worker pipeline.** The pipeline runs in two flows.

*Repository indexing* happens once, when a repository is first connected,
and again incrementally as the repository changes:

1. Clone/sync the repository.
2. Parse its structure — every function, class, interface, import, and
   export — using real parsers, not a model.
3. Build a dependency and call graph from what was parsed.
4. Mine the repository's history: merged pull requests, review comments,
   commit messages, documentation, and architectural decision records.
5. From that history, infer candidate doctrine — the rules and norms this
   specific repository actually follows, distinguishing hard rules from
   soft preferences and assigning each a confidence level.

*Pull request analysis* runs every time a PR is opened or updated:

1. Compute what actually changed against the merge base.
2. Run deterministic policy checks first — missing tests on sensitive
   paths, breaking API changes, CODEOWNERS boundary violations,
   unapproved dependency additions, debug code left in the diff. These
   need no model call and catch the most common issues immediately.
3. Retrieve the specific context this change needs: related code, prior
   precedent, relevant doctrine rules — combined from semantic search and
   the repository graph, not a blind dump of the whole repository.
4. Only now does a model reason over the assembled context, producing
   structured findings — not free-form text.
5. Turn raw findings into evidence-backed review items: each one gets a
   severity, a confidence score, the specific evidence and precedent that
   produced it, and an estimate of how likely it is to be a false
   positive.
6. Publish a short summary as a GitHub check run and PR comment, linking
   to the full review inside the app. The full findings, evidence, and
   precedent live in the app — GitHub only ever gets the summary.
7. If the developer pushes more changes, the relevant part of the
   pipeline re-runs before a human reviewer is expected to look again.

**API server.** The read/write surface the app itself talks to:
organizations, repositories, review sessions, findings, doctrine rules,
historical precedent, and feedback. This is also where a reviewer's
agreement, disagreement, or exception on a finding gets recorded, which
feeds back into how confidently Ratify makes similar calls in the future.

**Admin/metrics service.** Internal-only visibility into the system
itself: how long indexing and review take, how often the queue backs up,
how many findings get overturned by reviewers, and how doctrine confidence
drifts over time per repository.

## Shared packages

- **Parser** — structural code parsing (symbols, imports, call graph,
  complexity estimation) using language-native and Tree-sitter parsers.
  Syntax understanding is never delegated to a model.
- **Graph** — the repository knowledge graph itself: nodes for files,
  symbols, tests, docs, pull requests, and owners; edges for relationships
  like calls, imports, depends-on, owned-by, and reviewed-by.
- **History miner** — extracts precedent and doctrine signal from merged
  PRs, review comments, commit messages, and repository documentation, and
  keeps every piece of evidence linkable back to its source.
- **Doctrine** — turns repeated signal from the history miner into
  structured, confidence-scored rules rather than a prose summary, and
  supports a human explicitly confirming or overriding a rule.
- **Policy engine** — the deterministic checks that run before any model
  call: missing tests, breaking changes, ownership violations, dependency
  changes, leftover debug code.
- **Retrieval** — assembles exactly the context a given change needs by
  combining semantic search with structural and graph-based filtering,
  rather than relying on embeddings alone.
- **LLM** — the only place a model gets called, and only with
  schema-constrained inputs and outputs: structured findings in, structured
  findings out, never unstructured free text where a structured field is
  possible.
- **Evidence generator** — clusters findings that describe the same
  underlying issue across sources, blends confidence between deterministic
  and model-based findings (weighted toward the deterministic source), and
  produces the final reviewer-facing severity and false-positive estimate.
- **GitHub** — GitHub App authentication, the API client, CODEOWNERS
  parsing, and publishing check runs and PR comments.
- **Storage** — content-addressed object storage for large, immutable
  artifacts: repository snapshots, diffs, parsed output, and model
  payloads, kept out of the relational database.
- **Queue** — the job/worker abstraction and the idempotency and retry
  bookkeeping behind every pipeline stage.
- **Observability** — structured logging and tracing shared across every
  service, so any given review session has a complete, inspectable
  timeline of what happened and why.
- **Shared** — cross-cutting types, organization-scoping helpers, and
  error types used throughout the rest of the backend.

## Data model

The relational schema (organizations, users, GitHub installations,
repositories, pull requests, review sessions, findings, evidence, doctrine
rules and their sources, historical precedent, the graph itself, jobs,
webhook events, feedback, and metrics) is fully org-scoped: every table
that holds tenant data carries an organization boundary, and nothing is
shared across organizations unless a feature is explicitly designed to be
shared telemetry.
