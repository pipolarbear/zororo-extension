# Zororo telemetry Worker

Receives anonymous usage events from the Chrome build of the extension and
stores them in Cloudflare D1. The Firefox build contains no telemetry code.

Endpoint: `https://zororo.xmousse.com/v1/events`

## Files

| File | Purpose |
|---|---|
| `src/index.js` | Worker: CORS, validation, batched insert, retention cron |
| `schema.sql` | D1 table and indexes |
| `queries.sql` | Saved reporting queries |
| `wrangler.jsonc` | Worker config, D1 binding, cron trigger |

## Deploy

```bash
cd telemetry-worker
npm install
npx wrangler login
npx wrangler deploy
```

Or from the repo root: `just deploy-telemetry`.

## First-time setup

```bash
npx wrangler d1 create zororo-telemetry --binding DB
# paste the returned database_id into wrangler.jsonc
npx wrangler d1 execute zororo-telemetry --remote --file=./schema.sql
npx wrangler deploy
```

## Verify

```bash
curl -s https://zororo.xmousse.com/health
curl -s -X POST https://zororo.xmousse.com/v1/events \
  -H 'content-type: application/json' \
  -d '{"schema":2,"events":[{"event_id":"00000000-0000-4000-8000-0000000000aa","event":"active"}]}'
```

`event_id` is a client-generated UUID and the table's primary key, so resending
a batch is a no-op. The response reports `accepted` (valid rows offered),
`inserted` (newly written) and `rejected` (invalid rows dropped).

## Adding events

The event name allowlist and field types live in `normalize()` in
`src/index.js`. They must stay in sync with `src/telemetry.js` in the extension.
Unknown event names are dropped, not rejected — add them here before shipping a
client that emits them.

## Retention

The cron trigger (`17 3 * * *`) deletes rows older than 730 days (24 months).

## Migrations

`migrations/` holds one-off SQL for databases created before a schema change.
Fresh installs get everything from `schema.sql`, so do not run these there.

```bash
npx wrangler d1 execute zororo-telemetry --remote \
  --file=./migrations/0002_ratings_channel.sql
```

SQLite has no `ADD COLUMN IF NOT EXISTS`, so each migration runs exactly once.

## Build channel

Events carry `channel` (`store` for packaged builds). `just dev-chrome` leaves
telemetry disabled, so development builds send nothing. The field stays as a
guard: reporting excludes any `dev` rows by default.

## CLI queries

```bash
npx wrangler d1 execute zororo-telemetry --remote --command "SELECT COUNT(*) FROM events"
npx wrangler d1 execute zororo-telemetry --remote --file=./queries.sql
```

For ad-hoc reporting use `tools/usage-report.py`, which reads D1 through the
HTTP API and renders a weekly report.
