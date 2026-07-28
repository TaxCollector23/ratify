# Ratify

Ratify is an engineering governance platform. It turns the standards an
engineering team already has — the ones that live in architecture
discussions, pull request reviews, Slack threads, and the memory of senior
engineers — into executable repository doctrine, and evaluates every pull
request against that doctrine before a human reviewer looks at it.

This repository contains the public marketing site and the platform's
backend services. It is proprietary software; the code here is not
licensed for reuse, redistribution, or self-hosting.

## What's in this repository

### `/` — the public site

The marketing site is a Next.js app. It covers:

- **Home** — product overview, the live interactive dashboard demo, the
  four core capabilities, and the review pipeline.
- **Pricing** — Free, Plus, and Enterprise plans.
- **Benchmarks** — how Ratify's findings perform against a real evaluation
  set of merged pull requests, including precision and recall by doctrine
  category.
- **Privacy** — data handling summary.

### `/docs` — documentation site

A static documentation site (published separately via GitHub Pages)
explaining how Ratify's review pipeline works, from repository indexing
through evidence-backed findings.

### `/backend` — the platform

The backend is what actually reads repositories, builds doctrine, and
reviews pull requests. It's organized as a set of focused services and
shared packages.

**Services**

- **GitHub webhook receiver** — the entry point for every GitHub event
  (installations, pull requests, pushes). Verifies the request actually
  came from GitHub, deduplicates deliveries, and hands work off
  immediately. Does no heavy processing itself, so it stays fast and
  reliable even under bursts of events.
- **API server** — serves the application: organizations, repositories,
  review sessions, findings, doctrine rules, and historical precedent.
  Accepts feedback on findings and triggers re-analysis.
- **Worker** — runs the actual review pipeline as a chain of discrete
  stages (see below). Each stage is a separate, independently retryable
  unit of work.
- **Admin/metrics service** — internal operational visibility: queue
  health, review latency, model call volume, false-positive rate, and
  doctrine drift over time.

**How a repository gets reviewed**

When a repository is first connected, Ratify runs a one-time indexing
pass: it clones the repository, parses its structure and symbols, builds
a dependency graph, reads documentation and architectural decision
records, and mines the history of merged pull requests and review
comments for precedent. From that, it produces an initial set of
candidate doctrine rules — distinguishing hard rules ("integration tests
are required for payment logic") from soft norms and likely preferences.

When a pull request is opened or updated, Ratify runs a pipeline in
order:

1. Fetch the current repository state and compute the diff.
2. Run deterministic policy checks first — missing tests, breaking API
   changes, ownership-boundary violations, dependency changes, TODO/debug
   code left in the diff. These don't need a model and catch the most
   common issues immediately.
3. Retrieve the repository context actually relevant to this change:
   related code, docs, prior PRs, and doctrine rules, combined from
   semantic search and the repository graph.
4. Only after that context is assembled does a model reason over it —
   interpreting evidence the backend already gathered, not rediscovering
   the repository from scratch.
5. Convert raw findings into evidence-backed review items: severity,
   confidence, supporting precedent, and a false-positive estimate.
6. Publish a concise summary as a GitHub check run and PR comment, with a
   link to the full review in the app. Every finding and every piece of
   supporting evidence is also available in the app's review session
   view — not just the truncated GitHub comment.
7. If the developer pushes changes, Ratify re-evaluates before human
   review happens.

**Shared packages**

- **Parsing** — structural code parsing (symbols, imports, call graph,
  complexity) using language-native and Tree-sitter parsers. Syntax
  understanding never goes through a model.
- **Graph** — the repository knowledge graph: files, symbols, tests,
  docs, PRs, and the relationships between them (calls, imports,
  depends-on, owned-by, reviewed-by).
- **History mining** — extracts precedent and doctrine signal from merged
  PRs, review comments, commit messages, and repository documentation.
- **Doctrine** — turns repeated signal into structured, confidence-scored
  rules, and supports human override.
- **Policy engine** — the deterministic, pre-model checks.
- **Retrieval** — assembles the context a model actually needs for a
  given change.
- **Evidence generation** — clusters findings from multiple sources,
  blends confidence, and produces the final reviewer-facing item.
- **GitHub integration** — App authentication, the API client, CODEOWNERS
  parsing, and check-run/comment publishing.
- **Storage, queue, and observability** — object storage for large
  artifacts, the job queue and retry/idempotency handling behind the
  pipeline stages above, and structured logging/tracing across every
  service.

### Data isolation

Every organization's repositories, doctrine, findings, feedback, and
review history are isolated from every other organization's. Two
repositories never share inferred doctrine unless that's explicitly
configured. Nothing is used to train a shared model.
