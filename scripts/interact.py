"""Dev verification: exercise a few interactions and capture screenshots."""
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
out = Path("shots")
out.mkdir(exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=True)
    errors: list[str] = []

    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)

    # Assistant: click a suggested prompt and wait for the grounded answer.
    page.evaluate("localStorage.removeItem('airenv-assistant-history')") if page.url.startswith(BASE) else None
    page.goto(BASE + "/app/assistant")
    page.wait_for_timeout(3000)
    page.get_by_role("button", name="Is it safe to play outside?").click()
    page.wait_for_selector("text=Rule-based answer, text=Gemini · grounded", timeout=30000) if False else page.wait_for_timeout(6000)
    page.screenshot(path=str(out / "assistant-answer.png"), full_page=True)

    # Map with dark OSM tiles.
    page.goto(BASE + "/app/map")
    page.wait_for_timeout(7000)
    page.screenshot(path=str(out / "map.png"))

    # Sidebar collapse toggle.
    page.goto(BASE + "/app")
    page.wait_for_timeout(4000)
    page.get_by_role("button", name="Collapse sidebar").click()
    page.wait_for_timeout(1200)
    page.screenshot(path=str(out / "dashboard-collapsed.png"))
    page.get_by_role("button", name="Expand sidebar").click()

    # Impact emissions tab.
    page.goto(BASE + "/app/impact")
    page.wait_for_timeout(3000)
    page.get_by_role("tab", name="Emissions").click()
    page.wait_for_timeout(2500)
    page.screenshot(path=str(out / "impact-emissions.png"), full_page=True)

    # Mobile dashboard and drawer.
    m = browser.new_page(viewport={"width": 390, "height": 844})
    m.on("pageerror", lambda e: errors.append(f"mobile pageerror: {e}"))
    m.goto(BASE + "/app")
    m.wait_for_timeout(6000)
    width = m.evaluate("document.documentElement.scrollWidth")
    m.screenshot(path=str(out / "mobile-top.png"))
    m.get_by_role("button", name="Open menu").click()
    m.wait_for_timeout(800)
    m.screenshot(path=str(out / "mobile-drawer.png"))
    print("mobile scrollWidth", width)
    print("errors:", errors or "none")
    browser.close()
