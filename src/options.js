const LANG_NAMES = { en: "English", fr: "French", de: "German", es: "Spanish", pt: "Portuguese", ru: "Russian", it: "Italian", ja: "Japanese", ko: "Korean", zh: "Chinese" };

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
};

async function load() {
  const data = await chrome.storage.sync.get(Object.keys(DEFAULTS));
  const config = { ...DEFAULTS, ...data };

  document.getElementById("rootDir").value = config.rootDir;
  document.getElementById("theme").value = config.theme === "dark" ? "dark" : "light";

  const checked = config.subtitleLangs || [];
  document.querySelectorAll("#subLangs input[type='checkbox']").forEach((cb) => {
    cb.checked = checked.includes(cb.value);
    cb.onchange = updateDefaultLangSelect;
  });
  updateDefaultLangSelect(config.defaultSubLang);

  document.getElementById("translateComments").checked = config.translateComments;
  document.getElementById("translateDescription").checked = config.translateDescription;
  document.getElementById("translateEpisodes").checked = config.translateEpisodes;
  document.getElementById("closePanelOnClickOutside").checked = config.closePanelOnClickOutside;
  document.getElementById("minimizeGesture").value = config.minimizeGesture;
  document.getElementById("maximizeGesture").value = config.maximizeGesture;
  document.getElementById("seasonRating").checked = config.seasonRating;
  updateGestureDisabled();
  document.getElementById("closePanelOnClickOutside").onchange = updateGestureDisabled;
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

async function save() {
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

  await chrome.storage.sync.set({ rootDir, subtitleLangs, defaultSubLang, translateComments, translateDescription, translateEpisodes, closePanelOnClickOutside, minimizeGesture, maximizeGesture, seasonRating, theme });

  const status = document.getElementById("status");
  status.textContent = "Saved.";
  setTimeout(() => (status.textContent = ""), 2000);
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
document.getElementById("save").addEventListener("click", save);
document.getElementById("export-btn").addEventListener("click", exportWatched);
document.getElementById("import-btn").addEventListener("click", () =>
  document.getElementById("import-file").click()
);
document.getElementById("import-file").addEventListener("change", (e) => {
  if (e.target.files.length > 0) importWatched(e.target.files[0]);
  e.target.value = "";
});
