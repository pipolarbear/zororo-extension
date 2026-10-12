(() => {
  const DEFAULTS = {
    back: "Back",
    donateHead: "Enjoying Zororo? Your support keeps it alive \u2764\ufe0f",
    feedback: "Report a bug / Suggest",
    feedbackTitle: "Bug: ... / Feature: ...",
    feedbackDesc: "Describe what happened or what you'd like to see...",
    feedbackSubmit: "Send",
    feedbackSuccess: "Thank you! Sent successfully.",
    feedbackRequired: "Please fill in both fields.",
    feedbackFail: "Sending failed. Try again or email us directly.",
    feedbackNetError: "Network error. Try again.",
    loading: "Loading...",
  };

  let panel = null;
  let userT = null;

  function t(key) {
    const v = userT ? userT(key) : null;
    return (v && v !== key) ? v : (DEFAULTS[key] || key);
  }

  function createCoinSvg(coin) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", coin.viewBox);
    for (const el of coin.elements) {
      const child = document.createElementNS("http://www.w3.org/2000/svg", el.tag);
      for (const [key, val] of Object.entries(el.attrs)) {
        child.setAttribute(key, val);
      }
      svg.appendChild(child);
    }
    return svg;
  }

  const COINS = [
    {
      id: "btc", name: "BTC",
      viewBox: "0 0 4091.27 4091.73",
      elements: [{ tag: "path", attrs: { fill: "#fff", d: "M2947.77 1754.38c40.72,-272.26 -166.56,-418.61 -450,-516.24l91.95 -368.8 -224.5 -55.94 -89.51 359.09c-59.02,-14.72 -119.63,-28.59 -179.87,-42.34l90.16 -361.46 -224.36 -55.94 -92 368.68c-48.84,-11.12 -96.81,-22.11 -143.35,-33.69l0.26 -1.16 -309.59 -77.31 -59.72 239.78c0,0 166.56,38.18 163.05,40.53 90.91,22.69 107.35,82.87 104.62,130.57l-104.74 420.15c6.26,1.59 14.38,3.89 23.34,7.49 -7.49,-1.86 -15.46,-3.89 -23.73,-5.87l-146.81 588.57c-11.11,27.62 -39.31,69.07 -102.87,53.33 2.25,3.26 -163.17,-40.72 -163.17,-40.72l-111.46 256.98 292.15 72.83c54.35,13.63 107.61,27.89 160.06,41.3l-92.9 373.03 224.24 55.94 92 -369.07c61.26,16.63 120.71,31.97 178.91,46.43l-91.69 367.33 224.51 55.94 92.89 -372.33c382.82,72.45 670.67,43.24 791.83,-303.02 97.63,-278.78 -4.86,-439.58 -206.26,-544.44 146.69,-33.83 257.18,-130.31 286.64,-329.61l-0.07 -0.05zm-512.93 719.26c-69.38,278.78 -538.76,128.08 -690.94,90.29l123.28 -494.2c152.17,37.99 640.17,113.17 567.67,403.91zm69.43 -723.3c-63.29,253.58 -453.96,124.75 -580.69,93.16l111.77 -448.21c126.73,31.59 534.85,90.55 468.94,355.05l-0.02 0z" } }],
      color: "#f7931a", address: "bc1qgyffnlhp2uz2uhpmhfrspc5qxpj3y9m4lwgga5"
    },
    {
      id: "eth", name: "ETH",
      viewBox: "0 0 784.37 1277.39",
      elements: [
        { tag: "polygon", attrs: { fill: "#fff", points: "392.07,0 383.5,29.11 383.5,873.74 392.07,882.29 784.13,650.54" } },
        { tag: "polygon", attrs: { fill: "#fff", points: "392.07,0 -0,650.54 392.07,882.29 392.07,472.33" } },
        { tag: "polygon", attrs: { fill: "#fff", points: "392.07,956.52 387.24,962.41 387.24,1263.28 392.07,1277.38 784.37,724.89" } },
        { tag: "polygon", attrs: { fill: "#fff", points: "392.07,1277.38 392.07,956.52 -0,724.89" } },
        { tag: "polygon", attrs: { fill: "#fff", points: "392.07,882.29 784.13,650.54 392.07,472.33" } },
        { tag: "polygon", attrs: { fill: "#fff", points: "0,650.54 392.07,882.29 392.07,472.33" } },
      ],
      color: "#627eea", address: "0x581b4810873698505FDF3aAf0a39430bb0D7d655"
    },
    {
      id: "sol", name: "SOL",
      viewBox: "0 0 397.7 311.7",
      elements: [
        { tag: "path", attrs: { fill: "#fff", d: "M64.6,237.9c2.4-2.4,5.7-3.8,9.2-3.8h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,237.9z" } },
        { tag: "path", attrs: { fill: "#fff", d: "M64.6,3.8C67.1,1.4,70.4,0,73.8,0h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,3.8z" } },
        { tag: "path", attrs: { fill: "#fff", d: "M333.1,120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8,0-8.7,7-4.6,11.1l62.7,62.7c2.4,2.4,5.7,3.8,9.2,3.8h317.4c5.8,0,8.7-7,4.6-11.1L333.1,120.1z" } },
      ],
      color: "#9945ff", address: "6awadeXmfc7JUMQL5SEgZXDE4yaFDgWkPNRySLDDmh7E"
    },
  ];

  function buildDonateModal() {
    const modal = panel.querySelector("#ororo-dl-donate-modal");
    modal.replaceChildren();

    const backBtn = document.createElement("button");
    backBtn.className = "donate-back";
    backBtn.textContent = "\u2190 " + t("back");
    backBtn.onclick = () => { modal.closest("#ororo-dl-panel").classList.remove("donate-open"); };
    modal.appendChild(backBtn);

    const h = document.createElement("h3");
    h.className = "donate-heading";
    h.textContent = t("donateHead");
    modal.appendChild(h);

    const coffee = document.createElement("div");
    coffee.className = "donate-section";
    const cl = document.createElement("a");
    cl.href = "https://www.buymeacoffee.com/pipolarbear";
    cl.target = "_blank";
    cl.className = "coffee-btn";
    cl.textContent = "\u2615 Buy me a coffee";
    coffee.appendChild(cl);
    modal.appendChild(coffee);

    const crypto = document.createElement("div");
    crypto.className = "donate-section";
    const crt = document.createElement("h4");
    crt.className = "donate-section-title";
    crt.textContent = "Cryptocurrency";
    crypto.appendChild(crt);

    const grid = document.createElement("div");
    grid.className = "crypto-grid";

    for (const coin of COINS) {
      const card = document.createElement("div");
      card.className = "crypto-card";
      const fc = document.createElement("div");
      fc.className = "coin-circle";
      fc.style.background = coin.color;
      fc.appendChild(createCoinSvg(coin));
      card.appendChild(fc);
      const fl = document.createElement("span");
      fl.className = "coin-label";
      fl.textContent = coin.name;
      card.appendChild(fl);
      card.onclick = () => showCryptoOverlay(coin);
      grid.appendChild(card);
    }

    crypto.appendChild(grid);
    modal.appendChild(crypto);

    const feedbackBtn = document.createElement("button");
    feedbackBtn.className = "donate-back";
    feedbackBtn.textContent = "\ud83d\udcac " + t("feedback");
    feedbackBtn.style.cssText = "margin-top:16px;width:100%;padding:8px;background:#2d2d4e;color:#ccc;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;";
    feedbackBtn.onclick = () => showFeedbackForm(modal);
    modal.appendChild(feedbackBtn);
  }

  function showFeedbackForm(modal) {
    modal.replaceChildren();

    const backBtn = document.createElement("button");
    backBtn.className = "donate-back";
    backBtn.textContent = "\u2190 " + t("back");
    backBtn.onclick = buildDonateModal;
    modal.appendChild(backBtn);

    const heading = document.createElement("h3");
    heading.className = "donate-heading";
    heading.textContent = "\ud83d\udcac " + t("feedback");
    modal.appendChild(heading);

    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.className = "ororo-feedback-input";
    titleInput.placeholder = t("feedbackTitle");
    modal.appendChild(titleInput);

    const descTextarea = document.createElement("textarea");
    descTextarea.className = "ororo-feedback-textarea";
    descTextarea.placeholder = t("feedbackDesc");
    descTextarea.rows = 5;
    modal.appendChild(descTextarea);

    const statusMsg = document.createElement("div");
    statusMsg.className = "status-bar";
    modal.appendChild(statusMsg);

    const submitBtn = document.createElement("button");
    submitBtn.className = "btn-download";
    submitBtn.textContent = "\ud83d\udce7 " + t("feedbackSubmit");
    submitBtn.onclick = async () => {
      if (!titleInput.value.trim() || !descTextarea.value.trim()) {
        statusMsg.textContent = t("feedbackRequired");
        statusMsg.classList.add("visible");
        return;
      }
      submitBtn.disabled = true;
      statusMsg.textContent = t("loading");
      statusMsg.classList.add("visible");
      try {
        const resp = await fetch("https://formspree.io/f/mqevrbko", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: titleInput.value,
            description: descTextarea.value,
            page: window.location.href,
          }),
        });
        if (resp.ok) {
          titleInput.value = "";
          descTextarea.value = "";
          statusMsg.textContent = "\u2705 " + t("feedbackSuccess");
        } else {
          statusMsg.textContent = "\u274c " + t("feedbackFail");
        }
      } catch {
        statusMsg.textContent = "\u274c " + t("feedbackNetError");
      }
      submitBtn.disabled = false;
    };
    const actionRow = document.createElement("div");
    actionRow.style.cssText = "display:flex;align-items:center;gap:8px;";
    submitBtn.style.flex = "1";
    actionRow.appendChild(submitBtn);

    const ghLink = document.createElement("a");
    ghLink.href = "https://github.com/perplexedpigmy/zororo-extension";
    ghLink.target = "_blank";
    ghLink.className = "ororo-gh-link";
    ghLink.title = "GitHub";
    ghLink.innerHTML = '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>';
    actionRow.appendChild(ghLink);

    modal.appendChild(actionRow);
  }

  function showCryptoOverlay(coin) {
    const overlay = document.createElement("div");
    overlay.id = "ororo-crypto-overlay";

    const modal = document.createElement("div");
    modal.className = "crypto-modal";

    const closeBtn = document.createElement("button");
    closeBtn.className = "crypto-modal-close";
    closeBtn.textContent = "\u2715";
    closeBtn.onclick = () => overlay.remove();
    modal.appendChild(closeBtn);

    const heading = document.createElement("div");
    heading.className = "crypto-modal-heading";
    const hc = document.createElement("span");
    hc.className = "coin-circle";
    hc.style.background = coin.color;
    hc.appendChild(createCoinSvg(coin));
    heading.appendChild(hc);
    const hl = document.createElement("span");
    hl.textContent = coin.name;
    heading.appendChild(hl);
    modal.appendChild(heading);

    const qr = document.createElement("img");
    qr.className = "crypto-modal-qr";
    qr.src = "https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=" + encodeURIComponent(coin.address);
    qr.alt = "QR Code";
    modal.appendChild(qr);

    const addrLine = document.createElement("div");
    addrLine.className = "crypto-addr-line";

    const addrText = document.createElement("span");
    addrText.className = "crypto-addr";
    addrText.textContent = coin.address;

    const copyIcon = document.createElement("span");
    copyIcon.className = "crypto-copy-icon";
    copyIcon.textContent = "\ud83d\udccb";

    function copyAddr() {
      navigator.clipboard.writeText(coin.address).then(() => {
        const text = addrText.textContent;
        addrText.textContent = "\u2705 Copied";
        addrText.classList.add("copied");
        copyIcon.textContent = "\u2705";
        setTimeout(() => {
          addrText.textContent = text;
          addrText.classList.remove("copied");
          copyIcon.textContent = "\ud83d\udccb";
        }, 2000);
      }).catch(() => { });
    }

    addrText.onclick = copyAddr;
    copyIcon.onclick = (e) => { e.stopPropagation(); copyAddr(); };

    addrLine.appendChild(addrText);
    addrLine.appendChild(copyIcon);
    modal.appendChild(addrLine);

    overlay.appendChild(modal);

    overlay.onclick = (e) => {
      if (e.target === overlay) overlay.remove();
    };

    function escHandler(e) {
      if (e.key === "Escape" && document.body.contains(overlay)) overlay.remove();
    }
    document.addEventListener("keydown", escHandler);

    overlay._cleanup = () => document.removeEventListener("keydown", escHandler);
    overlay.addEventListener("remove", () => overlay._cleanup(), { once: true });

    document.body.appendChild(overlay);
  }

  function build(p, opts) {
    panel = p;
    userT = opts && typeof opts.t === "function" ? opts.t : null;
    let modal = panel.querySelector("#ororo-dl-donate-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "ororo-dl-donate-modal";
      modal.className = "donate-modal";
      panel.appendChild(modal);
    }
    buildDonateModal();
  }

  function open(p) {
    (p || panel).classList.add("donate-open");
  }

  window.ZororoDonate = { build, open };
})();
