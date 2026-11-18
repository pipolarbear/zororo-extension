CREATE TABLE IF NOT EXISTS events (
  event_id         TEXT PRIMARY KEY,
  received_at      TEXT NOT NULL,
  ts               TEXT,
  schema           INTEGER NOT NULL DEFAULT 2,
  event            TEXT NOT NULL,
  action           TEXT,
  surface          TEXT,
  client_id        TEXT,
  session_id       TEXT,
  ext_version      TEXT,
  channel          TEXT,
  install_age_days INTEGER,
  title            TEXT,
  show_id          TEXT,
  imdb_id          TEXT,
  media_type       TEXT,
  season           TEXT,
  item_count       INTEGER,
  value            TEXT,
  prev_value       TEXT,
  setting          TEXT,
  reason           TEXT,
  prev_version     TEXT,
  duration_ms      INTEGER,
  props            TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_received ON events(received_at);
CREATE INDEX IF NOT EXISTS idx_events_event ON events(event, received_at);
CREATE INDEX IF NOT EXISTS idx_events_client ON events(client_id, received_at);
CREATE INDEX IF NOT EXISTS idx_events_rating ON events(event, show_id, media_type, season);
