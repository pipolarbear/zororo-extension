# Privacy Policy for Zororo

**Last updated:** July 2026

Zororo is a browser extension that downloads shows and movies from ororo.tv. This privacy policy explains what data the extension collects, how it is used, and your rights.

## Data Collection

**Zororo does not collect, transmit, or share any personal data.** The extension operates entirely within your browser.

### What is stored locally

All data is stored in your browser's `chrome.storage.local` and never leaves your device:

| Data | Purpose |
|---|---|
| **Root directory** | Where downloaded files are saved on your computer |
| **Subtitle language preferences** | Which subtitle tracks to download |
| **Rating history** | Your personal star ratings for shows/movies on ororo.tv |
| **Download queue** | Temporary tracking of queued downloads |

### Network requests

The extension makes requests to:

- **ororo.tv API** (`https://ororo.tv/api/v2/...`) — to fetch show data, episode lists, and download URLs. These requests include your session cookies so ororo.tv can authenticate you.
- **Google Translate** (`translate.googleapis.com`) — to translate comments, descriptions, and episode plots when the user clicks "Translate". Only triggered by explicit user action. No personal data is transmitted.
- **QR code server** (`https://api.qrserver.com/`) — to render a QR code for a crypto donation address when the user clicks a crypto pill in the support modal. Only triggered by explicit user action. No personal data is sent; the wallet address is public blockchain information.
- **Chrome downloads API** — to trigger file downloads, running entirely in your browser.
- **IMDb** (`https://v2.sg.media-imdb.com/suggestion/x/...`) — to look up and link the official IMDb page for the current show/movie. Triggered when a show/movie page loads. No login or personal data; only the normalized title slug is sent as part of the URL.
- **Rotten Tomatoes** (`https://www.rottentomatoes.com/...`) — same purpose: resolve and link the official Rotten Tomatoes page for the current show/movie. Triggered on page load. No login or personal data.

### What is NOT collected

- No analytics, tracking, or telemetry
- No personal information (name, email, IP address)
- No browsing history outside of ororo.tv
- No crash reports or error logs are sent anywhere

## Third-Party Services

The extension uses the following third-party services:

- **QRServer** (`api.qrserver.com`) — renders QR code images for crypto donation addresses in the support overlay. No user tracking or analytics. The request is made only on explicit user click.
- **Buy Me a Coffee** (`buymeacoffee.com`) — the "Support" button links to a Ko-fi page via a standard `<a>` navigation. No data is sent by the extension.
- **Google Translate** (`translate.googleapis.com`) — translates comments, show descriptions, and episode plots on ororo.tv when the user clicks "Translate". The text is sent to Google for translation. Only triggered by explicit user action. No personal data is transmitted.
- **Formspree** (`formspree.io`) — forwards feedback form submissions from the support modal to the developer's email. Only triggered by explicit user action. No personal data is transmitted beyond what the user voluntarily enters (title, description, page URL).
- **IMDb** (`v2.sg.media-imdb.com`) — resolves and links the official IMDb page for the current show/movie. No tracking or analytics; only title queries are sent.
- **Rotten Tomatoes** (`rottentomatoes.com`) — resolves and links the official Rotten Tomatoes page for the current show/movie. No tracking or analytics; only title queries are sent.

No other third-party services, SDKs, analytics frameworks, or tracking are integrated.

## Data Sharing

Zororo does not sell, share, or transfer any user data to third parties.

## Changes to This Policy

If this policy changes, the version will be updated in the GitHub repository.

## Contact

For questions about this privacy policy, open an issue on GitHub:

[https://github.com/perplexedpigmy/zororo-extension](https://github.com/perplexedpigmy/zororo-extension)
