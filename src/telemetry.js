// Anonymous, privacy-preserving usage telemetry (Chrome build only).
// This file is excluded from the Firefox distribution by the build step.
//
// Rotating salted id: a random local secret is HMAC'd with the current ISO
// week, so events within a week share an id (allowing "distinct users this
// week") but cannot be linked across weeks. The secret never leaves the device.
//
// Fill in FORM_URL + ENTRIES from your Google Form. Until FORM_URL is set,
// emit() is a no-op and nothing is transmitted.
(() => {
  // Build flag: "1" in store builds. Dev builds leave the placeholder, which
  // evaluates to false, so they never send. See .justfile.
  const TELEMETRY_ENABLED = "@TELEMETRY_ENABLED@" === "1";

  const FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLSd3FqIZvDQzJgNpW-bAu-bSXptR5lRYyM-fhrBT84r45xXs3g/formResponse";
  const ENTRIES = {
    ts: "entry.1926782407",
    event: "entry.498399457",
    client_id: "entry.1211626556",
    ext_version: "entry.940678058",
    title: "entry.197144199",
    imdb_id: "entry.1904038393",
    media_type: "entry.1184686099",
    count: "entry.848203221",
    setting: "entry.759017310",
    value: "entry.44871666",
    prev_version: "entry.709085116",
    action: "entry.1951417412",
    surface: "entry.676088147",
    season: "entry.764797288",
    reason: "entry.1438446788",
  };

  const MAX_PER_MINUTE = 20;
  const DIAG_KEY = "telemetryDiag";
  const DIAG_MAX = 100;
  let sendTimes = [];
  // Serializes read-modify-write of the diagnostic log. Without this, boot,
  // onInstalled and emit phases can race and drop records.
  let diagChain = Promise.resolve();

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

  function isUnconfirmed(last) {
    if (!last) return false;
    if (last.phase === "gate") return last.enabled === true;
    return ["onInstalled", "emit_start", "id_ok", "posting"].includes(last.phase);
  }

  async function checkPending(reason = "unconfirmed_posting") {
    await diagChain.catch(() => { });
    try {
      const { [DIAG_KEY]: log = [] } = await chrome.storage.local.get({ [DIAG_KEY]: [] });
      if (isUnconfirmed(log[log.length - 1])) await dumpDiagnostics(reason);
    } catch { }
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
    return task;
  }

  async function dumpDiagnostics(reason) {
    await diagChain.catch(() => { });
    try {
      if (!(await debugEnabled())) return;
      const { [DIAG_KEY]: log = [], telemetryLastDumpKey = "" } =
        await chrome.storage.local.get({ [DIAG_KEY]: [], telemetryLastDumpKey: "" });
      if (!log.length) return;
      const last = log[log.length - 1];
      const key = reason + "|" + (last && last.at) + "|" + (last && last.phase);
      if (key === telemetryLastDumpKey) return;
      await chrome.storage.local.set({ telemetryLastDumpKey: key });
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

  async function rotatingId() {
    let { telemetrySalt } = await chrome.storage.local.get({ telemetrySalt: null });
    const hadSalt = !!telemetrySalt;
    if (!telemetrySalt) {
      telemetrySalt = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
      await chrome.storage.local.set({ telemetrySalt });
    }
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw", enc.encode(telemetrySalt), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(isoWeekKey(new Date())));
    const id = Array.from(new Uint8Array(sig)).slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
    return { id, hadSalt };
  }

  function confirmationLooksPositive(text) {
    return /response has been (recorded|sent)|antwort wurde gesendet|respuesta.*(enviada|registrada)|réponse.*(enregistrée|envoyée)|respuesta.*registrad/i.test(text || "");
  }

  async function emit(event, fields = {}) {
    await diag("emit_start", { event, online: typeof navigator !== "undefined" ? navigator.onLine : null });
    try {
      if (!TELEMETRY_ENABLED) { await diag("build_disabled", { event }); return; }
      if (!FORM_URL || FORM_URL.includes("REPLACE_FORM_ID")) { await diag("no_form_url", { event }); return; }
      if (event !== "opt_out") {
        const enabled = await isEnabled();
        await diag("gate", { event, enabled });
        if (!enabled) return;
      }
      if (!rateOk()) { await diag("rate_limited", { event }); return; }

      let idInfo;
      try {
        idInfo = await rotatingId();
        await diag("id_ok", { event, hadSalt: idInfo.hadSalt });
      } catch (e) {
        await diag("id_error", { event, err: String(e && (e.message || e)) });
        throw e;
      }

      const row = {
        ts: new Date().toISOString(),
        event,
        client_id: idInfo.id,
        ext_version: chrome.runtime.getManifest().version,
        ...fields,
      };
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(row)) {
        if (ENTRIES[k] && v !== undefined && v !== null && v !== "") params.set(ENTRIES[k], String(v));
      }
      const body = params.toString();
      await diag("posting", { event, body });

      let resp;
      try {
        resp = await fetch(FORM_URL, {
          method: "POST",
          mode: "no-cors",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
        });
      } catch (e) {
        await diag("fetch_error", {
          event,
          name: String(e && e.name),
          err: String(e && (e.message || e)),
          online: typeof navigator !== "undefined" ? navigator.onLine : null,
        });
        await dumpDiagnostics("fetch_error");
        return;
      }

      let snippet = "";
      try {
        const raw = await resp.text();
        snippet = raw.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
      } catch (e) { snippet = "unreadable:" + String(e && (e.message || e)); }
      await diag("fetch_resolved", {
        event,
        status: resp.status,
        type: resp.type,
        ok: resp.ok,
        likelyConfirmed: confirmationLooksPositive(snippet),
        snippet,
      });
    } catch (e) {
      await diag("error", { event, name: String(e && e.name), err: String(e && (e.message || e)), stack: e && e.stack ? String(e.stack).slice(0, 400) : "" });
      try { console.warn("[zororo] telemetry send failed:", e); } catch { }
    }
  }

  self.ZororoTelemetry = { emit, diag, boot, checkPending, dumpDiagnostics, setDebug };
})();
