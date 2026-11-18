const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Max-Age": "86400",
};

const EVENTS = new Set([
  "install", "update", "active", "request", "download", "rating", "setting",
  "library", "panel", "feature", "error", "review_prompt", "feedback",
  "feedback_submit", "crypto", "opt_out",
]);

const MAX_BATCH = 50;
const MAX_BODY = 32 * 1024;
const MAX_STR = 300;

const S = (v, max = MAX_STR) =>
  typeof v === "string" && v.length > 0 && v.length <= max ? v : null;
const I = (v) => (Number.isInteger(v) && v >= 0 && v <= 1e9 ? v : null);

function normalize(e) {
  if (!e || typeof e !== "object") return null;
  const event = S(e.event, 40);
  const id = S(e.event_id, 64);
  if (!event || !EVENTS.has(event) || !id || !/^[A-Za-z0-9-]{16,64}$/.test(id)) return null;
  return [
    id,
    new Date().toISOString(),
    S(e.ts, 40),
    I(e.schema) ?? 2,
    event,
    S(e.action, 40),
    S(e.surface, 20),
    S(e.client_id, 40),
    S(e.session_id, 40),
    S(e.ext_version, 20),
    S(e.channel, 10),
    I(e.install_age_days),
    S(e.title, 200),
    S(e.show_id, 40),
    /^tt\d{5,12}$/.test(e.imdb_id ?? "") ? e.imdb_id : null,
    S(e.media_type, 20),
    /^[0-9,]{1,200}$/.test(e.season ?? "") ? e.season : null,
    I(e.item_count),
    S(e.value, 100),
    S(e.prev_value, 10),
    S(e.setting, 40),
    S(e.reason, 40),
    S(e.prev_version, 20),
    I(e.duration_ms),
    e.props ? JSON.stringify(e.props).slice(0, 1000) : null,
  ];
}

const INSERT = `INSERT OR IGNORE INTO events (
  event_id, received_at, ts, schema, event, action, surface, client_id,
  session_id, ext_version, channel, install_age_days, title, show_id,
  imdb_id, media_type, season, item_count, value, prev_value, setting,
  reason, prev_version, duration_ms, props
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (url.pathname === "/health") {
      return Response.json({ ok: true }, { headers: CORS });
    }
    if (req.method !== "POST" || url.pathname !== "/v1/events") {
      return new Response("not found", { status: 404, headers: CORS });
    }

    const raw = await req.text();
    if (raw.length > MAX_BODY) return new Response("too large", { status: 413, headers: CORS });

    let body;
    try { body = JSON.parse(raw); } catch { return new Response("bad json", { status: 400, headers: CORS }); }

    const incoming = Array.isArray(body?.events) ? body.events.slice(0, MAX_BATCH) : [];
    const rows = incoming.map(normalize).filter(Boolean);
    let inserted = 0;
    if (rows.length) {
      try {
        // INSERT OR IGNORE makes retries idempotent; meta.changes tells us how
        // many rows were genuinely new, which rows.length cannot.
        const results = await env.DB.batch(rows.map((r) => env.DB.prepare(INSERT).bind(...r)));
        inserted = results.reduce((n, r) => n + (r?.meta?.changes || 0), 0);
      } catch (err) {
        // 5xx tells the client to keep the batch and retry.
        return new Response("db error", { status: 500, headers: CORS });
      }
    }
    return Response.json(
      { accepted: rows.length, inserted, rejected: incoming.length - rows.length },
      { status: 202, headers: CORS }
    );
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      env.DB.prepare(
        "DELETE FROM events WHERE received_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-730 days')"
      ).run()
    );
  },
};
