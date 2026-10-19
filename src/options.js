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
/* @telemetry-end */

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
  lastConfig = { ...config };
  /* @telemetry-end */

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
      if (!telEl.checked) chrome.runtime.sendMessage({ type: "telemetry", event: "opt_out", fields: {} });
      persist();
    });
  }
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
      chrome.runtime.sendMessage({ type: "telemetry", event: "setting", fields: { setting: k, value: k === "rootDir" ? "" : cur } });
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
