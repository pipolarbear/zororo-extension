# Privacy Policy for Zororo

**Last updated:** October 2026

Zororo is a browser extension that downloads shows and movies from ororo.tv and, on imdb.com, shows whether a title is available on ororo or lets you request it. This privacy policy explains what data the extension collects, how it is used, and your rights.

## Data Collection

**Zororo does not collect personal data.** The extension operates entirely within your browser, except for the optional **anonymous usage statistics** described below (Chrome build only), which you can turn off at any time.

### What is stored

Nothing is stored off your device. Preferences live in `chrome.storage.sync`
(your browser may sync these across your signed-in devices); operational data
lives in `chrome.storage.local`.

**Preferences** (`chrome.storage.sync`)

| Data | Purpose |
|---|---|
| **Root directory** | Where downloaded files are saved on your computer |
| **Subtitle language preferences** | Which subtitle tracks to download |
| **Translation toggles** | Whether to show Translate links for comments/descriptions/plots |
| **Season rating toggle** | Whether to rate each completed season |
| **Theme** | Your Light/Dark preference |
| **Panel behavior** | Minimize/maximize gestures |
| **Collapsed panel size** | Panel size per site (ororo / IMDb) when minimized |
| **Anonymous usage stats** | Whether to send the anonymous statistics described below |

**Local data** (`chrome.storage.local`)

| Data | Purpose |
|---|---|
| **Rating history** | Your personal star ratings for shows/movies on ororo.tv |
| **Download queue** | Temporary tracking of queued downloads |
| **Panel state** | Whether the panel is collapsed |
| **Content requests** | Titles you requested from the IMDb panel (title + date) |
| **Catalog cache** | A temporary cached list of ororo titles, used to check availability |
| **Telemetry salt** | A random local secret used to derive the rotating anonymous id (never transmitted) |
| **Custom panel icon** | An optional image or URL you choose for the collapsed panel, stored only on this device |

### Anonymous usage statistics (Chrome only)

To understand which features are used, the **Chrome** build sends anonymous
usage events to a small telemetry endpoint operated by the developer (a
Cloudflare Worker backed by a Cloudflare D1 database). This is **not** included
in the Firefox build, and you can turn it off in the options page
(**Anonymous usage stats**).

What is sent, and when:

- **Events:** extension install/update and a daily "active" ping; content requests
  (title, IMDb id, and media type); downloads started, completed, failed or
  cancelled (title, media type, episode count, season number or list, and — on
  completion or failure — a duration and an error *category*); **ratings**
  (title, content id, media type, season number, the star value, and the
  previous value); settings changes (the
  setting name and its new value); feature interactions: translate and IMDb/RT
  links (title, media type; add IMDb id for IMDb links), the IMDb→ororo link and
  login prompt (title, media type, IMDb id), and support, review, feedback,
  crypto, the Rated tab and its sort/remove, and import/export (no content
  details); panel collapse/expand; review-prompt actions; and error categories
  (auth, free-limit, not-found, API) with the page title and media type; plus a
  one-time event when you disable this.
- **Identifier:** a **rotating** anonymous id. A random secret is generated and
  stored only on your device; the id sent is an HMAC of that secret with the
  ISO week in which the event happened. Events in the same week share an id (so
  usage can be counted per user), but **the id changes every week and cannot be
  linked across weeks**. It is never derived from your account or any personal
  data.
- **Technical fields:** a random id per event, a random id per browser session,
  the number of days since install, the extension version, and a build channel
  marker. The receiving endpoint also records its own receipt timestamp.
- **Notably NOT sent:** your name, email, or ororo account; your IP is not a
  field we send, though the receiving endpoint (Cloudflare) necessarily sees the
  connection like any web request. Free-text values (e.g. your download folder
  name) are **not** sent — only the fact that the setting changed.

The endpoint is `https://zororo.xmousse.com/v1/events`.
Turning the option off stops all further sending (a single final event records
the opt-out) and discards anything still queued. Events are retained for 24
months (730 days), then deleted automatically.

### Local diagnostics (opt-in)

If you enable **Debug → Capture local telemetry diagnostics**, the extension
keeps a local log of telemetry delivery phases (including error messages and
HTTP status codes) in `chrome.storage.local`. This log never leaves your device,
is not part of the usage statistics, and is deleted when you uninstall the
extension or clear its data. **Export diagnostics** saves it to a file; after
repeated delivery failures the extension may also write it to your Downloads
folder (at most once per hour).

### Network requests

The extension makes requests to:

- **ororo.tv API** (`https://ororo.tv/api/v2/...`) — to fetch show data, episode lists, and download URLs. These requests include your session cookies so ororo.tv can authenticate you.
- **ororo.tv content requests** (`https://ororo.tv/en/content_requests`) — sent only when you click **Request content** in the IMDb panel. The request contains the title and IMDb ID you asked for, and your ororo.tv session cookies so ororo.tv can authenticate you.
- **imdb.com** — on IMDb title pages the extension reads the page (title, type, year) to identify the movie/show. No data is sent; nothing leaves the page.
- **Google Translate** (`translate.googleapis.com`) — to translate comments, descriptions, and episode plots when the user clicks "Translate". Only triggered by explicit user action. No personal data is transmitted.
- **QR code server** (`https://api.qrserver.com/`) — to render a QR code for a crypto donation address when the user clicks a crypto pill in the support modal. Only triggered by explicit user action. No personal data is sent; the wallet address is public blockchain information.
- **Chrome downloads API** — to trigger file downloads, running entirely in your browser.
- **IMDb** (`https://v2.sg.media-imdb.com/suggestion/x/...`) — to look up and link the official IMDb page for the current show/movie. Triggered when a show/movie page loads. No login or personal data; only the normalized title slug is sent as part of the URL.
- **Rotten Tomatoes** (`https://www.rottentomatoes.com/...`) — same purpose: resolve and link the official Rotten Tomatoes page for the current show/movie. Triggered on page load. No login or personal data.
- **Zororo telemetry endpoint** (`https://zororo.xmousse.com/v1/events`) — receives the anonymous usage statistics (Chrome build only) described above, using a rotating weekly id. Turning off **Anonymous usage stats** stops these requests.
- **Custom panel icon URL** — only if you choose a URL for the collapsed panel icon. Your browser loads that image directly from the host you specified, on each page where the collapsed panel appears. No other data is sent by the extension.

### What is NOT collected

- No personal information (name, email, or account)
- No browsing history beyond the ororo.tv pages you use and the IMDb title pages where the panel appears
- No free-text values (e.g. your download folder name)
- No crash reports or error logs are sent anywhere

## Third-Party Services

The extension uses the following third-party services:

- **QRServer** (`api.qrserver.com`) — renders QR code images for crypto donation addresses in the support overlay. No user tracking or analytics. The request is made only on explicit user click.
- **Buy Me a Coffee** (`buymeacoffee.com`) — the "Support" button links to a Ko-fi page via a standard `<a>` navigation. No data is sent by the extension.
- **Google Translate** (`translate.googleapis.com`) — translates comments, show descriptions, and episode plots on ororo.tv when the user clicks "Translate". The text is sent to Google for translation. Only triggered by explicit user action. No personal data is transmitted.
- **Formspree** (`formspree.io`) — forwards feedback form submissions from the support modal to the developer's email. Only triggered by explicit user action. No personal data is transmitted beyond what the user voluntarily enters (title, description, page URL).
- **IMDb** (`v2.sg.media-imdb.com`) — resolves and links the official IMDb page for the current show/movie. No tracking or analytics; only title queries are sent.
- **Rotten Tomatoes** (`rottentomatoes.com`) — resolves and links the official Rotten Tomatoes page for the current show/movie. No tracking or analytics; only title queries are sent.
- **Cloudflare Workers / D1** (`zororo.xmousse.com`) — hosts the telemetry endpoint and stores the anonymous events described above. No account information and no personal data beyond the anonymous payload; records are deleted after 24 months.

No other third-party services, SDKs, analytics frameworks, or tracking are integrated. Zororo contains no advertising or third-party analytics SDKs.

## Data Sharing

Zororo does not sell your data. It does not share or transfer it to third
parties, except for the anonymous usage statistics described above (Chrome
build only), which are sent to Google Forms and are not linked to your identity.

## Changes to This Policy

If this policy changes, the version will be updated in the GitHub repository.

## Contact

For questions about this privacy policy, open an issue on GitHub:

[https://github.com/perplexedpigmy/zororo-extension](https://github.com/perplexedpigmy/zororo-extension)
