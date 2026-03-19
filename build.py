#!/usr/bin/env python3
"""Build script: inlines CSS/JS into HTML templates to produce self-contained pages."""

import os
import re
import shutil
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(BASE, "dist")

TEMPLATES = {
    "features.html": "index.html",
    "roadmap.html": "roadmap.html",
}


def inline_includes(html):
    """Replace {{FILE:path}} markers with the contents of the referenced file."""

    def replacer(match):
        rel_path = match.group(1)
        abs_path = os.path.join(BASE, rel_path)
        if not os.path.isfile(abs_path):
            print(f"  WARNING: missing include {rel_path}", file=sys.stderr)
            return f"/* MISSING: {rel_path} */"
        with open(abs_path, encoding="utf-8") as f:
            return f.read()

    return re.sub(r"\{\{FILE:([^}]+)\}\}", replacer, html)


def build():
    os.makedirs(DIST, exist_ok=True)

    for template_name, output_name in TEMPLATES.items():
        template_path = os.path.join(BASE, "src", "templates", template_name)
        with open(template_path, encoding="utf-8") as f:
            html = f.read()
        html = inline_includes(html)
        output_path = os.path.join(DIST, output_name)
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(html)
        print(f"  Built {output_name}")

    # Copy data file
    shutil.copy2(
        os.path.join(BASE, "features.json"), os.path.join(DIST, "features.json")
    )
    print("  Copied features.json")


if __name__ == "__main__":
    print("Building feature-map...")
    build()
    print(f"Done. Output in {DIST}/")
