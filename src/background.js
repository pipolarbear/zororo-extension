const CONCURRENCY = 3;
const STORAGE_KEY = "queue";

let queue = [];
let activeCount = 0;
let processing = false;
let nextId = 1;
const extCache = new Map();

/* @telemetry-start */
if (typeof importScripts === "function") {
  try { importScripts("telemetry.js"); } catch { }
}
function telemetry(event, fields) {
  try { if (self.ZororoTelemetry) self.ZororoTelemetry.emit(event, fields); } catch { }
}
/* @telemetry-end */

async function loadQueue() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  queue = data[STORAGE_KEY] || [];
  nextId = queue.reduce((max, e) => Math.max(max, (e.id || 0) + 1), 1);

  const stalled = queue.filter((e) => e.status === "downloading");
  if (stalled.length > 0) {
    const downloads = await chrome.downloads.search({});
    for (const item of stalled) {
      if (item.downloadId == null) {
        item.status = "failed";
        item.error = "interrupted";
      } else {
        const dl = downloads.find((d) => d.id === item.downloadId);
        if (!dl) {
          item.status = "failed";
          item.error = "lost";
        } else if (dl.state === "complete") {
          item.status = "completed";
        } else if (dl.state === "interrupted") {
          item.status = dl.error === "USER_CANCELED" ? "cancelled" : "failed";
          item.error = dl.error;
        }
      }
    }
  }
}

function trimQueue() {
  if (queue.length > 100) {
    queue = [...queue].sort((a, b) => b.id - a.id).slice(0, 100);
  }
}

async function saveQueue() {
  trimQueue();
  await chrome.storage.local.set({ [STORAGE_KEY]: queue });
}

function broadcast() {
  chrome.runtime.sendMessage({ type: "queue-update", queue }).catch(() => {});
}

async function getConfig() {
  const defaults = { rootDir: "OroroTV", subtitleLangs: ["en"], defaultSubLang: "en" };
  const data = await chrome.storage.sync.get(Object.keys(defaults));
  return { ...defaults, ...data };
}

function safePath(str) {
  return str.replace(/[<>:"/\\|?*]+/g, "").trim();
}

const CATALOG_KEY = "ororoCatalogV2";
const CATALOG_TTL = 12 * 60 * 60 * 1000;
const REQUESTS_KEY = "contentRequests";
const WATCHED_KEY = "watched";

function normalizeImdbId(id) {
  if (!id) return null;
  const m = String(id).match(/(\d+)/);
  return m ? String(parseInt(m[1], 10)) : null;
}

function rawImdbId(imdbId) {
  return /^tt\d+$/i.test(String(imdbId)) ? String(imdbId) : "tt" + (normalizeImdbId(imdbId) || "");
}

async function recordRequest(title, imdbId) {
  const id = normalizeImdbId(imdbId);
  if (!id) return;
  const data = await chrome.storage.local.get(REQUESTS_KEY);
  const map = data[REQUESTS_KEY] || {};
  map[id] = { imdbId: rawImdbId(imdbId), title: title || "", requestedAt: Date.now() };
  await chrome.storage.local.set({ [REQUESTS_KEY]: map });
}

async function clearRequest(imdbId) {
  const id = normalizeImdbId(imdbId);
  if (!id) return;
  const data = await chrome.storage.local.get(REQUESTS_KEY);
  const map = data[REQUESTS_KEY] || {};
  if (map[id]) {
    delete map[id];
    await chrome.storage.local.set({ [REQUESTS_KEY]: map });
  }
}

async function fetchOroroCatalog() {
  const [showsRes, moviesRes] = await Promise.all([
    fetch("https://ororo.tv/api/v2/shows", { credentials: "include" }),
    fetch("https://ororo.tv/api/v2/movies", { credentials: "include" }),
  ]);
  if (showsRes.status === 401 || moviesRes.status === 401) return { loggedIn: false };
  const shows = showsRes.ok ? (await showsRes.json()).shows || [] : [];
  const movies = moviesRes.ok ? (await moviesRes.json()).movies || [] : [];
  const map = {};
  for (const s of shows) {
    const k = normalizeImdbId(s.imdb_id);
    if (k) map[k] = { type: "show", slug: s.slug, name: s.name, id: s.id };
  }
  for (const m of movies) {
    const k = normalizeImdbId(m.imdb_id);
    if (k) map[k] = { type: "movie", slug: m.slug || slugify(m.name), name: m.name, id: m.id };
  }
  return { loggedIn: true, map, fetchedAt: Date.now() };
}

async function getOroroCatalog() {
  const data = await chrome.storage.local.get(CATALOG_KEY);
  const cached = data[CATALOG_KEY];
  if (cached && cached.fetchedAt && Date.now() - cached.fetchedAt < CATALOG_TTL) return cached;
  const fresh = await fetchOroroCatalog();
  if (fresh.loggedIn) await chrome.storage.local.set({ [CATALOG_KEY]: fresh });
  return fresh;
}

async function getWatchedRating(hit) {
  if (!hit) return 0;
  const data = await chrome.storage.local.get(WATCHED_KEY);
  const watched = data[WATCHED_KEY] || [];
  const prefix = hit.type === "movie" ? "movie_" : "show_";
  const entry = watched.find(
    (w) => w && w.type === hit.type && (w.id === prefix + hit.id || (hit.slug && w.slug === hit.slug))
  );
  const rating = entry ? Number(entry.rating) : 0;
  return rating > 0 ? rating : 0;
}

async function checkOroro(imdbId) {
  const id = normalizeImdbId(imdbId);
  if (!id) return { loggedIn: true, found: false };
  const catalog = await getOroroCatalog();
  if (!catalog.loggedIn) return { loggedIn: false };
  const hit = catalog.map[id];
  if (hit) {
    await clearRequest(imdbId);
    return { loggedIn: true, found: true, ...hit, rating: await getWatchedRating(hit) };
  }
  const data = await chrome.storage.local.get(REQUESTS_KEY);
  const rec = (data[REQUESTS_KEY] || {})[id];
  return { loggedIn: true, found: false, requested: !!rec, requestedAt: rec ? rec.requestedAt : null };
}

async function requestContent(title, imdbId) {
  const raw = /^tt\d+$/i.test(String(imdbId)) ? String(imdbId) : "tt" + (normalizeImdbId(imdbId) || "");
  const modalResp = await fetch("https://ororo.tv/en/modals/contentRequest", { credentials: "include" });
  if (modalResp.status === 401) return { ok: false, loggedIn: false };
  const html = await modalResp.text();
  const m = html.match(/name="authenticity_token"[^>]*value="([^"]+)"/);
  const body = new URLSearchParams();
  if (m) body.set("authenticity_token", m[1]);
  body.set("content_request[title]", title || "");
  body.set("content_request[link]", raw);
  const resp = await fetch("https://ororo.tv/en/content_requests", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      "Accept": "application/json, text/javascript, */*; q=0.01",
    },
    body: body.toString(),
  });
  if (resp.status === 403) {
    const payload = encodeURIComponent(JSON.stringify({ title: title || "", imdbId: raw }));
    chrome.tabs.create({ url: "https://ororo.tv/en#zororo-request=" + payload });
    await recordRequest(title, imdbId);
    /* @telemetry-start */
    telemetry("request", { title: title || "", imdb_id: raw });
    /* @telemetry-end */
    return { ok: true, viaTab: true };
  }
  if (!resp.ok) return { ok: false, error: "http-" + resp.status };
  await recordRequest(title, imdbId);
  /* @telemetry-start */
  telemetry("request", { title: title || "", imdb_id: raw });
  /* @telemetry-end */
  return { ok: true };
}

async function processNext() {
  await loadQueue();
  if (processing) return;
  processing = true;

  while (activeCount < CONCURRENCY) {
    const item = queue.find((e) => e.status === "queued");
    if (!item) break;

    activeCount++;
    item.status = "downloading";
    await saveQueue();
    broadcast();

    processItem(item).finally(() => {
      activeCount--;
      const match = queue.find((e) => e.id === item.id);
      if (match) {
        match.downloadId = item.downloadId;
        match.status = item.status;
        match.error = item.error;
      }
      saveQueue().then(() => {
        broadcast();
        processNext();
      });
    });
  }

  processing = false;
}

async function processItem(item) {
  try {
    const config = await getConfig();
    const base = `${config.rootDir}/${safePath(item.showName)}/s${String(item.season).padStart(2, "0")}`;
    const epFile = `${base}/${String(item.episodeNum).padStart(2, "0")}.${safePath(item.episodeName || "Episode")}`;

    const downloadId = await chrome.downloads.download({
      url: item.downloadUrl,
      filename: `${epFile}.mp4`,
      conflictAction: "uniquify",
      saveAs: false,
    });
    item.downloadId = downloadId;
    item.status = "downloading";

    const wantedLangs = config.subtitleLangs || ["en"];
    const defaultLang = config.defaultSubLang || wantedLangs[0];
    for (const sub of (item.subtitles || []).filter((s) => wantedLangs.includes(s.lang))) {
      try {
        const suffix = sub.lang === defaultLang ? "" : "." + sub.lang;
        await chrome.downloads.download({
          url: sub.url,
          filename: `${epFile}${suffix}.srt`,
          conflictAction: "uniquify",
          saveAs: false,
        });
      } catch {
        // subtitle failure is non-fatal
      }
    }
  } catch (err) {
    item.status = "failed";
    item.error = err.message;
  }
}

loadQueue();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    /* @telemetry-start */
    case "telemetry":
      telemetry(msg.event, msg.fields || {});
      return false;
    /* @telemetry-end */
    case "start-download":
      (async () => {
        const config = await getConfig();
        const bySeason = {};
        for (const ep of msg.episodes) {
          if (!bySeason[ep.season]) bySeason[ep.season] = [];
          bySeason[ep.season].push(ep);
        }

        const all = await chrome.downloads.search({});
        const onDisk = new Set();
        for (const seasonStr of Object.keys(bySeason)) {
          const prefix = `${config.rootDir}/${safePath(msg.showName)}/s${String(parseInt(seasonStr, 10)).padStart(2, "0")}/`;
          for (const r of all) {
            if (r.state === "complete" && r.exists !== false && r.filename && r.filename.includes(prefix)) {
              const m = r.filename.match(/\/(\d+)\./);
              if (m) onDisk.add(parseInt(m[1], 10));
            }
          }
        }

        let queuedCount = 0;
        let skippedCount = 0;
        for (const ep of msg.episodes) {
          if (onDisk.has(Number(ep.number))) {
            skippedCount++;
            continue;
          }
          const exists = queue.some(
            (q) =>
              q.showName === msg.showName &&
              q.downloadUrl === ep.downloadUrl &&
              (q.status === "queued" || q.status === "downloading")
          );
          if (!exists) {
            queue.push({
              id: nextId++,
              showName: msg.showName,
              season: ep.season,
              episodeNum: ep.number,
              episodeName: ep.name || `Episode ${ep.number}`,
              downloadUrl: ep.downloadUrl,
              subtitles: ep.subtitles || [],
              status: "queued",
            });
            queuedCount++;
          }
        }
        if (queuedCount > 0) {
          await saveQueue();
          broadcast();
          processNext();
        }
        /* @telemetry-start */
        if (queuedCount > 0) telemetry("download", { title: msg.showName || "", media_type: "show", count: queuedCount });
        /* @telemetry-end */
        sendResponse({ ok: true, queued: queuedCount, skipped: skippedCount });
      })();
      return true;

    case "get-queue":
      if (queue.length === 0) {
        loadQueue().then(() => sendResponse({ queue }));
      } else {
        sendResponse({ queue });
      }
      return true;

    case "cancel-all":
      queue = queue.map((e) =>
        e.status === "queued" ? { ...e, status: "cancelled" } : e
      );
      saveQueue().then(broadcast);
      sendResponse({ ok: true });
      break;

    case "clean-all":
      queue = [];
      saveQueue().then(broadcast);
      sendResponse({ ok: true });
      break;

    case "open-options":
      chrome.runtime.openOptionsPage();
      sendResponse({ ok: true });
      break;

    case "check-ororo": {
      (async () => {
        try {
          sendResponse(await checkOroro(msg.imdbId));
        } catch (e) {
          sendResponse({ loggedIn: false, error: e.message });
        }
      })();
      return true;
    }

    case "request-content": {
      (async () => {
        try {
          sendResponse(await requestContent(msg.title, msg.imdbId));
        } catch (e) {
          sendResponse({ ok: false, error: e.message });
        }
      })();
      return true;
    }

    case "resolve-external-links": {
      (async () => {
        const { title, year } = msg;
        const type = msg.mediaType || "show";
        if (!title) {
          sendResponse({ imdb: null, rt: null });
          return;
        }
        const cacheKey = `${type}|${title}|${year || ""}`;
        if (extCache.has(cacheKey)) {
          sendResponse(extCache.get(cacheKey));
          return;
        }

        let imdbUrl = null;
        let rtUrl = null;
        try {
          imdbUrl = await resolveImdb(title, year, type);
        } catch (e) {
          imdbUrl = null;
        }
        try {
          rtUrl = await resolveRottenTomatoes(title, year, type);
        } catch (e) {
          rtUrl = null;
        }

        const response = { imdb: imdbUrl, rt: rtUrl };
        extCache.set(cacheKey, response);
        sendResponse(response);
      })();
      return true;
    }
  }
});

chrome.downloads.onChanged.addListener((delta) => {
  if (!delta.state) return;
  const item = queue.find((e) => e.downloadId === delta.id);
  if (!item) return;
  if (delta.state.current === "complete") {
    item.status = "completed";
  } else if (delta.state.current === "interrupted") {
    item.status = delta.error?.current === "USER_CANCELED" ? "cancelled" : "failed";
    item.error = delta.error?.current;
  } else {
    return;
  }
  saveQueue().then(broadcast);
});

chrome.alarms.create("queue-watch", { periodInMinutes: 2 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "queue-watch") processNext();
});

/* @telemetry-start */
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") telemetry("install", {});
  else if (details.reason === "update") telemetry("update", { prev_version: details.previousVersion || "" });
});
chrome.alarms.create("telemetry-ping", { periodInMinutes: 1440 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "telemetry-ping") telemetry("active", {});
});
/* @telemetry-end */

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function slugifyUnderscore(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function normalizeTitle(str) {
  return str
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

function diceSimilarity(a, b) {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const bigrams = (s) => {
    const m = new Map();
    for (let i = 0; i < s.length - 1; i++) {
      const k = s.slice(i, i + 2);
      m.set(k, (m.get(k) || 0) + 1);
    }
    return m;
  };
  const A = bigrams(a);
  const B = bigrams(b);
  let inter = 0;
  for (const [k, v] of A) inter += Math.min(v, B.get(k) || 0);
  return (2 * inter) / (a.length - 1 + b.length - 1);
}

function matchesYear(r, yearNum) {
  if (!yearNum) return true;
  if (r.y && r.y !== yearNum) return false;
  if (!r.y && r.yr) {
    const yrStart = parseInt(r.yr.split("-")[0], 10);
    if (yrStart !== yearNum) return false;
  }
  return true;
}

function classifyImdb(r) {
  const qid = (r.qid || "").toLowerCase();
  const q = (r.q || "").toLowerCase();
  const isShowType = qid === "tvseries" || qid === "tvminiseries" || qid === "tvshort" || qid === "tvspecial" ||
    ["tvseries", "tvmini", "tvshort", "tvspecial"].some((t) => q.includes(t));
  const isMovieType = qid === "movie" || q === "feature";
  return { isShowType, isMovieType };
}

async function resolveImdb(title, year, type) {
  const slug = slugify(title);
  const resp = await fetch(`https://v2.sg.media-imdb.com/suggestion/x/${slug}.json`, {
    headers: { Accept: "application/json" },
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  const results = data.d || [];
  if (!results.length) return null;

  const normTitle = normalizeTitle(title);
  const yearNum = year ? parseInt(year, 10) : null;

  // Pass 1: exact title + year + correct qid
  let best = null;
  for (const r of results) {
    const rTitle = normalizeTitle(r.l || "");
    if (rTitle !== normTitle) continue;
    if (!matchesYear(r, yearNum)) continue;
    const { isShowType, isMovieType } = classifyImdb(r);
    if (type === "show" && !isShowType) continue;
    if (type === "movie" && !isMovieType) continue;
    if (!best || (r.rank || Infinity) < (best.rank || Infinity)) best = r;
  }
  if (best?.id) return `https://www.imdb.com/title/${best.id}/`;

  // Pass 2: exact title, correct qid, ignore year
  let best2 = null;
  for (const r of results) {
    const rTitle = normalizeTitle(r.l || "");
    if (rTitle !== normTitle) continue;
    const { isShowType, isMovieType } = classifyImdb(r);
    if (type === "show" && !isShowType) continue;
    if (type === "movie" && !isMovieType) continue;
    if (!best2 || (r.rank || Infinity) < (best2.rank || Infinity)) best2 = r;
  }
  if (best2?.id) return `https://www.imdb.com/title/${best2.id}/`;

  // Pass 3: fuzzy title, correct qid + year (when known)
  let best3 = null;
  let best3Score = 0;
  const fuzzyThreshold = yearNum ? 0.6 : 0.8;
  for (const r of results) {
    const rTitle = normalizeTitle(r.l || "");
    const { isShowType, isMovieType } = classifyImdb(r);
    if (type === "show" && !isShowType) continue;
    if (type === "movie" && !isMovieType) continue;
    if (!matchesYear(r, yearNum)) continue;
    const score = diceSimilarity(normTitle, rTitle);
    if (score < fuzzyThreshold) continue;
    if (score > best3Score) {
      best3Score = score;
      best3 = r;
    }
  }
  if (best3?.id) return `https://www.imdb.com/title/${best3.id}/`;

  // Pass 4: exact title, any type, but year-safe
  let best4 = null;
  for (const r of results) {
    const rTitle = normalizeTitle(r.l || "");
    if (rTitle !== normTitle) continue;
    if (!matchesYear(r, yearNum)) continue;
    if (!best4 || (r.rank || Infinity) < (best4.rank || Infinity)) best4 = r;
  }
  if (best4?.id) return `https://www.imdb.com/title/${best4.id}/`;

  return null;
}

async function resolveRottenTomatoes(title, year, type) {
  const slugHyphen = slugify(title);
  const slugUnderscore = slugifyUnderscore(title);

  // Strategy 1: GET with redirect follow, try multiple slug formats
  const slugVariants = [
    { slug: slugUnderscore, path: type === "movie" ? "/m/" : "/tv/" },
    { slug: slugHyphen, path: type === "movie" ? "/m/" : "/tv/" },
  ];

  for (const v of slugVariants) {
    const url = `https://www.rottentomatoes.com${v.path}${v.slug}`;
    try {
      const resp = await fetch(url, { method: "GET", redirect: "follow" });
      if (resp.ok && (resp.url.includes("/m/") || resp.url.includes("/tv/"))) {
        return resp.url;
      }
    } catch (e) {
      // try next slug variant
    }
  }

  // Strategy 2: search without year
  const searchUrl = await searchRottenTomatoes(title, null);
  if (searchUrl) return searchUrl;

  // Strategy 3: search with year (last resort)
  if (year) {
    const searchUrl2 = await searchRottenTomatoes(title, year);
    if (searchUrl2) return searchUrl2;
  }

  // Strategy 4: fuzzy search (best similarity match, year-aware when known)
  const fuzzyUrl = await searchRottenTomatoes(title, year, true);
  if (fuzzyUrl) return fuzzyUrl;

  return null;
}

async function searchRottenTomatoes(title, year, fuzzy) {
  const query = encodeURIComponent(year ? `${title} ${year}` : title);
  const searchUrl = `https://www.rottentomatoes.com/search?search=${query}`;
  try {
    const resp = await fetch(searchUrl, { headers: { Accept: "text/html" } });
    if (!resp.ok) return null;
    const html = await resp.text();

    const rowRe = /<search-page-media-row[^>]*>([\s\S]*?)<\/search-page-media-row>/g;
    const normTitle = normalizeTitle(title);
    const yearNum = year ? parseInt(year, 10) : null;
    const fuzzyThreshold = yearNum ? 0.6 : 0.8;

    let match = null;
    let bestScore = 0;
    let m;
    while ((m = rowRe.exec(html)) !== null) {
      const block = m[1];
      const rowRe2 = /<a[^>]*data-qa="info-name"[^>]*>\s*([^<]+)\s*<\/a>/;
      const info = block.match(rowRe2);
      if (!info) continue;
      const foundTitle = info[1].trim();
      const foundNorm = normalizeTitle(foundTitle);

      let rowYear = null;
      const yearMatch = block.match(/(?:release-year|releaseyear|start-year|startyear)="(\d{4})"/);
      if (yearMatch) rowYear = parseInt(yearMatch[1], 10);
      if (yearNum && rowYear && rowYear !== yearNum) continue;

      const hrefMatch = block.match(/<a[^>]*href="([^"]+)"[^>]*data-qa="thumbnail-link"[^>]*>/);
      if (!hrefMatch) continue;
      const href = hrefMatch[1];

      if (fuzzy) {
        const score = diceSimilarity(normTitle, foundNorm);
        if (score >= fuzzyThreshold && score > bestScore) {
          bestScore = score;
          match = href;
        }
      } else if (foundNorm === normTitle) {
        match = href;
        break;
      }
    }
    if (!match) return null;
    if (match.startsWith("/")) match = `https://www.rottentomatoes.com${match}`;
    return match;
  } catch (e) {
    return null;
  }
}
