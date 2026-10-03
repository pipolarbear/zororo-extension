(() => {
  const KEY = "zororoTheme";

  let theme = "light";
  try {
    const cached = localStorage.getItem(KEY);
    if (cached === "dark" || cached === "light") theme = cached;
  } catch { }

  function setAttr() {
    if (document.documentElement) {
      document.documentElement.setAttribute("data-zororo-theme", theme);
      return true;
    }
    return false;
  }

  if (!setAttr()) {
    const obs = new MutationObserver(() => {
      if (setAttr()) obs.disconnect();
    });
    obs.observe(document, { childList: true, subtree: true });
  }

  try {
    chrome.storage.sync.get({ theme: "light" }, (data) => {
      const next = data && data.theme === "dark" ? "dark" : "light";
      if (next !== theme) {
        theme = next;
        setAttr();
      }
      try {
        localStorage.setItem(KEY, theme);
      } catch { }
    });
  } catch { }
})();
