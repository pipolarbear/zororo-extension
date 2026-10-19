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
  };

  const MAX_PER_MINUTE = 20;
  let sendTimes = [];

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
    } catch {
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
    if (!telemetrySalt) {
      telemetrySalt = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
      await chrome.storage.local.set({ telemetrySalt });
    }
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw", enc.encode(telemetrySalt), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(isoWeekKey(new Date())));
    return Array.from(new Uint8Array(sig)).slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function emit(event, fields = {}) {
    try {
      if (!FORM_URL || FORM_URL.includes("REPLACE_FORM_ID")) return;
      if (event !== "opt_out" && !(await isEnabled())) return;
      if (!rateOk()) return;
      const row = {
        ts: new Date().toISOString(),
        event,
        client_id: await rotatingId(),
        ext_version: chrome.runtime.getManifest().version,
        ...fields,
      };
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(row)) {
        if (ENTRIES[k] && v !== undefined && v !== null && v !== "") params.set(ENTRIES[k], String(v));
      }
      await fetch(FORM_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
    } catch { }
  }

  self.ZororoTelemetry = { emit };
})();
