<picture>
  <source media="(prefers-color-scheme: dark)" srcset="icons/icon128.png">
  <img alt="Zororo" src="icons/icon48.png" width="128" align="left">
</picture>

# ororo

**One-click downloader for [ororo.tv](https://ororo.tv) shows and movies.**

Automatically organizes episodes by season, skips already-downloaded files, lets
you rate your watched content, comment translation, and supports 9 languages.

[![MIT License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.10.0-blue)](https://github.com/perplexedpigmy/zororo-extension)
[![Firefox](https://img.shields.io/badge/firefox-addon-orange)](https://addons.mozilla.org/en-US/firefox/addon/zororo/)
[![Chrome](https://img.shields.io/badge/chrome-web__store-4285F4)](https://chromewebstore.google.com/detail/zororo/ibcmhfcmkmllpimlpplbmopfjollmecf)

---

## Features

- **One-click downloads** — Downloads the current show or movie with a single
  click.
- **Smart skip** — Detects files already on disk, never duplicates.
- **Auto-organized folders** — Saves as
  `<Root>/<Show Name>/s<NN>/<NN>.<Episode Name>.mp4`.
- **Batch queue** — Select multiple seasons, download them all at once.
- **Missing episode detection** — Greyed-out episodes with an amber "N missing"
  badge for incomplete seasons.
- **Star rating system** — Click a star to rate, click again to remove.
  Auto-saves instantly (no save button).
- **Subtitle selection** — Choose which languages to download; default language
  gets a bare `.srt`, others get `.<lang>.srt`.
- **Translation (optional)** — Translate comments, show descriptions, and episode plots to your UI language. Each can be disabled in Options.
- **Minimizable panel** — Click × to collapse the panel to a small icon in the
  top-right corner; click it to restore.
- **In-app feedback** — Submit bug reports and feature requests directly from
  the support modal (powered by Formspree).
- **9-language UI** — Detected from ororo.tv URL prefix: English, French,
  German, Spanish, Portuguese, Russian, Italian, Polish, Turkish.
- **Cross-browser** — Works on Firefox, Chrome, Brave, and Edge.

---

## Installation

### Firefox

[Install from Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/zororo/)

### Chrome / Brave / Edge

[Install from Chrome Web Store](https://chromewebstore.google.com/detail/zororo/ibcmhfcmkmllpimlpplbmopfjollmecf)

### Manual (developer mode)

1. Clone this repo.
2. **Firefox**: `just build-firefox` → load `zororo-firefox.zip` in
   `about:addons` → gear icon → Install Add-on From File.
3. **Chrome**: `just build-chrome` → open `chrome://extensions` → Enable
   Developer Mode → Load unpacked → select the `extension/` folder.

---

## Usage

1. Go to any show or movie page on **ororo.tv**.
2. A panel appears on the right with:
   - **Star rating** — click to rate (auto-saves to "Rated" list).
   - **Season tabs** — browse episodes, see which are missing.
   - **Download Selected** — queues selected episodes for download.
   - **Minimize** — click × to collapse the panel to an icon; click it to
     restore.
3. Files are saved to your configured root directory.
4. **Translate** — click "Translate" on any comment, description, or episode plot.
5. **Submit feedback** — open the support modal (heart icon), then click
   "Feature Request / Bug Report".

---

## Configuration

Right-click the extension icon → **Options** (or `about:addons` → Zororo →
Preferences on Firefox).

| Setting                | Description                                                     |
| ---------------------- | --------------------------------------------------------------- |
| **Root directory**     | Base folder for all downloads (e.g. `OroroTV/`).                |
| **Theme**              | `Light` (default) or `Dark`, applied to ororo.tv and the panel. |
| **Subtitle languages** | Comma-separated language codes to download (e.g. `en, fr, de`). |
| **Default subtitle**   | The language that gets the bare filename (no language suffix).  |
| **Translate comments** | Show Translate links on comments.                               |
| **Translate description** | Show Translate link on show/movie description.              |
| **Translate episodes** | Show Translate link on episode plot text.                       |

You can also **export / import your rated list** as JSON from the options page.

---

## Localization

Zororo automatically detects your language from the ororo.tv URL path prefix:

| Prefix | Language   |
| ------ | ---------- |
| `/en/` | English    |
| `/fr/` | French     |
| `/de/` | German     |
| `/es/` | Spanish    |
| `/pt/` | Portuguese |
| `/ru/` | Russian    |
| `/it/` | Italian    |
| `/pl/` | Polish     |
| `/tr/` | Turkish    |

The popup and options pages are always in English.

---

## Support

If you find this app useful, consider supporting its development:

[![Ko-fi](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?logo=buymeacoffee&logoColor=black)](https://ko-fi.com/pipolarbear)

<details>
<summary><b>Cryptocurrency</b></summary>

|                                                       | Address                                        | QR                                               |
| ----------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------ |
| <img src=".github/images/btc.svg" width="20"> **BTC** | `bc1qgyffnlhp2uz2uhpmhfrspc5qxpj3y9m4lwgga5`   | <img src=".github/images/btc-qr.png" width="64"> |
| <img src=".github/images/eth.svg" width="20"> **ETH** | `0x581b4810873698505FDF3aAf0a39430bb0D7d655`   | <img src=".github/images/eth-qr.png" width="64"> |
| <img src=".github/images/sol.svg" width="20"> **SOL** | `6awadeXmfc7JUMQL5SEgZXDE4yaFDgWkPNRySLDDmh7E` | <img src=".github/images/sol-qr.png" width="64"> |

</details>

---

## Privacy

Zororo runs entirely on ororo.tv. **No data is collected, no analytics, no
tracking.** All settings, ratings, and download history are stored locally in
your browser's `chrome.storage.local`. External requests are made only for
user-initiated actions:

| Service                    | Purpose                                      | Triggered by                                             |
| -------------------------- | -------------------------------------------- | -------------------------------------------------------- |
| `api.qrserver.com`         | Render QR code for crypto donation addresses | Clicking a crypto pill in the support modal              |
| `translate.googleapis.com` | Translate comments via Google Translate      | Clicking "Translate" on a comment                        |
| `formspree.io`             | Submit bug reports / feature requests        | Submitting the feedback form in the support modal        |
| `buymeacoffee.com`         | Donation link                                | Clicking the Buy Me a Coffee button in the support modal |

---

## License

MIT
