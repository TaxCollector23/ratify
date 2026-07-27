# Ratify Backend

Repository intelligence + engineering governance platform. Not a code generator: it indexes repositories deterministically (parsing, graph, history mining), infers repository-specific doctrine, runs cheap policy checks before any model call, and only then asks an LLM to reason over pre-assembled context.

## Architecture

```
GitHub → webhook-handler (fast ack, dedupe, enqueue)
             │
             ▼
           queue (BullMQ / Redis, job = stateful DB record, retries + DLQ)
             │
             ▼
           worker (one BullMQ Worker per job type)
    ┌────────┴─────────────────────────────────────────┐
    │  REPOSITORY_INDEXING_FLOW                         │
    │  repo-sync → parse → graph-build → history-mine    │
    │  → doctrine-infer                                  │
    │                                                     │
    │  PR_ANALYSIS_FLOW                                  │
    │  policy-check → context-retrieve → llm-reason       │
    │  → evidence-generate → publish                     │
    └────────────────────────────────────────────────────┘
             │
             ▼
           api-server (Fastify + OpenAPI, serves review sessions,
                        findings, doctrine, feedback to the app)
             │
           admin-metrics (read-only ops surface: queue health,
                           worker state, doctrine drift, error rates)
```

Postgres holds relational state (orgs, repos, PRs, findings, doctrine, jobs — see `packages/db/src/schema`). Redis backs the job queue. S3-compatible object storage holds large immutable blobs (snapshots, diffs, parsed artifacts, LLM payloads) — see `packages/storage`.

## Package layout

- `apps/webhook-handler` — verifies GitHub signatures, dedupes deliveries, enqueues work. Does no heavy lifting.
- `apps/worker` — one BullMQ `Worker` per job type; all business logic for both flows above.
- `apps/api-server` — Fastify + Zod + OpenAPI; the app's read/write surface.
- `apps/admin-metrics` — read-only ops/admin surface, can scale independently of `api-server`.
- `packages/db` — Drizzle schema + migrations (`drizzle-kit generate`, `tsx src/migrate.ts`).
- `packages/queue` — BullMQ queue/worker wrappers, job schemas (Zod), orchestrator (Job/JobAttempt bookkeeping, idempotency).
- `packages/repo-sync` — git clone/fetch, snapshotting, diff computation.
- `packages/parser` — Tree-sitter/TS-native structural parsing; symbols, imports, complexity — never the LLM.
- `packages/graph` — repository knowledge graph (nodes/edges) builder + queries.
- `packages/history-miner` — mines merged PRs, review comments, docs, ADRs, CODEOWNERS for precedent and doctrine signals.
- `packages/doctrine` — turns mined signals into scored, structured `DoctrineRule` objects.
- `packages/policy-engine` — deterministic pre-LLM checks (missing tests, breaking API changes, CODEOWNERS violations, TODO/debug code, dependency changes).
- `packages/retrieval` — combines vector similarity with structural/graph filters to assemble PR review context.
- `packages/llm` — schema-constrained model calls (Anthropic + mock providers); structured findings in, structured findings out.
- `packages/evidence-generator` — clusters raw findings, blends confidence across sources, estimates false-positive likelihood.
- `packages/github` — GitHub App auth, API client, CODEOWNERS parsing, PR/check-run publishing.
- `packages/storage` — S3-compatible object store, content-addressed blobs.
- `packages/observability` — structured logging (pino), OpenTelemetry tracing, metrics event sink.
- `packages/shared` — cross-cutting types, org-scoping helpers, idempotency key derivation, error types.

## Running locally

```bash
cp .env.example .env      # fill in GitHub App + Anthropic credentials as needed
docker compose up -d postgres redis minio
pnpm install
pnpm --filter @ratify/db run generate   # only when schema changes
pnpm --filter @ratify/db run migrate
pnpm run dev:webhook-handler   # separate terminals
pnpm run dev:api-server
pnpm run dev:worker
```

Or run the full stack, including build + migrations, via Docker:

```bash
docker compose up --build
```

`RATIFY_LLM_PROVIDER=mock` (the default) runs the full pipeline — including `llm-reason` — against deterministic fixture responses, so the whole PR analysis flow works end-to-end with zero external API keys.

## Tests

```bash
pnpm run build      # topological build via tsc project references
pnpm run typecheck
pnpm run test        # vitest, unit tests for parsing, policy rules, confidence blending, etc.
```
