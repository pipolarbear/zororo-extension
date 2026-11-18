-- Saved queries for the Zororo telemetry D1 database.
--   npx wrangler d1 execute zororo-telemetry --remote --command "<query>"
-- or paste into the D1 console in the Cloudflare dashboard.
--
-- Development builds send channel = 'dev'. Add
--   AND COALESCE(channel, 'store') <> 'dev'
-- to exclude them; older rows have NULL channel.

-- Daily active installations (distinct rotating weekly ids) for the last 30 days.
SELECT substr(ts, 1, 10) AS day,
       COUNT(DISTINCT client_id) AS users,
       COUNT(*) AS events
FROM events
WHERE ts >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days')
  AND COALESCE(channel, 'store') <> 'dev'
GROUP BY 1
ORDER BY 1;

-- Event and action breakdown for the last 7 days.
SELECT event, COALESCE(action, '') AS action, COUNT(*) AS n
FROM events
WHERE ts >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days')
GROUP BY 1, 2
ORDER BY n DESC;

-- Download outcomes. completed / failed / cancelled / enqueue per period.
SELECT COALESCE(action, 'enqueue') AS action,
       COUNT(*) AS n,
       ROUND(AVG(duration_ms) / 1000.0, 1) AS avg_seconds,
       MAX(duration_ms) / 1000 AS max_seconds
FROM events
WHERE event = 'download'
GROUP BY 1
ORDER BY n DESC;

-- Download failure reasons.
SELECT reason, COUNT(*) AS n
FROM events
WHERE event = 'download' AND action = 'failed'
GROUP BY 1
ORDER BY n DESC;

-- Version adoption (last 30 days).
SELECT ext_version,
       COUNT(DISTINCT client_id) AS users,
       COUNT(*) AS events
FROM events
WHERE ts >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days')
GROUP BY 1
ORDER BY users DESC;

-- Installs vs opt-outs per day.
SELECT substr(ts, 1, 10) AS day, event, COUNT(*) AS n
FROM events
WHERE event IN ('opt_out', 'install')
GROUP BY 1, 2
ORDER BY 1;

-- Activity by days since install (coarse retention curve).
SELECT install_age_days,
       COUNT(DISTINCT client_id) AS users,
       COUNT(*) AS events
FROM events
WHERE install_age_days IS NOT NULL
GROUP BY 1
ORDER BY 1;

-- Delivery health: events that arrived long after they happened.
SELECT substr(ts, 1, 10) AS day,
       ROUND(AVG((julianday(received_at) - julianday(ts)) * 86400), 1) AS avg_lag_seconds,
       MAX((julianday(received_at) - julianday(ts)) * 86400) AS max_lag_seconds
FROM events
WHERE ts IS NOT NULL AND received_at IS NOT NULL
GROUP BY 1
ORDER BY 1;

-- Average community rating per title, 20+ ratings only.
-- Dedupes by (client_id, title, season) keeping the latest event, so a re-rate
-- or unrate within the same week replaces the earlier vote. Cross-week dedupe
-- is impossible because client_id rotates weekly; each week counts as a new
-- voter. Use the shrunk score for display: (sum + k*mu) / (n + k).
WITH latest AS (
  SELECT show_id,
         media_type,
         COALESCE(season, '') AS season,
         client_id,
         action,
         value,
         ts,
         ROW_NUMBER() OVER (
           PARTITION BY show_id, media_type, COALESCE(season, ''), client_id
           ORDER BY ts DESC
         ) AS rn
  FROM events
  WHERE event = 'rating'
    AND show_id IS NOT NULL
    AND COALESCE(channel, 'store') <> 'dev'
)
SELECT show_id,
       media_type,
       season,
       COUNT(*) AS n,
       ROUND(AVG(CAST(value AS REAL)), 2) AS avg_stars,
       MIN(CAST(value AS REAL)) AS min_stars,
       MAX(CAST(value AS REAL)) AS max_stars,
       SUM(CAST(value AS REAL)) AS sum_stars
FROM latest
WHERE rn = 1
  AND action = 'rate'
  AND value <> ''
GROUP BY show_id, media_type, season
HAVING n >= 20
ORDER BY n DESC;

-- How many titles have cleared the 20-rating threshold.
SELECT COUNT(*) AS titles_ready
FROM (
  SELECT show_id, media_type, COALESCE(season, '') AS season
  FROM events
  WHERE event = 'rating'
    AND action = 'rate'
    AND show_id IS NOT NULL
    AND COALESCE(channel, 'store') <> 'dev'
  GROUP BY 1, 2, 3
  HAVING COUNT(DISTINCT client_id) >= 20
);

-- Ratings by action and media type (sanity check after an instrument change).
SELECT COALESCE(action, 'rate') AS action,
       COALESCE(media_type, '') AS media_type,
       COUNT(*) AS n,
       COUNT(DISTINCT client_id) AS clients
FROM events
WHERE event = 'rating'
  AND COALESCE(channel, 'store') <> 'dev'
GROUP BY 1, 2
ORDER BY n DESC;
