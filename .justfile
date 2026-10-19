_default:
    @just --list

build-firefox:
    mkdir -p dist
    rm -rf extension
    mkdir -p extension
    cp -r src icons popup.html options.html extension/
    cp manifest-firefox.json extension/manifest.json
    sed -i "s/@VERSION@/`cat VERSION`/g" extension/manifest.json
    sed -i "s|@RATE_URL@|https://addons.mozilla.org/en-US/firefox/addon/zororo/reviews/|g" extension/src/content.js extension/src/imdb.js
    sed -i -E "s/version-(@VERSION@|[0-9][0-9.]*)-blue/version-`cat VERSION`-blue/g" README.md
    python3 tools/strip-telemetry.py extension
    cd extension && zip -r ../dist/zororo-firefox.zip src icons popup.html options.html manifest.json

build-chrome:
    mkdir -p dist
    rm -rf extension
    mkdir -p extension
    cp -r src icons popup.html options.html extension/
    cp manifest-chrome.json extension/manifest.json
    sed -i "s/@VERSION@/`cat VERSION`/g" extension/manifest.json
    sed -i "s|@RATE_URL@|https://chromewebstore.google.com/detail/ororo/ibcmhfcmkmllpimlpplbmopfjollmecf|g" extension/src/content.js extension/src/imdb.js
    sed -i -E "s/version-(@VERSION@|[0-9][0-9.]*)-blue/version-`cat VERSION`-blue/g" README.md
    cd extension && zip -r ../dist/zororo-chrome.zip src icons popup.html options.html manifest.json

dev-firefox:
    rm -rf extension
    mkdir -p extension
    cp -r src icons popup.html options.html extension/
    cp manifest-firefox.json extension/manifest.json
    sed -i "s/@VERSION@/`cat VERSION`/g" extension/manifest.json
    sed -i "s|@RATE_URL@|https://addons.mozilla.org/en-US/firefox/addon/zororo/reviews/|g" extension/src/content.js extension/src/imdb.js
    python3 tools/strip-telemetry.py extension

dev-chrome:
    rm -rf extension
    mkdir -p extension
    cp -r src icons popup.html options.html extension/
    cp manifest-chrome.json extension/manifest.json
    sed -i "s/@VERSION@/`cat VERSION`/g" extension/manifest.json
    sed -i "s|@RATE_URL@|https://chromewebstore.google.com/detail/ororo/ibcmhfcmkmllpimlpplbmopfjollmecf|g" extension/src/content.js extension/src/imdb.js

build: build-chrome build-firefox
