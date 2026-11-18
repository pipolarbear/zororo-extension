// Anonymous, privacy-preserving usage telemetry (Chrome build only).
// This file is excluded from the Firefox distribution by the build step.
//
// Events go into a durable outbox in chrome.storage.local and are flushed in
// batches to the Zororo telemetry Worker. Delivery is at-least-once; the
// server dedupes on event_id. The rotating salted id is HMAC(salt, ISO week)
// and is computed when an event is QUEUED, not when it is flushed, so an event
// held offline across a week boundary is still attributed to the right week.
//
// Until the build flag is set by .justfile, emit() is a no-op and nothing is
// transmitted.
(() => {
  // Build flag: "1" in store builds. Dev builds leave the placeholder, which
  // evaluates to false, so they never send. See .justfile.
  const TELEMETRY_ENABLED = "@TELEMETRY_ENABLED@" === "1";

  const ENDPOINT = "https://zororo.xmousse.com/v1/events";
  const SCHEMA = 2;
  // Build channel: "store" for packaged builds, "dev" for dev-chrome. The
  // report excludes dev rows unless explicitly asked for them.
  const CHANNEL = "@TELEMETRY_CHANNEL@";

  const OUTBOX_KEY = "telemetryOutbox";
  const DROPPED_KEY = "telemetryDropped";
  const REJECTED_KEY = "telemetryRejected";
  const LAST_OK_KEY = "telemetryLastOkAt";
  const BACKOFF_KEY = "telemetryBackoff";
  const INSTALLED_KEY = "telemetryInstalledAt";
  const SESSION_KEY = "telemetrySessionId";

  const OUTBOX_MAX = 500;
  const OUTBOX_MAX_CHARS = 256 * 1024;
  const BATCH_MAX = 50;
  const BATCH_MAX_CHARS = 28 * 1024;
  const MAX_PER_MINUTE = 60;
  const FLUSH_ALARM = "telemetry-flush";
  const FLUSH_DELAY_MS = 2000;
  const MAX_BACKOFF_MS = 60 * 60 * 1000;

  const DIAG_KEY = "telemetryDiag";
  const DIAG_MAX = 100;

  let sendTimes = [];
  let flushTimer = null;
  let flushing = null;
  let weekCache = null;
  let sessionCache = null;
  let installedCache;
  // Serializes read-modify-write of the diagnostic log. Without this, boot,
  // onInstalled and emit phases can race and drop records.
  let diagChain = Promise.resolve();
  // Same idea for the outbox: appends, acks and drops must not interleave.
  let outboxChain = Promise.resolve();

  // Debug is opt-in (Options → Anonymous usage stats → Capture local telemetry
  // diagnostics). Cached for the lifetime of the worker; the options page
  // invalidates it through a "telemetry-debug" message.
  let debugCache = null;
  async function debugEnabled() {
    if (debugCache !== null) return debugCache;
    try {
      const { debugTelemetry } = await chrome.storage.local.get({ debugTelemetry: false });
      debugCache = debugTelemetry === true;
    } catch {
      debugCache = false;
    }
    return debugCache;
  }

  function setDebug(enabled) {
    debugCache = enabled === true;
  }

  // Append one phase record. Only written when the debug option is on, and
  // always awaited by callers so the last record survives a worker kill.
  function diag(phase, data = {}) {
    const task = diagChain.then(async () => {
      try {
        if (!(await debugEnabled())) return;
        const { [DIAG_KEY]: log } = await chrome.storage.local.get({ [DIAG_KEY]: [] });
        log.push({ at: new Date().toISOString(), phase, ...data });
        await chrome.storage.local.set({ [DIAG_KEY]: log.slice(-DIAG_MAX) });
      } catch { }
    });
    diagChain = task.catch(() => { });
    return task;
  }

  // One boot record per browser session. storage.session survives worker
  // restarts but is cleared when the browser closes, so queue-watch waking the
  // worker every 2 minutes no longer floods the diagnostic log.
  function boot(data = {}) {
    const task = diagChain.then(async () => {
      try {
        if (!(await debugEnabled())) return;
        let haveSession = false;
        try {
          const { bootLogged } = await chrome.storage.session.get({ bootLogged: false });
          haveSession = true;
          if (bootLogged) return;
        } catch { }
        const { [DIAG_KEY]: log } = await chrome.storage.local.get({ [DIAG_KEY]: [] });
        if (!haveSession) {
          const last = log[log.length - 1];
          if (last && last.phase === "boot" && Date.now() - Date.parse(last.at) < 15 * 60 * 1000) return;
        }
        log.push({ at: new Date().toISOString(), phase: "boot", ...data });
        await chrome.storage.local.set({ [DIAG_KEY]: log.slice(-DIAG_MAX) });
        try { await chrome.storage.session.set({ bootLogged: true }); } catch { }
      } catch { }
    });
    diagChain = task.catch(() => { });
    if (TELEMETRY_ENABLED) ensureAlarm();
    return task;
  }

  async function dumpDiagnostics(reason) {
    await diagChain.catch(() => { });
    try {
      if (!(await debugEnabled())) return;
      const { [DIAG_KEY]: log = [], telemetryLastDumpAt = 0 } =
        await chrome.storage.local.get({ [DIAG_KEY]: [], telemetryLastDumpAt: 0 });
      if (!log.length) return;
      // One automatic dump per hour, even if failures keep recurring.
      if (Date.now() - telemetryLastDumpAt < 60 * 60 * 1000) return;
      await chrome.storage.local.set({ telemetryLastDumpAt: Date.now() });
      const body = JSON.stringify({ reason, at: new Date().toISOString(), diag: log }, null, 2);
      const url = "data:application/json;charset=utf-8," + encodeURIComponent(body);
      await chrome.downloads.download({
        url,
        filename: "zororo-telemetry-diag.json",
        conflictAction: "uniquify",
        saveAs: false,
      });
    } catch (e) {
      try { console.warn("[zororo] diagnostic dump failed:", e); } catch { }
    }
  }

  function rateOk() {
    const now = Date.now();
    sendTimes = sendTimes.filter((t) => now - t < 60000);
    if (sendTimes.length >= MAX_PER_MINUTE) return false;
    sendTimes.push(now);
    return true;
  }

  async function isEnabled() {
    try {
      const { telemetryEnabled } = await chrome.storage.sync.get({ telemetryEnabled: true });
      return telemetryEnabled !== false;
    } catch (e) {
      try { console.warn("[zororo] telemetry enabled-check failed:", e); } catch { }
      await diag("enabled_error", { err: String(e && (e.message || e)) });
      return false;
    }
  }

  function isoWeekKey(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
    return date.getUTCFullYear() + "-W" + String(week).padStart(2, "0");
  }

  async function weeklyId(week) {
    if (weekCache && weekCache.week === week) return weekCache.id;
    let { telemetrySalt } = await chrome.storage.local.get({ telemetrySalt: null });
    if (!telemetrySalt) {
      telemetrySalt = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
      await chrome.storage.local.set({ telemetrySalt });
    }
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw", enc.encode(telemetrySalt), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(week));
    const id = Array.from(new Uint8Array(sig)).slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
    weekCache = { week, id };
    return id;
  }

  // Random per browser session (storage.session is cleared on browser close).
  // Gives within-session ordering without any cross-session identifier.
  async function sessionId() {
    if (sessionCache !== null) return sessionCache;
    try {
      const { [SESSION_KEY]: existing } = await chrome.storage.session.get({ [SESSION_KEY]: null });
      if (existing) {
        sessionCache = existing;
        return existing;
      }
      const id = crypto.randomUUID().replace(/-/g, "").slice(0, 24);
      await chrome.storage.session.set({ [SESSION_KEY]: id });
      sessionCache = id;
    } catch {
      sessionCache = "";
    }
    return sessionCache;
  }

  async function installedAgeDays() {
    try {
      if (installedCache === undefined) {
        const { [INSTALLED_KEY]: at } = await chrome.storage.local.get({ [INSTALLED_KEY]: 0 });
        installedCache = at || 0;
        if (!installedCache) {
          // Existing install upgrading to this version: start the clock now.
          installedCache = Date.now();
          await chrome.storage.local.set({ [INSTALLED_KEY]: installedCache });
        }
      }
      return Math.max(0, Math.floor((Date.now() - installedCache) / 86400000));
    } catch {
      return undefined;
    }
  }

  async function buildPayload(event, fields) {
    const now = new Date();
    const week = isoWeekKey(now);
    const [client_id, session_id, install_age_days] = await Promise.all([
      weeklyId(week), sessionId(), installedAgeDays(),
    ]);
    const f = { ...fields };
    // Legacy call sites still send `count`; the schema renamed it item_count.
    if (f.count !== undefined && f.item_count === undefined) f.item_count = f.count;
    delete f.count;
    if (f.season !== undefined && f.season !== null) f.season = String(f.season);
    if (f.value !== undefined && f.value !== null) f.value = String(f.value);
    if (f.prev_value !== undefined && f.prev_value !== null) f.prev_value = String(f.prev_value);
    if (f.show_id !== undefined && f.show_id !== null) f.show_id = String(f.show_id);
    if (f.item_count !== undefined && f.item_count !== null) {
      const n = Number(f.item_count);
      if (Number.isFinite(n)) f.item_count = Math.max(0, Math.round(n));
      else delete f.item_count;
    }
    if (f.duration_ms !== undefined && f.duration_ms !== null) {
      const n = Number(f.duration_ms);
      if (Number.isFinite(n)) f.duration_ms = Math.max(0, Math.round(n));
      else delete f.duration_ms;
    }
    if (typeof f.title === "string") f.title = f.title.slice(0, 200);
    return {
      ...f,
      event_id: crypto.randomUUID(),
      ts: now.toISOString(),
      schema: SCHEMA,
      event,
      client_id,
      session_id,
      ext_version: chrome.runtime.getManifest().version,
      install_age_days,
      channel: CHANNEL,
    };
  }

  function outboxTask(fn) {
    const task = outboxChain.then(async () => {
      const { [OUTBOX_KEY]: items = [] } = await chrome.storage.local.get({ [OUTBOX_KEY]: [] });
      const [next, result] = await fn(items);
      await chrome.storage.local.set({ [OUTBOX_KEY]: next });
      return result;
    });
    outboxChain = task.catch(() => { });
    return task;
  }

  function payloadSize(p) {
    try { return JSON.stringify(p).length; } catch { return 0; }
  }

  function appendOutbox(item) {
    return outboxTask(async (items) => {
      items.push(item);
      let dropped = 0;
      while (items.length > OUTBOX_MAX) {
        items.shift();
        dropped++;
      }
      let chars = items.reduce((n, it) => n + payloadSize(it.payload), 0);
      while (chars > OUTBOX_MAX_CHARS && items.length > 1) {
        chars -= payloadSize(items.shift().payload);
        dropped++;
      }
      return [items, dropped];
    });
  }

  function ackOutbox(ids) {
    const drop = new Set(ids);
    return outboxTask(async (items) => [items.filter((it) => !drop.has(it.id)), ids.length]);
  }

  async function bump(key, by) {
    try {
      const cur = (await chrome.storage.local.get({ [key]: 0 }))[key] || 0;
      await chrome.storage.local.set({ [key]: cur + by });
    } catch { }
  }

  async function ensureAlarm() {
    try {
      if (!(await chrome.alarms.get(FLUSH_ALARM))) {
        await chrome.alarms.create(FLUSH_ALARM, { periodInMinutes: 5 });
      }
    } catch { }
  }

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush("debounce");
    }, FLUSH_DELAY_MS);
  }

  async function setBackoff(delayMs, fails) {
    const jitter = Math.floor(Math.random() * 5000);
    await chrome.storage.local.set({
      [BACKOFF_KEY]: { nextAt: Date.now() + delayMs + jitter, fails: fails || 1 },
    });
  }

  async function onFlushFailure(reason, err, status) {
    const { [BACKOFF_KEY]: b = { nextAt: 0, fails: 0 } } =
      await chrome.storage.local.get({ [BACKOFF_KEY]: { nextAt: 0, fails: 0 } });
    const fails = (b.fails || 0) + 1;
    const delay = Math.min(MAX_BACKOFF_MS, 60 * 1000 * Math.pow(4, fails - 1));
    await setBackoff(delay, fails);
    await diag("flush_failed", {
      reason,
      status,
      fails,
      delayMs: delay,
      name: String(err && err.name),
      err: String(err && (err.message || err)),
    });
    if (fails >= 3) await dumpDiagnostics("flush_failed");
  }

  async function doFlush(reason) {
    await diag("flush_start", { reason });
    if (!TELEMETRY_ENABLED || !ENDPOINT) return;

    const { [OUTBOX_KEY]: snapshot = [] } = await chrome.storage.local.get({ [OUTBOX_KEY]: [] });
    if (!snapshot.length) {
      await diag("flush_empty");
      return;
    }

    const { [BACKOFF_KEY]: backoff = { nextAt: 0, fails: 0 } } =
      await chrome.storage.local.get({ [BACKOFF_KEY]: { nextAt: 0, fails: 0 } });
    if (backoff.nextAt && backoff.nextAt > Date.now()) {
      await diag("flush_backoff", { until: new Date(backoff.nextAt).toISOString() });
      return;
    }

    const enabled = await isEnabled();
    let queue = snapshot;
    if (!enabled) {
      // Consent withdrawn: only the opt-out record itself may still leave.
      queue = snapshot.filter((it) => it.payload && it.payload.event === "opt_out");
      const dropped = snapshot.length - queue.length;
      if (dropped > 0) {
        const keep = new Set(queue.map((it) => it.id));
        await outboxTask(async (items) => [items.filter((it) => keep.has(it.id)), true]);
        await bump(DROPPED_KEY, dropped);
        await diag("flush_disabled_drop", { dropped });
      }
    }
    if (!queue.length) return;

    const batch = [];
    let chars = 0;
    for (const item of queue) {
      const size = payloadSize(item.payload);
      if (batch.length >= BATCH_MAX) break;
      if (batch.length && chars + size > BATCH_MAX_CHARS) break;
      batch.push(item);
      chars += size;
    }

    const body = JSON.stringify({ schema: SCHEMA, events: batch.map((it) => it.payload) });
    await diag("posting", { reason, count: batch.length, chars: body.length });

    let resp;
    try {
      resp = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
    } catch (e) {
      await onFlushFailure(reason, e, null);
      return;
    }

    if (resp.ok) {
      let info = null;
      try { info = await resp.json(); } catch { }
      await ackOutbox(batch.map((it) => it.id));
      await chrome.storage.local.set({
        [LAST_OK_KEY]: new Date().toISOString(),
        [BACKOFF_KEY]: { nextAt: 0, fails: 0 },
      });
      if (info && info.rejected) await bump(REJECTED_KEY, info.rejected);
      await diag("flush_ok", {
        count: batch.length,
        accepted: info ? info.accepted : null,
        inserted: info ? info.inserted : null,
        rejected: info ? info.rejected : null,
      });
      // More may be waiting beyond this batch.
      if (queue.length > batch.length) scheduleFlush();
      return;
    }

    if (resp.status === 429) {
      const retry = parseInt(resp.headers.get("Retry-After") || "60", 10);
      await setBackoff(Math.max(10, retry) * 1000, 0);
      await diag("flush_429", { retry });
      return;
    }

    if (resp.status >= 400 && resp.status < 500) {
      // The batch is not going to become acceptable by retrying it.
      await ackOutbox(batch.map((it) => it.id));
      await bump(DROPPED_KEY, batch.length);
      await diag("flush_drop", { status: resp.status, count: batch.length });
      return;
    }

    await onFlushFailure(reason, null, resp.status);
  }

  function flush(reason = "manual") {
    if (!TELEMETRY_ENABLED) return Promise.resolve();
    if (flushing) return flushing;
    flushing = doFlush(reason).catch(() => { }).finally(() => { flushing = null; });
    return flushing;
  }

  async function emit(event, fields = {}) {
    try {
      await diag("emit_start", { event });
      if (!TELEMETRY_ENABLED) { await diag("build_disabled", { event }); return; }
      if (!event) return;
      if (event !== "opt_out") {
        const enabled = await isEnabled();
        if (!enabled) { await diag("gate", { event, enabled: false }); return; }
      }
      if (!rateOk()) { await diag("rate_limited", { event }); return; }
      const payload = await buildPayload(event, fields);
      const dropped = await appendOutbox({ id: payload.event_id, payload });
      if (dropped) await bump(DROPPED_KEY, dropped);
      await diag("enqueued", { event, dropped });
      ensureAlarm();
      scheduleFlush();
    } catch (e) {
      await diag("error", { event, name: String(e && e.name), err: String(e && (e.message || e)) });
    }
  }

  async function checkPending(reason = "pending_outbox") {
    await outboxChain.catch(() => { });
    try {
      const { [OUTBOX_KEY]: outbox = [] } = await chrome.storage.local.get({ [OUTBOX_KEY]: [] });
      if (outbox.length) await flush(reason);
    } catch { }
  }

  async function status() {
    try {
      const d = await chrome.storage.local.get({
        [OUTBOX_KEY]: [],
        [DROPPED_KEY]: 0,
        [REJECTED_KEY]: 0,
        [LAST_OK_KEY]: "",
        [BACKOFF_KEY]: { nextAt: 0, fails: 0 },
      });
      return {
        enabled: await isEnabled(),
        buildEnabled: TELEMETRY_ENABLED,
        outbox: d[OUTBOX_KEY].length,
        dropped: d[DROPPED_KEY],
        rejected: d[REJECTED_KEY],
        lastOkAt: d[LAST_OK_KEY],
        nextAttemptAt: d[BACKOFF_KEY].nextAt || 0,
      };
    } catch {
      return null;
    }
  }

  self.ZororoTelemetry = {
    emit, flush, status, diag, boot, checkPending, dumpDiagnostics, setDebug,
  };
})();
