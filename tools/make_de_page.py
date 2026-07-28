#!/usr/bin/env python3
"""Validate the independently maintained English and German marketing pages.

The pages share docs/site.css and docs/site.js, while their copy is kept in
separate HTML files so translations can stay natural instead of being built
from brittle string replacements.
"""

from html.parser import HTMLParser
from pathlib import Path
import sys


class PageStructure(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = set()
        self.stylesheets = set()
        self.scripts = set()

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if values.get("id"):
            self.ids.add(values["id"])
        if tag == "link" and values.get("rel") == "stylesheet":
            self.stylesheets.add(values.get("href"))
        if tag == "script" and values.get("src"):
            self.scripts.add(values["src"])


def parse(path):
    page = PageStructure()
    page.feed(path.read_text(encoding="utf-8"))
    page.close()
    return page


def main():
    docs = Path(__file__).resolve().parent.parent / "docs"
    english = parse(docs / "index.html")
    german = parse(docs / "de.html")
    errors = []

    if english.ids != german.ids:
        errors.append("Die IDs der Sprachversionen unterscheiden sich.")
    if english.stylesheets != german.stylesheets:
        errors.append("Die Stylesheets der Sprachversionen unterscheiden sich.")
    if english.scripts != german.scripts:
        errors.append("Die Skripte der Sprachversionen unterscheiden sich.")

    if errors:
        for error in errors:
            print("FEHLER:", error)
        return 1

    print("docs/index.html und docs/de.html sind strukturell synchron.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
