#!/usr/bin/env python3
"""Remove Chrome-only telemetry from a built Firefox extension directory.

Deletes src/telemetry.js and strips the marker-delimited telemetry blocks from
the shared JS/HTML files, so the Firefox package contains no telemetry code,
markup, or host permission. Marker syntax:

    JS   : /* @telemetry-start */ ... /* @telemetry-end */
    HTML : <!-- @telemetry-start --> ... <!-- @telemetry-end -->

Called automatically by the `dev-firefox` / `build-firefox` recipes in .justfile.
"""
import argparse
import os
import re
import sys

EXAMPLES = """\
examples:
  # strip telemetry from the default build dir (./extension)
  python3 tools/strip-telemetry.py

  # strip a specific build dir
  python3 tools/strip-telemetry.py dist/firefox

what it removes:
  - <dir>/src/telemetry.js
  - everything between the @telemetry-start / @telemetry-end markers in
    <dir>/src/background.js, <dir>/src/options.js and <dir>/options.html
"""


def strip_telemetry(root):
    """Strip telemetry from `root`; returns a list of what changed."""
    changed = []

    telemetry = os.path.join(root, "src", "telemetry.js")
    if os.path.exists(telemetry):
        os.remove(telemetry)
        changed.append("removed src/telemetry.js")

    js_block = re.compile(r"/\* @telemetry-start \*/.*?/\* @telemetry-end \*/", re.S)
    for rel in ("src/background.js", "src/options.js"):
        path = os.path.join(root, rel)
        if os.path.exists(path):
            with open(path, encoding="utf-8") as fh:
                src = fh.read()
            new = js_block.sub("", src)
            if new != src:
                with open(path, "w", encoding="utf-8") as fh:
                    fh.write(new)
                changed.append(f"stripped markers in {rel}")

    html_block = re.compile(r"<!-- @telemetry-start -->.*?<!-- @telemetry-end -->", re.S)
    html = os.path.join(root, "options.html")
    if os.path.exists(html):
        with open(html, encoding="utf-8") as fh:
            src = fh.read()
        new = html_block.sub("", src)
        if new != src:
            with open(html, "w", encoding="utf-8") as fh:
                fh.write(new)
            changed.append("stripped markers in options.html")

    return changed


def main():
    ap = argparse.ArgumentParser(
        description="Remove Chrome-only telemetry from a built Firefox extension directory.",
        epilog=EXAMPLES,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("directory", nargs="?", default="extension",
                    help="build directory to process (default: extension)")
    args = ap.parse_args()

    if not os.path.isdir(args.directory):
        sys.exit(f"error: not a directory: {args.directory}")

    changed = strip_telemetry(args.directory)
    if changed:
        for item in changed:
            print(f"  {item}")
    else:
        print("  nothing to strip (already clean?)")


if __name__ == "__main__":
    main()
