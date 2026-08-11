const WATCHED_KEY = "watched";
let activeTab = "queue";

function buildStars(row, rating) {
  for (let i = 1; i <= 5; i++) {
    const full = rating >= i;
    const half = !full && rating >= i - 0.5;
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
    row.appendChild(s);
  }
}

async function init() {
  const tabQueue = document.getElementById("tab-queue");
  const tabWatched = document.getElementById("tab-watched");

  document.querySelectorAll(".tabs button").forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll(".tabs button").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach((t) => t.classList.remove("active"));
      btn.classList.add("active");
      activeTab = btn.dataset.tab;
      document.getElementById("tab-" + activeTab).classList.add("active");
      if (activeTab === "watched") renderWatched();
    };
  });

  tabQueue.classList.add("active");
  render();
  setInterval(render, 2000);
}

function createItemElement(item) {
  const seasonStr = "s" + String(item.season).padStart(2, "0");
  const epStr = item.episodeNum + ". " + item.episodeName;

  const div = document.createElement("div");
  div.className = "item";

  const info = document.createElement("div");
  info.className = "info";

  const name = document.createElement("div");
  name.className = "name";
  name.textContent = seasonStr + " \u00b7 " + epStr;

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = item.showName;

  info.appendChild(name);
  info.appendChild(meta);

  const badge = document.createElement("span");
  badge.className = "status-badge status-" + item.status;
  badge.textContent = item.status;

  div.appendChild(info);
  div.appendChild(badge);
  return div;
}

async function render() {
  const resp = await chrome.runtime.sendMessage({ type: "get-queue" });
  const queue = resp?.queue || [];
  const listEl = document.getElementById("list");
  const summaryEl = document.getElementById("summary");
  const cancelBtn = document.getElementById("cancel-all");
  const cleanBtn = document.getElementById("clean-all");

  listEl.replaceChildren();

  if (queue.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.appendChild(document.createTextNode("No active downloads."));
    empty.appendChild(document.createElement("br"));
    empty.appendChild(document.createTextNode("Open a show on ororo.tv to start."));
    listEl.appendChild(empty);
    summaryEl.textContent = "";
    cancelBtn.style.display = "none";
    cleanBtn.style.display = "none";
    return;
  }

  const counts = { queued: 0, downloading: 0, completed: 0, failed: 0, cancelled: 0 };
  for (const item of queue) counts[item.status]++;

  summaryEl.textContent =
    counts.completed + " done \u00b7 " + counts.downloading +
    " downloading \u00b7 " + counts.queued + " queued \u00b7 " + counts.failed + " failed";

  cancelBtn.style.display = counts.queued > 0 ? "block" : "none";
  cleanBtn.style.display = counts.completed + counts.failed + counts.cancelled > 0 ? "block" : "none";

  const statusOrder = { downloading: 0, queued: 1, completed: 2, cancelled: 3, failed: 4 };
  const items = [...queue].sort((a, b) => {
    const sa = statusOrder[a.status] ?? 99;
    const sb = statusOrder[b.status] ?? 99;
    if (sa !== sb) return sa - sb;
    return a.id - b.id;
  });

  const fragment = document.createDocumentFragment();
  for (const item of items) {
    fragment.appendChild(createItemElement(item));
  }
  listEl.appendChild(fragment);
}

async function renderWatched() {
  const data = await chrome.storage.local.get(WATCHED_KEY);
  const watched = data[WATCHED_KEY] || [];
  const listEl = document.getElementById("watched-list");
  listEl.replaceChildren();

  if (watched.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.appendChild(document.createTextNode("No rated items yet."));
    empty.appendChild(document.createElement("br"));
    empty.appendChild(document.createTextNode("Rate a show or movie to see it here."));
    listEl.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  const sorted = watched.slice().reverse();

  for (const item of sorted) {
    const div = document.createElement("div");
    div.className = "item watched-item";

    const badge = document.createElement("span");
    badge.className = "type-badge type-" + item.type;
    badge.textContent = item.type;

    const info = document.createElement("div");
    info.className = "info";

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = item.title;

    const date = document.createElement("div");
    date.className = "watched-date";
    date.textContent = new Date(item.dateWatched).toLocaleDateString();

    info.appendChild(name);
    info.appendChild(date);

    const stars = document.createElement("span");
    stars.className = "stars";
    buildStars(stars, item.rating || 0);

    const link = document.createElement("a");
    link.className = "watched-link";
    link.href = "https://ororo.tv" + (item.url || "/en/" + item.type + "s/" + (item.slug || ""));
    link.target = "_blank";
    link.rel = "noopener";
    link.appendChild(badge);
    link.appendChild(info);
    link.appendChild(stars);

    const delBtn = document.createElement("button");
    delBtn.className = "del-btn";
    delBtn.textContent = "\u2715";
    delBtn.onclick = async () => {
      const watched2 = (await chrome.storage.local.get(WATCHED_KEY))[WATCHED_KEY] || [];
      const filtered = watched2.filter((w) => w.id !== item.id);
      await chrome.storage.local.set({ [WATCHED_KEY]: filtered });
      renderWatched();
    };

    div.appendChild(link);
    div.appendChild(delBtn);
    fragment.appendChild(div);
  }

  listEl.appendChild(fragment);
}

document.getElementById("cancel-all").onclick = async () => {
  await chrome.runtime.sendMessage({ type: "cancel-all" });
  render();
};

document.getElementById("clean-all").onclick = async () => {
  await chrome.runtime.sendMessage({ type: "clean-all" });
  render();
};

document.getElementById("open-options").onclick = () => {
  chrome.runtime.openOptionsPage();
};

init();
