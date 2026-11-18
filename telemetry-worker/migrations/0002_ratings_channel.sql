-- Applied 2026-11-18 to the existing zororo-telemetry database.
-- Fresh installs get these columns from schema.sql, so only run this against
-- a database created before this change. SQLite has no ADD COLUMN IF NOT
-- EXISTS, so running it twice fails on the duplicate column.
--
--   npx wrangler d1 execute zororo-telemetry --remote --file=./migrations/0002_ratings_channel.sql

ALTER TABLE events ADD COLUMN channel TEXT;
ALTER TABLE events ADD COLUMN show_id TEXT;
ALTER TABLE events ADD COLUMN prev_value TEXT;
CREATE INDEX IF NOT EXISTS idx_events_rating ON events(event, show_id, media_type, season);
