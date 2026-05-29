# Fixture harness runbook

## Purpose

Capture external calls once with a live tokened run and replay them deterministically in CI.

- `tools/test/fixtures/microsoft-graph/record-users-list.fixture.ts` — Microsoft Graph `users.list` fixture
- `tools/test/fixtures/google-admin/record-users-list.fixture.ts` — Google Admin SDK `users.list` (directory endpoint) using
  Google Auth Library test credentials + `nock` replay

## Modes

- `FIXTURE_MODE=record` — execute real HTTP calls and write fixture JSON.
- `FIXTURE_MODE=replay` (default) — block unknown traffic and replay from fixture files.

## Commands

```bash
pnpm exec tsx tools/test/fixtures/microsoft-graph/record-users-list.fixture.ts
FIXTURE_MODE=record MS_GRAPH_TOKEN=... pnpm exec tsx tools/test/fixtures/microsoft-graph/record-users-list.fixture.ts
```

```bash
GOOGLE_AUTH_TEST_MODE=true GOOGLE_TEST_ACCESS_TOKEN=... \
FIXTURE_MODE=record pnpm exec tsx tools/test/fixtures/google-admin/record-users-list.fixture.ts
```

## Replay expectation

- Files are sanitized:

  - auth headers removed/redacted
  - request tokens removed from query-string fragments
  - deterministic ordering for stable diffs

- Missing fixture file in replay mode fails fast and requests re-recording when sandbox tenant access is available.
