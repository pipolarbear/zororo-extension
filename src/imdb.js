(() => {
  const PANEL_STATE_KEY = "zororoImdbPanelState";
  const RATE_URL = "@RATE_URL@";
  const m = window.location.pathname.match(/\/title\/(tt\d+)/);
  if (!m) return;
  const imdbId = m[1];
  const lang = window.ZororoI18n.detectLang();
  const t = (key, params) => window.ZororoI18n.t(lang, key, params);

  let title = null;
  let year = null;
  let type = null;

  try {
    const ld = JSON.parse(document.querySelector('script[type="application/ld+json"]')?.textContent || "{}");
    const t = Array.isArray(ld["@type"]) ? ld["@type"][0] : ld["@type"];
    if (t) {
      if (/TVSeries|TVMiniSeries|TVEpisode/i.test(t)) type = "show";
      else if (/Movie/i.test(t)) type = "movie";
    }
    title = ld.name || null;
  } catch { }

  if (!title) {
    const h1 = document.querySelector("h1");
    title = h1 ? h1.textContent.trim() : document.title.replace(/\s*-\s*IMDb.*/, "").replace(/\s*\(.*$/, "");
  }
  const rel = document.querySelector('a[href*="releaseinfo"]');
  if (rel) year = rel.textContent.trim();
  if (!type) {
    type = /tv_show/i.test(document.querySelector('meta[property="og:type"]')?.content || "") ? "show" : "movie";
  }

  const panel = document.createElement("div");
  panel.id = "ororo-dl-panel";

  const titleRow = document.createElement("div");
  titleRow.className = "title-row";

  const titleEl = document.createElement("h2");
  titleEl.id = "ororo-dl-title";
  titleEl.textContent = title || "Zororo";
  titleRow.appendChild(titleEl);

  const gear = document.createElement("button");
  gear.id = "ororo-dl-settings-btn";
  gear.className = "btn-settings";
  gear.type = "button";
  gear.textContent = "\u2699";
  gear.title = t("imdbSettings");
  gear.setAttribute("aria-label", t("imdbSettings"));
  gear.onclick = (e) => { e.stopPropagation(); chrome.runtime.sendMessage({ type: "open-options" }); };
  titleRow.appendChild(gear);

  const closeBtn = document.createElement("button");
  closeBtn.className = "close-btn";
  closeBtn.type = "button";
  closeBtn.textContent = "\u00d7";
  closeBtn.title = t("imdbCollapse");
  titleRow.appendChild(closeBtn);
  panel.appendChild(titleRow);

  const subRow = document.createElement("div");
  subRow.className = "subtitle-row";
  const subEl = document.createElement("p");
  subEl.className = "subtitle";
  subEl.id = "ororo-dl-subtitle";
  subEl.textContent = [type === "show" ? t("imdbTvSeries") : t("imdbMovie"), year].filter(Boolean).join(" \u00b7 ");
  subRow.appendChild(subEl);
  panel.appendChild(subRow);

  const body = document.createElement("div");
  body.id = "ororo-dl-body";
  panel.appendChild(body);

  const footer = document.createElement("div");
  footer.className = "panel-footer";

  const supportBtn = document.createElement("button");
  supportBtn.id = "ororo-dl-donate-btn";
  supportBtn.className = "donate-btn";
  supportBtn.type = "button";
  supportBtn.textContent = "\u2764\ufe0f " + t("support");
  supportBtn.onclick = (e) => { e.stopPropagation(); window.ZororoDonate.open(panel); };
  footer.appendChild(supportBtn);

  const reviewBtn = document.createElement("button");
  reviewBtn.id = "ororo-dl-review-btn";
  reviewBtn.className = "review-btn";
  reviewBtn.type = "button";
  reviewBtn.textContent = "\u2605 " + t("reviewUs");
  reviewBtn.onclick = (e) => { e.stopPropagation(); window.open(RATE_URL, "_blank"); };
  footer.appendChild(reviewBtn);

  panel.appendChild(footer);

  const collapseIcon = document.createElement("img");
  collapseIcon.className = "ororo-collapse-icon";
  collapseIcon.src = chrome.runtime.getURL("icons/zoro.png");
  collapseIcon.alt = "Zororo";
  panel.appendChild(collapseIcon);

  document.body.appendChild(panel);

  if (window.ZororoDonate) window.ZororoDonate.build(panel, { t });

  function setCollapsedScale(size) {
    const n = Number(size);
    const scale = n >= 25 && n <= 100 ? n / 100 : 1;
    panel.style.setProperty("--zoro-collapsed-scale", String(scale));
  }
  chrome.storage.sync.get({ collapsedSizeImdb: 100 }, (cfg) => setCollapsedScale(cfg.collapsedSizeImdb));
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" && changes.collapsedSizeImdb) setCollapsedScale(changes.collapsedSizeImdb.newValue);
    });
  } catch { }

  const state = document.createElement("p");
  state.className = "imdb-state";
  state.textContent = t("imdbChecking");
  body.appendChild(state);

  function actionLink(cls, text, href) {
    const a = document.createElement("a");
    a.className = "imdb-action " + cls;
    a.textContent = text;
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener";
    return a;
  }

  function starEl(full, half) {
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

  function starRow(rating) {
    const row = document.createElement("span");
    row.className = "ororo-star-row";
    for (let i = 1; i <= 5; i++) {
      row.appendChild(starEl(rating >= i, !(rating >= i) && rating >= i - 0.5));
    }
    return row;
  }

  function ratingRow(rating) {
    const wrap = document.createElement("div");
    wrap.className = "imdb-rating";
    const label = document.createElement("span");
    label.className = "imdb-rating-label";
    label.textContent = t("imdbYourRating");
    wrap.appendChild(label);
    wrap.appendChild(starRow(rating));
    return wrap;
  }

  function relDays(ts) {
    if (!ts) return "";
    const a = new Date(ts);
    const b = new Date();
    const dayA = Math.floor(Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) / 86400000);
    const dayB = Math.floor(Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) / 86400000);
    const d = dayB - dayA;
    if (d <= 0) return t("imdbToday");
    if (d === 1) return t("imdbYesterday");
    return t("imdbDaysAgo", { n: d });
  }

  function renderRequested(ts) {
    state.textContent = t("imdbRequested");
    const btn = body.querySelector(".imdb-request");
    if (btn) btn.remove();
    let stamp = panel.querySelector(".imdb-stamp");
    if (!stamp) {
      stamp = document.createElement("div");
      stamp.className = "imdb-stamp";
      const s = document.createElement("span");
      s.textContent = t("imdbStamp");
      const age = document.createElement("em");
      age.className = "imdb-stamp-age";
      s.appendChild(age);
      stamp.appendChild(s);
      panel.appendChild(stamp);
    }
    const ageEl = stamp.querySelector(".imdb-stamp-age");
    const rel = relDays(ts || Date.now());
    if (ageEl) {
      ageEl.textContent = rel;
      ageEl.style.display = rel ? "block" : "none";
    }
  }

  chrome.runtime.sendMessage({ type: "check-ororo", imdbId }, (resp) => {
    if (chrome.runtime.lastError || !resp) {
      state.textContent = t("imdbUnreachable");
      return;
    }
    if (!resp.loggedIn) {
      state.textContent = t("imdbNotLoggedIn");
      body.appendChild(actionLink("imdb-login", t("imdbLogin"), "https://ororo.tv/en"));
      return;
    }
    if (resp.found) {
      state.textContent = t("imdbAvailable");
      if (resp.rating > 0) body.appendChild(ratingRow(resp.rating));
      const href = "https://ororo.tv/en/" + (resp.type === "movie" ? "movies/" : "shows/") + resp.slug;
      body.appendChild(actionLink("imdb-open", t("imdbOpen"), href));
      return;
    }
    if (resp.requested) {
      renderRequested(resp.requestedAt);
      return;
    }
    state.textContent = t("imdbNotAvailable");
    const btn = document.createElement("button");
    btn.className = "imdb-action imdb-request";
    btn.type = "button";
    btn.textContent = t("imdbRequest");
    btn.onclick = () => {
      btn.disabled = true;
      btn.textContent = t("imdbRequesting");
      chrome.runtime.sendMessage({ type: "request-content", title, imdbId }, (r) => {
        if (r && r.ok) {
          renderRequested(Date.now());
        } else {
          btn.disabled = false;
          btn.textContent = t("imdbRequest");
          state.textContent = t("imdbRequestFailed");
        }
      });
    };
    body.appendChild(btn);
  });

  // ====== Collapse / expand ======

  const setState = (s) => chrome.storage.local.set({ [PANEL_STATE_KEY]: s });

  closeBtn.onclick = (e) => {
    e.stopPropagation();
    panel.classList.toggle("collapsed");
    setState(panel.classList.contains("collapsed") ? "collapsed" : "expanded");
  };
  panel.onclick = () => {
    if (panel.classList.contains("collapsed")) {
      panel.classList.remove("collapsed");
      setState("expanded");
    }
  };

  chrome.storage.local.get(PANEL_STATE_KEY, (d) => {
    if (d[PANEL_STATE_KEY] === "collapsed") panel.classList.add("collapsed");
  });

  // Panel behavior: outside click/double-click gestures (shared settings).
  chrome.storage.sync.get(
    { closePanelOnClickOutside: true, minimizeGesture: "dblclick", maximizeGesture: "dblclick" },
    (cfg) => {
      if (cfg.closePanelOnClickOutside === false) return;
      const isActionable = (el, root) => {
        while (el && el !== root) {
          const tag = el.tagName;
          if (tag === "A" || tag === "BUTTON" || tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || tag === "LABEL") return true;
          if (el.onclick || el.getAttribute("role") === "button" || el.hasAttribute("tabindex")) return true;
          el = el.parentElement;
        }
        return false;
      };
      const handleOutside = (e, gesture) => {
        if (isActionable(e.target, panel)) return;
        if (panel.contains(e.target)) return;
        if (panel.classList.contains("collapsed")) {
          if (cfg.maximizeGesture === gesture) {
            panel.classList.remove("collapsed");
            setState("expanded");
          }
        } else if (cfg.minimizeGesture === gesture) {
          panel.classList.add("collapsed");
          setState("collapsed");
        }
      };
      document.addEventListener("click", (e) => handleOutside(e, "click"), true);
      document.addEventListener("dblclick", (e) => handleOutside(e, "dblclick"), true);
    }
  );
})();
