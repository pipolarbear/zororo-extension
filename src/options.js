const LANG_NAMES = { en: "English", fr: "French", de: "German", es: "Spanish", pt: "Portuguese", ru: "Russian", it: "Italian", ja: "Japanese", ko: "Korean", zh: "Chinese" };

const SIZE_STEPS = [25, 35, 45, 55, 65, 75, 85, 95, 100];
const PANEL_MAX = 144;
const ICON_MAX = 128;

const DEFAULTS = {
  rootDir: "OroroTV",
  subtitleLangs: ["en"],
  defaultSubLang: "en",
  translateComments: true,
  translateDescription: true,
  translateEpisodes: true,
  closePanelOnClickOutside: true,
  minimizeGesture: "dblclick",
  maximizeGesture: "dblclick",
  seasonRating: true,
  theme: "light",
  collapsedSizeOroro: 100,
  collapsedSizeImdb: 100,
  /* @telemetry-start */
  telemetryEnabled: true,
  /* @telemetry-end */
};

/* @telemetry-start */
let lastConfig = null;
async function exportDiagnostics() {
  const { telemetryDiag = [] } = await chrome.storage.local.get({ telemetryDiag: [] });
  const blob = new Blob([JSON.stringify(telemetryDiag, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "zororo-telemetry-diag-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json";
  a.click();
  URL.revokeObjectURL(url);
}
function tel(event, fields) {
  try {
    chrome.runtime.sendMessage({ type: "telemetry", event, fields: fields || {} });
  } catch (e) {
    try { console.warn("[zororo] telemetry message failed:", e); } catch { }
    try { chrome.storage.local.set({ telemetryLastSendError: { at: new Date().toISOString(), ctx: "options", event, err: String(e && (e.message || e)) } }); } catch { }
  }
}
async function renderTelemetryStatus() {
  const el = document.getElementById("telemetry-status");
  if (!el) return;
  let s = null;
  try { s = await chrome.runtime.sendMessage({ type: "telemetry-status" }); } catch { }
  if (!s) { el.textContent = "Status unavailable."; return; }
  if (s.buildEnabled === false) { el.textContent = "Off in development builds."; return; }
  if (s.enabled === false) { el.textContent = "Disabled — nothing is sent."; return; }
  const parts = [];
  parts.push(s.lastOkAt ? "Last delivery " + new Date(s.lastOkAt).toLocaleString() : "No delivery yet");
  parts.push(s.outbox + " queued");
  if (s.dropped) parts.push(s.dropped + " dropped");
  if (s.rejected) parts.push(s.rejected + " rejected");
  el.textContent = parts.join(" · ");
}
/* @telemetry-end */

const ICON_ACTIVE_KEY = "panelIconActive";
const ICON_LIBRARY_KEY = "panelIconLibrary";
const ICON_LIBRARY_MAX = 3;
const ICON_MAX_INPUT_BYTES = 2 * 1024 * 1024;
const ICON_MAX_OUTPUT_CHARS = 96 * 1024;
const ICON_TILE_SIZE = 256;
const ICON_DEFAULT_SRC = "icons/zoro.png";

let iconActive = { kind: "default" };
let iconLibrary = [];
let iconStatusTimer = null;

function iconEntrySrc(entry) {
  return entry && (entry.kind === "data" || entry.kind === "url") && entry.value
    ? entry.value
    : ICON_DEFAULT_SRC;
}

function iconSame(a, b) {
  if (!a || !b) return false;
  if (a.kind === "default" || b.kind === "default") return a.kind === b.kind;
  return a.kind === b.kind && a.value === b.value;
}

function setIconStatus(msg) {
  const el = document.getElementById("icon-status");
  if (!el) return;
  el.textContent = msg || "";
  clearTimeout(iconStatusTimer);
  if (msg) iconStatusTimer = setTimeout(() => { el.textContent = ""; }, 4000);
}

function applyActiveIcon() {
  const img = document.querySelector("#collapse-preview img");
  if (!img) return;
  img.onerror = () => { img.onerror = null; img.src = ICON_DEFAULT_SRC; };
  img.src = iconEntrySrc(iconActive);
}

function renderIconTiles() {
  const wrap = document.getElementById("icon-tiles");
  if (!wrap) return;
  wrap.replaceChildren();
  const entries = [{ kind: "default", value: "" }, ...iconLibrary];
  for (const entry of entries) {
    const tile = document.createElement("div");
    tile.className = "icon-tile" + (iconSame(entry, iconActive) ? " active" : "");
    tile.setAttribute("role", "button");
    tile.setAttribute("tabindex", "0");
    tile.title = entry.kind === "default" ? "Default icon" : "Use this icon";

    const img = document.createElement("img");
    img.alt = entry.kind === "default" ? "Default icon" : "Custom icon";
    img.src = iconEntrySrc(entry);
    img.onerror = () => { img.onerror = null; img.src = ICON_DEFAULT_SRC; };
    tile.appendChild(img);

    const select = () => { selectIcon(entry); };
    tile.addEventListener("click", select);
    tile.addEventListener("keydown", (e) => {
      if (e.target !== tile) return;
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(); }
    });

    if (entry.kind !== "default") {
      const del = document.createElement("button");
      del.type = "button";
      del.className = "icon-del";
      del.textContent = "\u00d7";
      del.title = "Remove saved icon";
      del.setAttribute("aria-label", "Remove saved icon");
      del.addEventListener("click", (e) => { e.stopPropagation(); deleteIcon(entry.id); });
      tile.appendChild(del);
    }
    wrap.appendChild(tile);
  }
}

async function selectIcon(entry) {
  const next = entry && entry.kind !== "default" && entry.value
    ? { kind: entry.kind, value: entry.value }
    : { kind: "default" };
  iconActive = next;
  await chrome.storage.local.set({ [ICON_ACTIVE_KEY]: next });
  applyActiveIcon();
  renderIconTiles();
  /* @telemetry-start */
  tel("setting", { setting: "panelIcon", value: next.kind });
  /* @telemetry-end */
}

async function deleteIcon(id) {
  const removed = iconLibrary.find((e) => e.id === id);
  if (!removed) return;
  iconLibrary = iconLibrary.filter((e) => e.id !== id);
  await chrome.storage.local.set({ [ICON_LIBRARY_KEY]: iconLibrary });
  if (iconSame(removed, iconActive)) await selectIcon({ kind: "default" });
  else renderIconTiles();
}

async function saveIcon(kind, value) {
  const existing = iconLibrary.find((e) => e.kind === kind && e.value === value);
  if (existing) { await selectIcon(existing); return; }
  const entry = { id: crypto.randomUUID(), kind, value, addedAt: Date.now() };
  iconLibrary = [entry, ...iconLibrary].slice(0, ICON_LIBRARY_MAX);
  await chrome.storage.local.set({ [ICON_LIBRARY_KEY]: iconLibrary });
  await selectIcon(entry);
}

function loadImageElement(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That file is not a readable image."));
    img.src = url;
  });
}

async function fileToIcon(file) {
  if (file.size > ICON_MAX_INPUT_BYTES) throw new Error("Image must be under 2 MB.");
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImageElement(objectUrl);
    if (!img.naturalWidth || !img.naturalHeight) throw new Error("That file has no usable image size.");
    if (img.naturalWidth > 4096 || img.naturalHeight > 4096) throw new Error("Image dimensions are too large (max 4096px).");
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = ICON_TILE_SIZE;
    const ctx = canvas.getContext("2d");
    const scale = Math.min(ICON_TILE_SIZE / img.naturalWidth, ICON_TILE_SIZE / img.naturalHeight);
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    ctx.drawImage(img, Math.round((ICON_TILE_SIZE - w) / 2), Math.round((ICON_TILE_SIZE - h) / 2), w, h);
    const dataUrl = canvas.toDataURL("image/webp", 0.85);
    if (dataUrl.length > ICON_MAX_OUTPUT_CHARS) throw new Error("Image is too detailed; try a smaller or simpler image.");
    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function normalizeIconUrl(raw) {
  let u;
  try { u = new URL(String(raw || "").trim()); } catch { throw new Error("Enter a valid image URL."); }
  if (u.protocol !== "https:") throw new Error("Only https:// image URLs are supported.");
  return u.href;
}

function checkImageUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (!img.naturalWidth || !img.naturalHeight) { reject(new Error("That URL has no usable image size.")); return; }
      if (img.naturalWidth > 4096 || img.naturalHeight > 4096) { reject(new Error("Image dimensions are too large (max 4096px).")); return; }
      resolve();
    };
    img.onerror = () => reject(new Error("That URL did not load as an image."));
    img.src = url;
  });
}

async function loadPanelIcon() {
  const d = await chrome.storage.local.get({
    [ICON_ACTIVE_KEY]: { kind: "default" },
    [ICON_LIBRARY_KEY]: [],
  });
  iconActive = d[ICON_ACTIVE_KEY] || { kind: "default" };
  iconLibrary = Array.isArray(d[ICON_LIBRARY_KEY]) ? d[ICON_LIBRARY_KEY].slice(0, ICON_LIBRARY_MAX) : [];
  applyActiveIcon();
  renderIconTiles();
}

function bindIconControls() {
  const fileBtn = document.getElementById("icon-upload-btn");
  const fileInput = document.getElementById("icon-file");
  const urlInput = document.getElementById("icon-url");
  const urlBtn = document.getElementById("icon-url-btn");
  if (!fileBtn || !fileInput) return;

  fileBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = "";
    if (!file) return;
    try {
      setIconStatus("Processing…");
      await saveIcon("data", await fileToIcon(file));
      setIconStatus("Icon added.");
    } catch (e) {
      setIconStatus(e.message);
    }
  });

  if (urlBtn && urlInput) {
    const add = async () => {
      try {
        setIconStatus("Checking URL…");
        const url = normalizeIconUrl(urlInput.value);
        await checkImageUrl(url);
        await saveIcon("url", url);
        urlInput.value = "";
        setIconStatus("Icon added.");
      } catch (e) {
        setIconStatus(e.message);
      }
    };
    urlBtn.addEventListener("click", add);
    urlInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); add(); }
    });
  }
}

const sizeState = { ororo: 100, imdb: 100 };
let activeSite = "ororo";

function nearestStep(pct) {
  let best = 0;
  for (let i = 1; i < SIZE_STEPS.length; i++) {
    if (Math.abs(SIZE_STEPS[i] - pct) < Math.abs(SIZE_STEPS[best] - pct)) best = i;
  }
  return best;
}

function renderSize() {
  const slider = document.getElementById("size-slider");
  const box = document.getElementById("collapse-preview");
  const img = box.querySelector("img");
  const pct = sizeState[activeSite];
  slider.value = String(nearestStep(pct));
  const scale = pct / 100;
  box.style.width = PANEL_MAX * scale + "px";
  box.style.height = PANEL_MAX * scale + "px";
  img.style.width = ICON_MAX * scale + "px";
  img.style.height = ICON_MAX * scale + "px";
}

function selectSite(site) {
  activeSite = site;
  document.querySelectorAll("#size-tabs button").forEach((b) => {
    b.classList.toggle("active", b.dataset.site === site);
  });
  renderSize();
}

async function load() {
  const data = await chrome.storage.sync.get(Object.keys(DEFAULTS));
  const config = { ...DEFAULTS, ...data };

  document.getElementById("rootDir").value = config.rootDir;
  document.getElementById("theme").value = config.theme === "dark" ? "dark" : "light";

  const checked = config.subtitleLangs || [];
  document.querySelectorAll("#subLangs input[type='checkbox']").forEach((cb) => {
    cb.checked = checked.includes(cb.value);
  });
  updateDefaultLangSelect(config.defaultSubLang);

  document.getElementById("translateComments").checked = config.translateComments;
  document.getElementById("translateDescription").checked = config.translateDescription;
  document.getElementById("translateEpisodes").checked = config.translateEpisodes;
  document.getElementById("closePanelOnClickOutside").checked = config.closePanelOnClickOutside;
  document.getElementById("minimizeGesture").value = config.minimizeGesture;
  document.getElementById("maximizeGesture").value = config.maximizeGesture;
  document.getElementById("seasonRating").checked = config.seasonRating;

  sizeState.ororo = SIZE_STEPS[nearestStep(config.collapsedSizeOroro)];
  sizeState.imdb = SIZE_STEPS[nearestStep(config.collapsedSizeImdb)];
  selectSite("ororo");

  /* @telemetry-start */
  const telToggle = document.getElementById("telemetryEnabled");
  if (telToggle) telToggle.checked = config.telemetryEnabled !== false;
  const dbgToggle = document.getElementById("debugTelemetry");
  if (dbgToggle) {
    chrome.storage.local.get({ debugTelemetry: false }).then(({ debugTelemetry }) => {
      dbgToggle.checked = debugTelemetry === true;
    });
  }
  lastConfig = { ...config };
  renderTelemetryStatus();
  /* @telemetry-end */

  try { await loadPanelIcon(); } catch { }
  bindIconControls();
  updateGestureDisabled();
  bindAutoSave();
}

function bindAutoSave() {
  document.querySelectorAll("#subLangs input[type='checkbox']").forEach((cb) => {
    cb.addEventListener("change", () => { updateDefaultLangSelect(); persist(); });
  });
  document.getElementById("closePanelOnClickOutside").addEventListener("change", () => {
    updateGestureDisabled();
    persist();
  });

  document.querySelectorAll("#size-tabs button").forEach((b) => {
    b.addEventListener("click", () => selectSite(b.dataset.site));
  });
  const slider = document.getElementById("size-slider");
  slider.addEventListener("input", () => {
    sizeState[activeSite] = SIZE_STEPS[Number(slider.value)];
    renderSize();
  });
  slider.addEventListener("change", persist);

  ["rootDir", "theme", "defaultSubLang", "translateComments", "translateDescription",
    "translateEpisodes", "seasonRating", "minimizeGesture", "maximizeGesture"].forEach((id) => {
    document.getElementById(id).addEventListener("change", persist);
  });

  /* @telemetry-start */
  const telEl = document.getElementById("telemetryEnabled");
  if (telEl) {
    telEl.addEventListener("change", () => {
      if (!telEl.checked) tel("opt_out", {});
      persist().then(renderTelemetryStatus);
    });
  }
  const dbgEl = document.getElementById("debugTelemetry");
  if (dbgEl) {
    dbgEl.addEventListener("change", () => {
      const enabled = dbgEl.checked;
      chrome.storage.local.set({ debugTelemetry: enabled });
      try { chrome.runtime.sendMessage({ type: "telemetry-debug", enabled }); } catch { }
    });
  }
  const diagBtn = document.getElementById("export-diag-btn");
  if (diagBtn) diagBtn.addEventListener("click", exportDiagnostics);
  /* @telemetry-end */
}

function updateGestureDisabled() {
  const enabled = document.getElementById("closePanelOnClickOutside").checked;
  document.getElementById("minimizeGesture").disabled = !enabled;
  document.getElementById("maximizeGesture").disabled = !enabled;
}

function updateDefaultLangSelect(selected) {
  const sel = document.getElementById("defaultSubLang");
  const checked = Array.from(
    document.querySelectorAll("#subLangs input[type='checkbox']:checked")
  ).map((cb) => cb.value);
  sel.replaceChildren();
  for (const val of checked) {
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = LANG_NAMES[val] || val;
    sel.appendChild(opt);
  }
  if (selected && checked.includes(selected)) {
    sel.value = selected;
  } else if (sel.options.length > 0) {
    sel.selectedIndex = 0;
  }
}

/* @telemetry-start */
function emitSettingChanges(config) {
  if (!lastConfig) { lastConfig = { ...config }; return; }
  for (const [k, v] of Object.entries(config)) {
    if (k === "telemetryEnabled") continue;
    const cur = Array.isArray(v) ? v.join(",") : String(v);
    const prev = Array.isArray(lastConfig[k]) ? lastConfig[k].join(",") : String(lastConfig[k]);
    if (cur !== prev) {
      tel("setting", { setting: k, value: k === "rootDir" ? "" : cur });
    }
  }
  lastConfig = { ...config };
}
/* @telemetry-end */

async function persist() {
  const rootDir = document.getElementById("rootDir").value.trim() || DEFAULTS.rootDir;
  const subtitleLangs = Array.from(
    document.querySelectorAll("#subLangs input[type='checkbox']:checked")
  ).map((cb) => cb.value);
  const defaultSubLang = document.getElementById("defaultSubLang").value || subtitleLangs[0] || "";

  const translateComments = document.getElementById("translateComments").checked;
  const translateDescription = document.getElementById("translateDescription").checked;
  const translateEpisodes = document.getElementById("translateEpisodes").checked;
  const closePanelOnClickOutside = document.getElementById("closePanelOnClickOutside").checked;
  const minimizeGesture = document.getElementById("minimizeGesture").value;
  const maximizeGesture = document.getElementById("maximizeGesture").value;
  const seasonRating = document.getElementById("seasonRating").checked;
  const theme = document.getElementById("theme").value === "dark" ? "dark" : "light";

  const config = {
    rootDir, subtitleLangs, defaultSubLang, translateComments, translateDescription,
    translateEpisodes, closePanelOnClickOutside, minimizeGesture, maximizeGesture,
    seasonRating, theme,
    collapsedSizeOroro: sizeState.ororo, collapsedSizeImdb: sizeState.imdb,
  };
  /* @telemetry-start */
  const telCfg = document.getElementById("telemetryEnabled");
  if (telCfg) config.telemetryEnabled = telCfg.checked;
  emitSettingChanges(config);
  /* @telemetry-end */
  await chrome.storage.sync.set(config);

  const status = document.getElementById("status");
  status.textContent = "Saved.";
  clearTimeout(persist._t);
  persist._t = setTimeout(() => (status.textContent = ""), 1500);
}

async function exportWatched() {
  const data = await chrome.storage.local.get("watched");
  const json = JSON.stringify(data.watched || [], null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "zororo-watched-" + new Date().toISOString().slice(0, 10) + ".json";
  a.click();
  URL.revokeObjectURL(url);
  /* @telemetry-start */
  tel("library", { action: "export", count: (data.watched || []).length, surface: "options" });
  /* @telemetry-end */
}

async function importWatched(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!Array.isArray(data)) throw new Error("Not an array");
    for (const item of data) {
      if (!item.id) throw new Error("Item missing 'id' field");
    }
    await chrome.storage.local.set({ watched: data });
    /* @telemetry-start */
    tel("library", { action: "import", count: data.length, surface: "options" });
    /* @telemetry-end */
    const status = document.getElementById("io-status");
    status.textContent = "Imported " + data.length + " watched items.";
    setTimeout(() => (status.textContent = ""), 3000);
  } catch (err) {
    document.getElementById("io-status").textContent = "Import failed: " + err.message;
  }
}

document.addEventListener("DOMContentLoaded", load);
document.getElementById("export-btn").addEventListener("click", exportWatched);
document.getElementById("import-btn").addEventListener("click", () =>
  document.getElementById("import-file").click()
);
document.getElementById("import-file").addEventListener("change", (e) => {
  if (e.target.files.length > 0) importWatched(e.target.files[0]);
  e.target.value = "";
});
