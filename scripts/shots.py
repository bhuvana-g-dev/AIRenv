"""Capture UI screenshots with the locally installed Chrome (dev verification helper).

Usage: python scripts/shots.py http://localhost:5173 /app:dashboard /app/map:map ...
"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

base = sys.argv[1].rstrip("/")
targets = sys.argv[2:]
out = Path("shots")
out.mkdir(exist_ok=True)
width = 1440

with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=True)
    for t in targets:
        path, _, name = t.partition(":")
        mobile = name.endswith("-mobile")
        page = browser.new_page(viewport={"width": 390 if mobile else width, "height": 844 if mobile else 900},
                                device_scale_factor=1)
        logs = []
        page.on("console", lambda m: logs.append(f"{m.type}: {m.text}") if m.type in ("error", "warning") else None)
        page.on("pageerror", lambda e: logs.append(f"pageerror: {e}"))
        page.goto(base + path, wait_until="domcontentloaded")
        page.wait_for_timeout(7000)
        page.screenshot(path=str(out / f"{name}.png"), full_page=True)
        print(name, "ok", "|", " || ".join(logs[:6]))
        page.close()
    browser.close()
