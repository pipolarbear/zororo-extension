(() => {
  const WATCHED_KEY = "watched";
const PANEL_STATE_KEY = "zororoPanelState";
  const SEASON_RATINGS_KEY = "seasonRatings";
  const RATE_URL = "@RATE_URL@";

  const path = window.location.pathname;
  const showMatch = path.match(/\/[a-z]{2}\/shows\/(.+)/);
  const movieMatch = path.match(/\/[a-z]{2}\/movies\/(.+)/);
  const isShow = !!showMatch;
  const isMovie = !!movieMatch;
  const isContentPage = isShow || isMovie;
  const slug = isContentPage ? (isShow ? showMatch[1] : movieMatch[1]).replace(/\/$/, "") : null;

  let showId = null;
  let showName = null;
  let seasonRatingEnabled = true;
  let episodes = [];
  let seasons = [];
  let posterUrl = null;
  const pendingDeletions = new Set();
  const sortState = { mode: "date", ascending: false };

  async function loadSortState() {
    const data = await chrome.storage.local.get({ watchedSortMode: "date", watchedSortAsc: false });
    sortState.mode = data.watchedSortMode;
    sortState.ascending = data.watchedSortAsc;
  }

  async function saveSortState() {
    await chrome.storage.local.set({ watchedSortMode: sortState.mode, watchedSortAsc: sortState.ascending });
  }

  function sortItems(items) {
    const sorted = [...items];
    sorted.sort((a, b) => {
      if (sortState.mode === "rating") return (a.rating || 0) - (b.rating || 0);
      if (sortState.mode === "alpha") return a.title.localeCompare(b.title);
      return new Date(a.dateWatched) - new Date(b.dateWatched);
    });
    if (!sortState.ascending) sorted.reverse();
    return sorted;
  }

  async function loadWatched() {
    try {
      const data = await chrome.storage.local.get(WATCHED_KEY);
      return data[WATCHED_KEY] || [];
    } catch {
      return [];
    }
  }

  async function saveWatchedItem(item) {
    const watched = await loadWatched();
    const idx = watched.findIndex((w) => w.id === item.id);
    if (idx >= 0) {
      watched[idx] = item;
    } else {
      watched.push(item);
    }
    try {
      await chrome.storage.local.set({ [WATCHED_KEY]: watched });
    } catch { }
  }

  async function removeWatchedItem(id) {
    const watched = await loadWatched();
    const filtered = watched.filter((w) => w.id !== id);
    try {
      await chrome.storage.local.set({ [WATCHED_KEY]: filtered });
    } catch { }
  }

  function seasonRatingKey(showId, season) {
    return showId + "_" + season;
  }

  async function loadSeasonRatings() {
    try {
      const data = await chrome.storage.local.get(SEASON_RATINGS_KEY);
      return data[SEASON_RATINGS_KEY] || {};
    } catch {
      return {};
    }
  }

  async function saveSeasonRating(showId, season, rating) {
    const ratings = await loadSeasonRatings();
    const key = seasonRatingKey(showId, season);
    if (rating > 0) {
      ratings[key] = rating;
    } else {
      delete ratings[key];
    }
    try {
      await chrome.storage.local.set({ [SEASON_RATINGS_KEY]: ratings });
    } catch { }
  }

  function averageRating(values) {
    const nums = values.filter((v) => v > 0);
    if (nums.length === 0) return 0;
    const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
    return Math.round(avg * 2) / 2;
  }

  function makeStarEl(full, half) {
    const s = document.createElement("span");
    s.className = "star" + (full ? " filled" : half ? " half" : "");
    const bg = document.createElement("span");
    bg.className = "star-bg";
    bg.textContent = "\u2605";
    s.appendChild(bg);
    if (full || half) {
      const fill = document.createElement("span");
      fill.className = "star-fill";
      fill.textContent = "\u2605";
      if (half) fill.style.width = "50%";
      s.appendChild(fill);
    }
    return s;
  }

  function makeStarRow(rating, className) {
    const row = document.createElement("span");
    row.className = className || "ororo-star-row";
    for (let i = 1; i <= 5; i++) {
      row.appendChild(makeStarEl(rating >= i, !(rating >= i) && rating >= i - 0.5));
    }
    return row;
  }

  async function refreshGlobalRating(watchedId, showId) {
    const ratings = await loadSeasonRatings();
    const prefix = showId + "_";
    const values = Object.entries(ratings)
      .filter(([k, v]) => k.startsWith(prefix) && v > 0)
      .map(([, v]) => v);
    const avg = averageRating(values);

    const watched = await loadWatched();
    const idx = watched.findIndex((w) => w.id === watchedId);
    const entry = idx >= 0 ? watched[idx] : null;

    if (entry && entry.globalOverride) {
      return entry.rating;
    }

    if (avg > 0) {
      const base = entry || { id: watchedId, type: "show", title: showName || "", slug, url: window.location.pathname, dateWatched: new Date().toISOString() };
      if (!entry) {
        const p = posterUrl || tryGetPoster();
        if (p) base.posterUrl = p;
      }
      base.rating = avg;
      delete base.globalOverride;
      await saveWatchedItem(base);
      return avg;
    }

    if (entry && !entry.globalOverride) {
      await removeWatchedItem(watchedId);
    }
    return 0;
  }

  // ====== STAR DROPDOWN INJECTION ======

  function initDropdownInjection() {
    const inject = () => {
      const tabList = document.querySelector("ul.favorites-tabs-list");
      const content = document.querySelector(".favorites-content");
      if (tabList && content && !document.getElementById("ororo-watched-tab")) {
        injectWatchedTab(tabList, content);
      }
    };
    inject();
    const obs = new MutationObserver(inject);
    obs.observe(document.body, { childList: true, subtree: true });

    document.addEventListener("click", (e) => {
      if (e.target.closest(".hot-icon")) {
        setTimeout(() => {
          const panel = document.querySelector(".ororo-watched-panel");
          if (panel && panel.style.display !== "none") {
            renderWatchedDropdown(panel);
          }
        }, 100);
      }
    });
  }

  function injectWatchedTab(tabList, content) {
    const li = document.createElement("li");
    li.className = "favorites-tabs-item";
    li.id = "ororo-watched-tab";
    const btn = document.createElement("button");
    btn.className = "favorites-tabs-control";
    btn.type = "button";
    btn.textContent = t("ratedTab");
    li.appendChild(btn);
    tabList.appendChild(li);

    const panel = document.createElement("div");
    panel.className = "favorites-content-item ororo-watched-panel";
    panel.style.display = "none";
    content.appendChild(panel);

    const list = document.createElement("div");
    list.className = "favorites-list";
    panel.appendChild(list);

    const foot = document.createElement("div");
    foot.className = "favorites-foot";
    const removeArea = document.createElement("div");
    removeArea.className = "favorites-remove";
    const markArea = document.createElement("div");
    markArea.className = "favorites-mark";
    const editLink = document.createElement("a");
    editLink.className = "js-fav-edit";
    editLink.href = "#";
    editLink.textContent = t("edit");
    editLink.onclick = async (e) => {
      e.preventDefault();
      const wasEditing = panel.classList.contains("editing");
      if (wasEditing && pendingDeletions.size > 0) {
        for (const id of pendingDeletions) {
          await removeWatchedItem(id);
        }
        pendingDeletions.clear();
      }
      panel.classList.toggle("editing");
      editLink.textContent = panel.classList.contains("editing") ? t("done") : t("edit");
      if (wasEditing) renderWatchedDropdown(panel);
    };
    markArea.appendChild(editLink);
    foot.appendChild(removeArea);
    foot.appendChild(markArea);
    panel.appendChild(foot);

    function deactivateWatched() {
      li.classList.remove("active");
      panel.style.display = "none";
    }

    btn.onclick = () => {
      tabList.querySelectorAll(".favorites-tabs-item").forEach((t) => t.classList.remove("active"));
      li.classList.add("active");
      content.querySelectorAll(".favorites-content-item").forEach((p) => { p.style.display = "none"; });
      panel.style.display = "block";
      renderWatchedDropdown(panel);
    };

    tabList.querySelectorAll(".favorites-tabs-control:not(#ororo-watched-tab button)").forEach((existingBtn) => {
      existingBtn.addEventListener("click", deactivateWatched);
    });
  }

  async function renderWatchedDropdown(panel) {
    await loadSortState();
    const watched = await loadWatched();
    const list = panel.querySelector(".favorites-list");
    list.replaceChildren();

    if (watched.length === 0) {
      const note = document.createElement("div");
      note.className = "favorites-note";
      const p = document.createElement("p");
      p.className = "favorites-note-text";
      p.textContent = t("ratedEmpty");
      note.appendChild(p);
      list.appendChild(note);
      updateSortControls(panel, false);
      return;
    }

    const sorted = sortItems(watched);
    for (const item of sorted) {
      const isPending = pendingDeletions.has(item.id);
      const div = document.createElement("div");
      div.className = "favorites-item movie" + (isPending ? " deleted" : "");

      // Poster / icon
      const iconDiv = document.createElement("div");
      iconDiv.className = "movie-icon";
      const primaryDiv = document.createElement("div");
      primaryDiv.className = "movie-icon-primary";
      const link = document.createElement("a");
      link.href = item.url || "/" + path.split("/")[1] + "/" + item.type + "s/" + item.slug;
      if (item.posterUrl) {
        const img = document.createElement("img");
        img.className = "lazy";
        img.src = item.posterUrl;
        img.style.cssText = "width:100%;height:auto;border-radius:4px;";
        link.appendChild(img);
      } else {
        link.textContent = "\uD83C\uDFAC";
        link.style.cssText = "width:100%;aspect-ratio:2/3;display:flex;align-items:center;justify-content:center;background:#1a1a3e;border-radius:4px;font-size:20px;";
      }
      primaryDiv.appendChild(link);
      iconDiv.appendChild(primaryDiv);
      div.appendChild(iconDiv);

      // Info
      const info = document.createElement("a");
      info.className = "movie-info";
      info.href = item.url || "/" + path.split("/")[1] + "/" + item.type + "s/" + item.slug;
      const title = document.createElement("p");
      title.className = "movie-title";
      title.textContent = item.title;
      info.appendChild(title);
      const desc = document.createElement("p");
      desc.className = "movie-description";
      desc.appendChild(makeStarRow(item.rating || 0, "ororo-star-row"));
      desc.appendChild(document.createTextNode(" \u00b7 " + new Date(item.dateWatched).toLocaleDateString()));
      info.appendChild(desc);
      div.appendChild(info);

      // Type badge + Remove + Restore buttons
      const other = document.createElement("div");
      other.className = "movie-other";
      const badge = document.createElement("span");
      badge.style.cssText = "color:" + (item.type === "movie" ? "#00b894" : "#6c5ce7") +
        "; font-size:10px; font-weight:600; text-transform:uppercase;";
      badge.textContent = item.type === "movie" ? "MOVIE" : "SHOW";
      other.appendChild(badge);

      const delBtn = document.createElement("a");
      delBtn.className = "movie-btn remove";
      delBtn.href = "#";
      delBtn.textContent = t("remove");
      delBtn.style.display = "none";
      delBtn.onclick = (e) => {
        e.preventDefault();
        pendingDeletions.add(item.id);
        renderWatchedDropdown(panel);
      };
      other.appendChild(delBtn);

      const restoreBtn = document.createElement("a");
      restoreBtn.className = "movie-btn restore";
      restoreBtn.href = "#";
      restoreBtn.textContent = t("restore");
      restoreBtn.style.display = "none";
      restoreBtn.onclick = (e) => {
        e.preventDefault();
        pendingDeletions.delete(item.id);
        renderWatchedDropdown(panel);
      };
      other.appendChild(restoreBtn);

      div.appendChild(other);
      list.appendChild(div);
    }

    updateSortControls(panel, true);
  }

  function updateSortControls(panel, hasItems) {
    let sortArea = panel.querySelector(".ororo-sort-controls");
    if (!sortArea) {
      sortArea = document.createElement("div");
      sortArea.className = "ororo-sort-controls";
      const foot = panel.querySelector(".favorites-foot");
      if (foot) foot.insertBefore(sortArea, foot.querySelector(".favorites-mark"));
    }
    sortArea.replaceChildren();
    if (!hasItems) return;

    const label = document.createElement("span");
    label.className = "ororo-sort-label";
    label.textContent = "Sort:";
    sortArea.appendChild(label);

    function makeSvgBtn(tag, attrs, children, active) {
      const btn = document.createElement("button");
      btn.className = "ororo-sort-btn" + (active ? " active" : "");
      btn.type = "button";
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      for (const [k, v] of Object.entries(attrs)) svg.setAttribute(k, v);
      for (const c of children) {
        const el = document.createElementNS("http://www.w3.org/2000/svg", c.t);
        for (const [k, v] of Object.entries(c.a)) el.setAttribute(k, v);
        if (c.text) el.textContent = c.text;
        svg.appendChild(el);
      }
      btn.appendChild(svg);
      return btn;
    }

    function btn(title, desc, active, onclick) {
      const b = makeSvgBtn("svg", desc.a, desc.c, active);
      b.title = title;
      b.onclick = onclick;
      return b;
    }

    const starDesc = {
      a: { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linejoin": "round" },
      c: [{ t: "polygon", a: { points: "12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26" } }]
    };
    const clockDesc = {
      a: { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" },
      c: [{ t: "circle", a: { cx: "12", cy: "12", r: "10" } }, { t: "polyline", a: { points: "12 6 12 12 16 14" } }]
    };
    const arrowUpDesc = {
      a: { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" },
      c: [{ t: "line", a: { x1: "12", y1: "19", x2: "12", y2: "5" } }, { t: "polyline", a: { points: "5 12 12 5 19 12" } }]
    };
    const arrowDownDesc = {
      a: { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" },
      c: [{ t: "line", a: { x1: "12", y1: "5", x2: "12", y2: "19" } }, { t: "polyline", a: { points: "19 12 12 19 5 12" } }]
    };
    const alphaDesc = {
      a: { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.5" },
      c: [{ t: "text", a: { x: "4", y: "18", "font-family": "sans-serif", "font-weight": "bold", "font-size": "14", fill: "currentColor" }, text: "A" }, { t: "text", a: { x: "14", y: "18", "font-family": "sans-serif", "font-weight": "bold", "font-size": "14", fill: "currentColor" }, text: "Z" }]
    };

    const starBtn = btn("Sort by rating", starDesc, sortState.mode === "rating", () => { sortState.mode = "rating"; saveSortState(); renderWatchedDropdown(panel); });
    sortArea.appendChild(starBtn);

    const clockBtn = btn("By date rated", clockDesc, sortState.mode === "date", () => { sortState.mode = "date"; saveSortState(); renderWatchedDropdown(panel); });
    sortArea.appendChild(clockBtn);

    const alphaBtn = btn("Sort alphabetically", alphaDesc, sortState.mode === "alpha", () => { sortState.mode = "alpha"; saveSortState(); renderWatchedDropdown(panel); });
    sortArea.appendChild(alphaBtn);

    const sep = document.createElement("div");
    sep.className = "ororo-sort-separator";
    sortArea.appendChild(sep);

    const arrowBtn = btn(sortState.ascending ? "Ascending" : "Descending", sortState.ascending ? arrowUpDesc : arrowDownDesc, true, () => { sortState.ascending = !sortState.ascending; saveSortState(); renderWatchedDropdown(panel); });
    sortArea.appendChild(arrowBtn);
  }

  // ====== PANEL UI (show/movie pages only) ======

  function slugify(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  async function getConfig() {
    const defaults = {
      rootDir: "OroroTV",
      translateComments: true,
      translateDescription: true,
      translateEpisodes: true,
      seasonRating: true,
      theme: "light",
      collapsedSizeOroro: 100,
    };
    try {
      return await new Promise((r) => chrome.storage.sync.get(defaults, r));
    } catch {
      return defaults;
    }
  }

  const THEME_KEY = "zororoTheme";

  function setCollapsedScale(panel, size) {
    const n = Number(size);
    const scale = n >= 25 && n <= 100 ? n / 100 : 1;
    panel.style.setProperty("--zoro-collapsed-scale", String(scale));
  }

  function applyTheme(theme) {
    const value = theme === "dark" ? "dark" : "light";
    if (document.documentElement) {
      document.documentElement.setAttribute("data-zororo-theme", value);
    }
    try {
      localStorage.setItem(THEME_KEY, value);
    } catch { }
  }

  async function initTheme() {
    try {
      const { theme } = await chrome.storage.sync.get({ theme: "light" });
      applyTheme(theme);
    } catch { }
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "sync" && changes.theme) applyTheme(changes.theme.newValue);
      });
    } catch { }
  }

  function tryGetPoster() {
    const img = document.querySelector('img#poster, img[src*="/uploads/show/poster/"], img[data-src*="/uploads/show/poster/"]');
    if (img) return img.getAttribute("src") || img.getAttribute("data-src") || null;
    return null;
  }

  function tryGetPosterFromData(data) {
    if (!data || typeof data !== "object") return null;
    for (const key of ["poster_url", "poster", "image", "poster_thumb", "thumbnail"]) {
      if (typeof data[key] === "string" && data[key].length > 0) return data[key];
    }
    for (const key of Object.keys(data)) {
      const val = data[key];
      if (val && typeof val === "object" && !Array.isArray(val)) {
        const found = tryGetPosterFromData(val);
        if (found) return found;
      }
    }
    return null;
  }

  function getLangPrefix() {
    const m = path.match(/^\/([a-z]{2})(?:\/|$)/);
    return m ? m[1] : "en";
  }

  function t(key, params = {}) {
    return window.ZororoI18n.t(getLangPrefix(), key, params);
  }

  if (isShow || isMovie) {
    initContentPanel();
  }

  async function initContentPanel() {
    const config = await getConfig();
    const lang = getLangPrefix();
    seasonRatingEnabled = config.seasonRating !== false;

    const { closePanelOnClickOutside, minimizeGesture, maximizeGesture } = await chrome.storage.sync.get({
      closePanelOnClickOutside: true,
      minimizeGesture: "dblclick",
      maximizeGesture: "dblclick",
    });

    const panel = document.createElement("div");
    panel.id = "ororo-dl-panel";
    const { [PANEL_STATE_KEY]: savedState } = await chrome.storage.local.get(PANEL_STATE_KEY);
    if (savedState === "collapsed") panel.classList.add("collapsed");

    const closeBtn = document.createElement("button");
    closeBtn.className = "close-btn";
    closeBtn.id = "ororo-dl-close";
    closeBtn.textContent = "×";
    panel.appendChild(closeBtn);

    const titleRow = document.createElement("div");
    titleRow.className = "title-row";

    const titleEl = document.createElement("h2");
    titleEl.id = "ororo-dl-title";
    titleEl.textContent = "zororo";
    titleRow.appendChild(titleEl);

    const settingsBtn = document.createElement("button");
    settingsBtn.id = "ororo-dl-settings-btn";
    settingsBtn.className = "btn-settings";
    settingsBtn.type = "button";
    settingsBtn.textContent = "\u2699";
    settingsBtn.title = "Settings";
    settingsBtn.setAttribute("aria-label", "Settings");
    settingsBtn.onclick = () => {
      chrome.runtime.sendMessage({ type: "open-options" });
    };
    titleRow.appendChild(settingsBtn);
    panel.appendChild(titleRow);

    const subtitleRow = document.createElement("div");
    subtitleRow.className = "subtitle-row";

    const subEl = document.createElement("p");
    subEl.className = "subtitle";
    subEl.id = "ororo-dl-subtitle";
    subEl.textContent = t("loading");
    subtitleRow.appendChild(subEl);

    const extLinksEl = document.createElement("div");
    extLinksEl.id = "ororo-dl-extlinks";
    extLinksEl.className = "ext-links";
    extLinksEl.style.display = "none";
    subtitleRow.appendChild(extLinksEl);
    panel.appendChild(subtitleRow);

    const watchedEl = document.createElement("div");
    watchedEl.id = "ororo-dl-watched";
    watchedEl.className = "watched-section";
    panel.appendChild(watchedEl);

    const bodyEl = document.createElement("div");
    bodyEl.id = "ororo-dl-body";
    panel.appendChild(bodyEl);

    const statusBar = document.createElement("div");
    statusBar.className = "status-bar";
    statusBar.id = "ororo-dl-status";
    panel.appendChild(statusBar);

    const errorEl = document.createElement("div");
    errorEl.className = "error-msg";
    errorEl.id = "ororo-dl-error";
    panel.appendChild(errorEl);

    const panelFooter = document.createElement("div");
    panelFooter.className = "panel-footer";

    const donateBtn = document.createElement("button");
    donateBtn.id = "ororo-dl-donate-btn";
    donateBtn.className = "donate-btn";
    donateBtn.textContent = "❤️ " + t("support");
    panelFooter.appendChild(donateBtn);

    const reviewBtn = document.createElement("button");
    reviewBtn.id = "ororo-dl-review-btn";
    reviewBtn.className = "review-btn";
    reviewBtn.textContent = "★ " + t("reviewUs");
    reviewBtn.onclick = () => {
      chrome.storage.local.set({ zororoRated: true });
      window.open(RATE_URL, "_blank");
    };
    panelFooter.appendChild(reviewBtn);

    panel.appendChild(panelFooter);

    document.body.appendChild(panel);
    const overlay = document.getElementById("overlay");
    if (overlay) {
      const mo = new MutationObserver(() => {
        panel.style.display = overlay.style.display !== "none" ? "none" : "";
      });
      mo.observe(overlay, { attributes: true, attributeFilter: ["style"] });
      if (getComputedStyle(overlay).display !== "none") {
        panel.style.display = "none";
      }
    }

    const collapseIcon = document.createElement("img");
    collapseIcon.className = "ororo-collapse-icon";
    collapseIcon.src = chrome.runtime.getURL("icons/zoro.png");
    collapseIcon.alt = "Zororo";
    panel.appendChild(collapseIcon);

    setCollapsedScale(panel, config.collapsedSizeOroro);
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "sync" && changes.collapsedSizeOroro) setCollapsedScale(panel, changes.collapsedSizeOroro.newValue);
      });
    } catch { }

    closeBtn.onclick = (e) => {
      e.stopPropagation();
      panel.classList.toggle("collapsed");
      chrome.storage.local.set({ [PANEL_STATE_KEY]: panel.classList.contains("collapsed") ? "collapsed" : "expanded" });
    };
    panel.onclick = (e) => {
      if (panel.classList.contains("collapsed")) {
        panel.classList.remove("collapsed");
        chrome.storage.local.set({ [PANEL_STATE_KEY]: "expanded" });
      }
    };

    ZororoDonate.build(panel, { t });
    donateBtn.onclick = () => {
      ZororoDonate.open(panel);
    };

    if (closePanelOnClickOutside !== false) {
      function isActionableInPanel(el, root) {
        while (el && el !== root) {
          const tag = el.tagName;
          if (tag === "A" || tag === "BUTTON" || tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || tag === "LABEL") {
            return true;
          }
          if (el.onclick || el.getAttribute("role") === "button" || el.hasAttribute("tabindex")) {
            return true;
          }
          if (el.classList.contains("star") || el.classList.contains("ororo-dl-season-cb") ||
              el.classList.contains("btn-download") || el.classList.contains("btn-select-all") ||
              el.classList.contains("btn-invert") || el.classList.contains("donate-btn") ||
              el.classList.contains("close-btn") || el.classList.contains("ororo-collapse-icon") ||
              el.classList.contains("crypto-card") || el.classList.contains("coin-circle") ||
              el.classList.contains("donate-back") || el.classList.contains("ororo-tt-link")) {
            return true;
          }
          el = el.parentElement;
        }
        return false;
      }

      const handleOutside = (e, gesture) => {
        if (!panel) return;
        if (isActionableInPanel(e.target, panel)) return;
        if (panel.contains(e.target)) return;
        if (panel.classList.contains("collapsed")) {
          if (maximizeGesture === gesture) {
            panel.classList.remove("collapsed");
            chrome.storage.local.set({ [PANEL_STATE_KEY]: "expanded" });
          }
        } else {
          if (minimizeGesture === gesture) {
            panel.classList.add("collapsed");
            chrome.storage.local.set({ [PANEL_STATE_KEY]: "collapsed" });
          }
        }
      };

      document.addEventListener("click", (e) => handleOutside(e, "click"), true);
      document.addEventListener("dblclick", (e) => handleOutside(e, "dblclick"), true);
    }

    if (isMovie) {
      await initMovie(titleEl, subEl, bodyEl, watchedEl, statusBar, errorEl, extLinksEl);
    } else {
      await initShow(titleEl, subEl, bodyEl, watchedEl, statusBar, errorEl, extLinksEl);
    }
  }

  async function initShow(titleEl, subEl, bodyEl, watchedEl, statusBar, errorEl, extLinksEl) {
    try {
      const resp = await fetch("/api/v2/shows", { credentials: "include" });
      if (!resp.ok) {
        if (resp.status === 401) throw new Error("AUTH_FAILED");
        if (resp.status === 402) throw new Error("FREE_LIMIT");
        throw new Error("API_" + resp.status);
      }
      const data = await resp.json();
      const shows = data.shows || [];
      const show = shows.find((s) => slugify(s.name) === slug) || shows[0];
      if (!show) throw new Error("SHOW_NOT_FOUND");
      showId = show.id;
      showName = show.name;

      posterUrl = show.poster_url || show.poster || show.image || show.thumbnail || tryGetPoster();

      titleEl.textContent = showName;

      const detail = await fetch("/api/v2/shows/" + showId, { credentials: "include" });
      if (!detail.ok) throw new Error("API_" + detail.status);
      const showData = await detail.json();

      if (!posterUrl) posterUrl = tryGetPosterFromData(showData);
      if (!posterUrl) posterUrl = tryGetPoster();

      episodes = showData.episodes || [];

      const seasonSet = new Set(episodes.map((e) => e.season));
      seasons = Array.from(seasonSet).sort((a, b) => a - b);

      subEl.textContent = t("episodesCount", { count: episodes.length, seasons: seasons.length });
      await renderDownloadSection(bodyEl, titleEl, subEl, watchedEl, statusBar, errorEl);
      await refreshGlobalRating("show_" + showId, showId);
      const watchedAfter = await loadWatched();
      const finalEntry = watchedAfter.find((w) => w.id === "show_" + showId) || null;
      buildWatchedSection(watchedEl, "show_" + showId, showName, finalEntry);
    const years = episodes.map(episodeYear).filter((y) => y);
    const minYear = years.length ? Math.min(...years) : null;
    try { await renderExternalLinks(extLinksEl, showName, minYear, false); } catch {}
    } catch (err) {
      const msgs = {
        AUTH_FAILED: t("authFailed"),
        FREE_LIMIT: t("freeLimit"),
        SHOW_NOT_FOUND: t("showNotFound"),
      };
      errorEl.textContent = msgs[err.message] || t("loadFailed") + ": " + err.message;
      errorEl.classList.add("visible");
      subEl.textContent = t("loadFailed");
    }
  }

  async function initMovie(titleEl, subEl, bodyEl, watchedEl, statusBar, errorEl, extLinksEl) {
    try {
      const resp = await fetch("/api/v2/shows", { credentials: "include" });
      if (!resp.ok) {
        if (resp.status === 401) throw new Error("AUTH_FAILED");
        if (resp.status === 402) throw new Error("FREE_LIMIT");
        throw new Error("API_" + resp.status);
      }
      const data = await resp.json();
      const shows = data.shows || [];
      const movie = shows.find((s) => slugify(s.name) === slug);
      if (movie) {
        showId = movie.id;
        showName = movie.name;

        posterUrl = movie.poster_url || movie.poster || movie.image || movie.thumbnail || tryGetPoster();

        titleEl.textContent = showName;

        const detail = await fetch("/api/v2/shows/" + showId, { credentials: "include" });
        if (!detail.ok) throw new Error("API_" + detail.status);
        const showData = await detail.json();

        if (!posterUrl) posterUrl = tryGetPosterFromData(showData);
        if (!posterUrl) posterUrl = tryGetPoster();
      }
    } catch (err) {
      const msgs = {
        AUTH_FAILED: t("authFailed"),
        FREE_LIMIT: t("freeLimit"),
      };
      errorEl.textContent = msgs[err.message] || t("loadFailed") + ": " + err.message;
      errorEl.classList.add("visible");
      subEl.textContent = t("loadFailed");
      return;
    }

    if (!showName) {
      showName = slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      showId = slug;
      if (!posterUrl) posterUrl = tryGetPoster();
    }

    titleEl.textContent = showName;
    subEl.textContent = t("movie");
    bodyEl.style.display = "none";

    const watched = await loadWatched();
    const entry = watched.find((w) => w.id === "movie_" + showId);
    buildWatchedSection(watchedEl, "movie_" + showId, showName, entry || null);
    try { await renderExternalLinks(extLinksEl, showName, null, true); } catch {}
  }

  function buildWatchedSection(watchedEl, id, title, entry, poster) {
    watchedEl.replaceChildren();

    const stars = document.createElement("span");
    stars.className = "star-rating";
    let currentRating = entry ? entry.rating : 0;
    let overridden = entry ? !!entry.globalOverride : false;

    async function handleStarClick(i) {
      currentRating = currentRating === i ? 0 : i;
      if (currentRating > 0) {
        overridden = true;
        const item = {
          id: id,
          type: isMovie ? "movie" : "show",
          title: title,
          slug: slug,
          url: window.location.pathname,
          rating: currentRating,
          globalOverride: true,
          dateWatched: new Date().toISOString(),
        };
        const p = poster || posterUrl || tryGetPoster();
        if (p) item.posterUrl = p;
        await saveWatchedItem(item);
        renderStars(currentRating);
      } else if (isMovie) {
        overridden = false;
        await removeWatchedItem(id);
        renderStars(0);
      } else {
        const watched = await loadWatched();
        const cur = watched.find((w) => w.id === id);
        if (cur) {
          delete cur.globalOverride;
          await saveWatchedItem(cur);
        }
        overridden = false;
        currentRating = await refreshGlobalRating(id, showId);
        renderStars(currentRating);
      }
    }

    function renderStars(rating) {
      stars.replaceChildren();
      const label = document.createElement("span");
      label.className = "watched-label";
      label.textContent = rating > 0 ? t("rated") : t("rate");
      stars.appendChild(label);
      for (let i = 1; i <= 5; i++) {
        const s = makeStarEl(rating >= i, !(rating >= i) && rating >= i - 0.5);
        s.dataset.value = String(i);
        s.onmouseenter = () => {
          for (const child of stars.children) {
            if (child.dataset && child.dataset.value) {
              child.classList.toggle("hover", Number(child.dataset.value) <= i);
            }
          }
        };
        s.onclick = () => handleStarClick(i);
        stars.appendChild(s);
      }
      stars.onmouseleave = () => {
        for (const child of stars.children) {
          child.classList.remove("hover");
        }
      };
      if (rating > 0 && !overridden) {
        const pill = document.createElement("span");
        pill.className = "watched-pill";
        pill.textContent = t("ratedAvgPill");
        pill.title = t("ratedAvgTip");
        stars.appendChild(pill);
      }
    }
    renderStars(currentRating);

    watchedEl.appendChild(stars);
  }

  function buildSeasonRating(season, seasonRatings, watchedEl) {
    const wrap = document.createElement("span");
    wrap.className = "season-rating";
    wrap.title = t("rateSeason");
    const key = seasonRatingKey(showId, season);

    const render = (rating) => {
      wrap.replaceChildren();
      for (let i = 1; i <= 5; i++) {
        const s = document.createElement("span");
        s.className = "star" + (i <= rating ? " filled" : "");
        s.textContent = "\u2605";
        s.dataset.value = String(i);
        s.onmouseenter = () => {
          for (const child of wrap.children) {
            if (child.dataset && child.dataset.value) {
              child.classList.toggle("hover", Number(child.dataset.value) <= i);
            }
          }
        };
        s.onclick = async () => {
          const current = seasonRatings[key] || 0;
          const next = current === i ? 0 : i;
          seasonRatings[key] = next;
          await saveSeasonRating(showId, season, next);
          render(next);
          await refreshGlobalRating("show_" + showId, showId);
          const watched = await loadWatched();
          const entry = watched.find((w) => w.id === "show_" + showId) || null;
          buildWatchedSection(watchedEl, "show_" + showId, showName, entry);
        };
        wrap.appendChild(s);
      }
      wrap.onmouseleave = () => {
        for (const child of wrap.children) {
          child.classList.remove("hover");
        }
      };
    };
    render(seasonRatings[key] || 0);
    return wrap;
  }

  function episodeYear(ep) {
    if (!ep) return null;
    for (const key of Object.keys(ep)) {
      const v = ep[key];
      if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) {
        const y = new Date(v).getFullYear();
        if (!isNaN(y)) return y;
      }
    }
    return null;
  }

  async function renderExternalLinks(extLinksEl, title, year, isMovie) {
    if (!title) {
      extLinksEl.style.display = "none";
      return;
    }
    let resolved = false;

    function showLoading() {
      extLinksEl.replaceChildren();
      const load = document.createElement("span");
      load.className = "ext-link-loading";
      load.textContent = "loading…";
      extLinksEl.appendChild(load);
      extLinksEl.style.display = "flex";
    }

    function renderLinks(imdbUrl, rtUrl) {
      if (resolved) return;
      extLinksEl.replaceChildren();
      let hasLinks = false;

      if (imdbUrl) {
        const a = document.createElement("a");
        a.className = "ext-link imdb";
        a.href = imdbUrl;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = "IMDb";
        a.title = t("openImdb");
        extLinksEl.appendChild(a);
        hasLinks = true;
      }

      if (rtUrl) {
        const a = document.createElement("a");
        a.className = "ext-link rt";
        a.href = rtUrl;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = "RT";
        a.title = t("openRt");
        extLinksEl.appendChild(a);
        hasLinks = true;
      }

      if (hasLinks) {
        extLinksEl.style.display = "flex";
      } else {
        extLinksEl.style.display = "none";
      }
      resolved = true;
    }

    showLoading();

    try {
      const resp = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { type: "resolve-external-links", title, year, mediaType: isMovie ? "movie" : "show" },
          (r) => resolve(r || { imdb: null, rt: null })
        );
      });
      if (resolved) return;
      renderLinks(resp.imdb, resp.rt);
    } catch {
      if (!resolved) {
        extLinksEl.style.display = "none";
      }
    }
  }

  async function recordSuccessfulDownload(statusBar) {
    const data = await chrome.storage.local.get({ zororoRated: false, zororoDownloadCount: 0 });
    const count = data.zororoDownloadCount + 1;
    await chrome.storage.local.set({ zororoDownloadCount: count });
    if (data.zororoRated || count < 3) return;

    const nudge = document.createElement("div");
    nudge.className = "ororo-review-nudge";
    const msg = document.createElement("span");
    msg.textContent = t("reviewPrompt");
    nudge.appendChild(msg);

    const btns = document.createElement("div");
    btns.className = "nudge-btns";

    const rateBtn = document.createElement("button");
    rateBtn.className = "nudge-btn rate";
    rateBtn.textContent = "★ " + t("reviewUs");
    rateBtn.onclick = () => {
      chrome.storage.local.set({ zororoRated: true });
      window.open(RATE_URL, "_blank");
      nudge.remove();
    };
    const laterBtn = document.createElement("button");
    laterBtn.className = "nudge-btn";
    laterBtn.textContent = t("reviewLater");
    laterBtn.onclick = () => {
      chrome.storage.local.set({ zororoDownloadCount: 0 });
      nudge.remove();
    };
    const neverBtn = document.createElement("button");
    neverBtn.className = "nudge-btn";
    neverBtn.textContent = t("reviewNever");
    neverBtn.onclick = () => {
      chrome.storage.local.set({ zororoRated: true });
      nudge.remove();
    };

    btns.appendChild(rateBtn);
    btns.appendChild(laterBtn);
    btns.appendChild(neverBtn);
    nudge.appendChild(btns);
    statusBar.appendChild(nudge);
  }

  async function renderDownloadSection(bodyEl, titleEl, subEl, watchedEl, statusBar, errorEl) {
    const old = document.getElementById("ororo-dl-download");
    if (old) old.remove();

    let seasonRatings = {};
    if (seasonRatingEnabled) {
      seasonRatings = await loadSeasonRatings();
    }

    const wrap = document.createElement("div");
    wrap.id = "ororo-dl-download";

    const seasDiv = document.createElement("div");
    seasDiv.id = "ororo-dl-seasons";
    wrap.appendChild(seasDiv);

    const actions1 = document.createElement("div");
    actions1.className = "actions";
    const goBtn = document.createElement("button");
    goBtn.className = "btn-download";
    goBtn.id = "ororo-dl-go";
    goBtn.textContent = t("download");
    actions1.appendChild(goBtn);
    wrap.appendChild(actions1);

    const actions2 = document.createElement("div");
    actions2.className = "actions";
    const selBtn = document.createElement("button");
    selBtn.className = "btn-select-all";
    selBtn.id = "ororo-dl-select-all";
    const invertBtn = document.createElement("button");
    invertBtn.className = "btn-invert";
    invertBtn.id = "ororo-dl-invert";
    invertBtn.textContent = t("invert");
    actions2.appendChild(selBtn);
    actions2.appendChild(invertBtn);
    wrap.appendChild(actions2);

    const updateSelectToggle = () => {
      const anySelected = document.querySelectorAll(".ororo-dl-season-cb:checked").length > 0;
      selBtn.textContent = anySelected ? t("deselectAll") : t("selectAll");
    };

    bodyEl.appendChild(wrap);

    // Render seasons
    const seasonsEl = document.getElementById("ororo-dl-seasons");
    seasonsEl.replaceChildren();
    for (const s of seasons) {
      const eps = episodes.filter((e) => e.season === s);
      const tab = document.getElementById(String(s));
      let released = eps.length;
      let upcoming = 0;
      if (tab) {
        upcoming = tab.querySelectorAll(".show-content__upcoming-episode").length;
      }
      const total = released + upcoming;
      const incomplete = upcoming > 0;

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "ororo-dl-season-cb";
      cb.dataset.season = String(s);
      cb.checked = !incomplete;
      cb.addEventListener("change", updateSelectToggle);
      const years = eps.map(episodeYear).filter((y) => y);
      const year = years.length ? Math.min(...years) : null;
      const span = document.createElement("span");
      span.className = "season-name";
      span.textContent = t("season", { n: s });
      const count = document.createElement("span");
      count.className = "season-count";
      count.textContent = incomplete ? t("ofFormat", { released, total }) : total + " ep.";
      const label = document.createElement("label");
      label.appendChild(cb);
      label.appendChild(span);
      if (year) {
        const yearSpan = document.createElement("span");
        yearSpan.className = "season-year";
        yearSpan.textContent = "" + year;
        label.appendChild(yearSpan);
      }
      label.appendChild(count);
      if (incomplete) {
        const badge = document.createElement("span");
        badge.className = "season-missing";
        badge.textContent = "\u23F3" + upcoming;
        badge.title = t("missing", { count: upcoming });
        label.appendChild(badge);
      }
      const div = document.createElement("div");
      div.className = "season-group" + (incomplete ? " incomplete" : "");
      div.appendChild(label);
      if (!incomplete && seasonRatingEnabled) {
        const ratingEl = buildSeasonRating(s, seasonRatings, watchedEl);
        div.appendChild(ratingEl);
      }
      seasonsEl.appendChild(div);
    }

    updateSelectToggle();

    selBtn.onclick = () => {
      const anySelected = document.querySelectorAll(".ororo-dl-season-cb:checked").length > 0;
      document.querySelectorAll(".ororo-dl-season-cb").forEach((c) => (c.checked = !anySelected));
      updateSelectToggle();
    };
    invertBtn.onclick = () => {
      document.querySelectorAll(".ororo-dl-season-cb").forEach((c) => (c.checked = !c.checked));
      updateSelectToggle();
    };

    goBtn.onclick = async () => {
      const selected = Array.from(document.querySelectorAll(".ororo-dl-season-cb:checked"))
        .map((cb) => parseInt(cb.dataset.season, 10));
      if (selected.length === 0) {
        errorEl.textContent = t("selectSeason");
        errorEl.classList.add("visible");
        return;
      }

      errorEl.classList.remove("visible");
      goBtn.disabled = true;
      goBtn.textContent = t("resolving");

      const epsToDl = episodes.filter((e) => selected.includes(e.season));
      const resolved = [];

      for (let i = 0; i < epsToDl.length; i++) {
        statusBar.textContent = t("resolvingProgress", { current: i + 1, total: epsToDl.length });
        statusBar.classList.add("visible");
        try {
          const item = await resolveEpisode(epsToDl[i]);
          if (item.downloadUrl) resolved.push(item);
        } catch (err) {
          errorEl.textContent = "" + err.message;
          errorEl.classList.add("visible");
        }
      }

      if (resolved.length === 0) {
        errorEl.textContent = t("resolveFailed");
        errorEl.classList.add("visible");
        goBtn.disabled = false;
        goBtn.textContent = t("download");
        statusBar.classList.remove("visible");
        return;
      }

      goBtn.textContent = t("checking");

      try {
        chrome.runtime.sendMessage(
          { type: "start-download", showName: showName, episodes: resolved },
          (resp) => {
            if (chrome.runtime.lastError) {
              errorEl.textContent = t("extensionError");
              errorEl.classList.add("visible");
            } else if (resp.queued === 0) {
              statusBar.textContent = t("allDownloaded");
              statusBar.classList.add("visible");
            } else {
              const parts = [t("queued", { count: resp.queued })];
              if (resp.skipped > 0) parts.push(t("skipped", { count: resp.skipped }));
              statusBar.textContent = parts.join(" ");
              statusBar.classList.add("visible");
              recordSuccessfulDownload(statusBar);
            }
            goBtn.disabled = false;
            goBtn.textContent = t("download");
          }
        );
      } catch {
        errorEl.textContent = t("extensionError");
        errorEl.classList.add("visible");
        goBtn.disabled = false;
        goBtn.textContent = t("download");
        statusBar.classList.remove("visible");
      }
    };
  }

  async function resolveEpisode(ep) {
    const resp = await fetch("/api/v2/episodes/" + ep.id, { credentials: "include" });
    if (!resp.ok) throw new Error("Failed to resolve episode " + ep.id + ": HTTP " + resp.status);
    const data = await resp.json();
    return {
      showName: showName,
      season: ep.season,
      number: ep.number,
      name: ep.name,
      downloadUrl: data.download_url,
      subtitles: (data.subtitles || []).map((s) => ({
        lang: s.lang,
        url: s.url.startsWith("http") ? s.url : "https://ororo.tv" + s.url,
      })),
    };
  }

  // ====== COMMENT TRANSLATION ======

  const translateCache = new Map();
  let translateQueue = Promise.resolve();

  async function translateText(text, targetLang) {
    const key = text + "|" + targetLang;
    if (translateCache.has(key)) return translateCache.get(key);
    const url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=" + targetLang + "&dt=t&q=" + encodeURIComponent(text.slice(0, 500));
    const prev = translateQueue;
    let release;
    translateQueue = new Promise((r) => release = r);
    await prev;
    try {
      await new Promise((r) => setTimeout(r, 500));
      const resp = await fetch(url);
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      const data = await resp.json();
      const result = data[0].map((s) => s[0]).join("");
      translateCache.set(key, result);
      return result;
    } catch {
      return null;
    } finally {
      release();
    }
  }

  function flashFailure(link) {
    const origText = link.textContent;
    const origColor = link.style.color;
    link.textContent = "✗";
    link.style.color = "#ff6b6b";
    setTimeout(() => {
      link.textContent = origText;
      link.style.color = origColor;
    }, 3000);
  }

  function processComment(commentEl, targetLang) {
    const textDiv = commentEl.querySelector(".text-content");
    const footer = commentEl.querySelector(".footer");
    if (!textDiv || !footer || textDiv.dataset.ttProcessed) return;
    textDiv.dataset.ttProcessed = "1";
    const text = textDiv.textContent.trim();
    if (!text) return;

    const link = document.createElement("a");
    link.href = "#";
    link.className = "ororo-tt-link";
    link.textContent = t("translate");
    link.dataset.originalText = text;

    link.onclick = async (e) => {
      e.preventDefault();
      if (link.dataset.state === "translated") {
        textDiv.textContent = link.dataset.originalText;
        link.textContent = t("translate");
        link.dataset.state = "";
        return;
      }
      const translated = await translateText(text, targetLang);
      if (translated === null) {
        flashFailure(link);
        return;
      }
      if (translated !== text) {
        textDiv.textContent = translated;
        link.textContent = t("original");
        link.dataset.state = "translated";
      }
    };

    footer.insertBefore(link, footer.lastElementChild);
  }

  function initCommentTranslation() {
    const targetLang = getLangPrefix();
    const observer = new MutationObserver(() => {
      document.querySelectorAll(".comment.top-lvl, .comment.nested").forEach((el) => processComment(el, targetLang));
    });
    observer.observe(document.body, { childList: true, subtree: true });
    document.querySelectorAll(".comment.top-lvl, .comment.nested").forEach((el) => processComment(el, targetLang));
  }

  // ====== EXTENDED TRANSLATION (description + episode plot) ======

  function processShowDescription(descEl, targetLang) {
    if (descEl.dataset.ttProcessed) return;
    const desc = descEl.textContent.trim();
    if (!desc) return;

    const titleEl = document.querySelector("h1.show-content__title, .show-content__title h1, h1");
    const title = titleEl ? titleEl.textContent.trim() : "";
    const combined = title ? title + ".\n\n" + desc : desc;

    descEl.dataset.ttProcessed = "1";
    const link = document.createElement("a");
    link.href = "#";
    link.className = "ororo-tt-link";
    link.textContent = t("translate");
    link.dataset.originalDesc = desc;
    link.dataset.originalTitle = title;

    link.onclick = async (e) => {
      e.preventDefault();
      if (link.dataset.state === "translated") {
        descEl.textContent = link.dataset.originalDesc;
        if (titleEl) titleEl.textContent = link.dataset.originalTitle;
        link.textContent = t("translate");
        link.dataset.state = "";
        return;
      }
      const translated = await translateText(combined, targetLang);
      if (translated === null) {
        flashFailure(link);
        return;
      }
      if (translated !== combined) {
        let descPart = translated;
        let titlePart = "";
        for (const sep of [".\n\n", "\n\n", "\n"]) {
          const idx = translated.indexOf(sep);
          if (idx > 0) {
            titlePart = translated.slice(0, idx);
            descPart = translated.slice(idx + sep.length);
            break;
          }
        }
        if (titlePart && titleEl) titleEl.textContent = titlePart;
        descEl.textContent = descPart;
        link.textContent = t("original");
        link.dataset.state = "translated";
      }
    };

    descEl.parentNode.insertBefore(link, descEl.nextSibling);
  }

  function processEpisodePlot(plotTextEl, targetLang) {
    if (plotTextEl.dataset.ttProcessed) return;
    const desc = plotTextEl.textContent.trim();
    if (!desc) return;

    const row = plotTextEl.closest(".show-content__episode-row");
    const titleEl = row ? row.querySelector(".show-content__episode-link") : null;
    const title = titleEl ? titleEl.textContent.trim() : "";
    const combined = title ? title + ".\n\n" + desc : desc;

    plotTextEl.dataset.ttProcessed = "1";
    const link = document.createElement("a");
    link.href = "#";
    link.className = "ororo-tt-link";
    link.textContent = t("translate");
    link.dataset.originalDesc = desc;
    link.dataset.originalTitle = title;

    link.onclick = async (e) => {
      e.preventDefault();
      if (link.dataset.state === "translated") {
        plotTextEl.textContent = link.dataset.originalDesc;
        if (titleEl) titleEl.textContent = link.dataset.originalTitle;
        link.textContent = t("translate");
        link.dataset.state = "";
        return;
      }
      const translated = await translateText(combined, targetLang);
      if (translated === null) {
        flashFailure(link);
        return;
      }
      if (translated !== combined) {
        let descPart = translated;
        let titlePart = "";
        for (const sep of [".\n\n", "\n\n", "\n"]) {
          const idx = translated.indexOf(sep);
          if (idx > 0) {
            titlePart = translated.slice(0, idx);
            descPart = translated.slice(idx + sep.length);
            break;
          }
        }
        if (titlePart && titleEl) titleEl.textContent = titlePart;
        plotTextEl.textContent = descPart;
        link.textContent = t("original");
        link.dataset.state = "translated";
      }
    };

    const plotEl = plotTextEl.closest(".episode-plot");
    if (plotEl) {
      plotEl.insertBefore(link, plotTextEl.nextSibling);
    } else {
      plotTextEl.parentNode.insertBefore(link, plotTextEl.nextSibling);
    }
  }

  function initExtendedTranslation(cfg) {
    const targetLang = getLangPrefix();

    if (cfg.translateDescription) {
      const descEl = document.querySelector("div.show-content__description");
      if (descEl) processShowDescription(descEl, targetLang);
    }

    if (cfg.translateEpisodes) {
      const observer = new MutationObserver(() => {
        document.querySelectorAll(".episode-plot__text:not([data-tt-processed])").forEach((el) => processEpisodePlot(el, targetLang));
        if (cfg.translateDescription) {
          const newDesc = document.querySelector("div.show-content__description:not([data-tt-processed])");
          if (newDesc) processShowDescription(newDesc, targetLang);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      document.querySelectorAll(".episode-plot__text:not([data-tt-processed])").forEach((el) => processEpisodePlot(el, targetLang));
    }
  }

  initTheme();
  initDropdownInjection();
  getConfig().then((cfg) => {
    if (cfg.translateComments) initCommentTranslation();
    if (cfg.translateDescription || cfg.translateEpisodes) initExtendedTranslation(cfg);
  });

  // ====== CONTENT REQUEST (used by the IMDb panel fallback) ======

  function setInputValue(el, value) {
    el.focus();
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.blur();
  }

  async function doContentRequest(title, imdbId) {
    const btn = document.querySelector('a[data-modal="contentRequest"]');
    if (!btn) return false;
    btn.click();
    for (let i = 0; i < 40; i++) {
      if (document.querySelector("#content_request_title")) break;
      await new Promise((r) => setTimeout(r, 150));
    }
    const titleEl = document.querySelector("#content_request_title");
    const linkEl = document.querySelector("#content_request_link");
    if (!titleEl || !linkEl) return false;
    setInputValue(titleEl, title || "");
    setInputValue(linkEl, imdbId || "");
    const submit = document.querySelector("#contentRequestModal .ui.blue.submit.button") || document.querySelector(".ui.blue.submit.button");
    if (submit) submit.click();
    return true;
  }

  (function handleRequestHash() {
    const m = location.hash.match(/zororo-request=([^&]+)/);
    if (!m) return;
    try {
      const { title, imdbId } = JSON.parse(decodeURIComponent(m[1]));
      history.replaceState(null, "", location.pathname + location.search);
      doContentRequest(title, imdbId);
    } catch { }
  })();
})();
