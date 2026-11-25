import os
from datetime import datetime

import pytest

os.environ["SCHEDULER_ENABLED"] = "false"
os.environ["TELEGRAM_BOT_TOKEN"] = ""
os.environ["GEMINI_API_KEY"] = ""
os.environ["AUTH_MODE"] = "local"
os.environ["FIREBASE_CREDENTIALS"] = ""

from app.db.store import SQLiteStore, set_store
from app.services import ambient_intelligence as ambient
from app.services import environmental_data as env
from app.services.location_service import make_location


@pytest.fixture(autouse=True)
def memory_store():
    store = SQLiteStore(":memory:")
    set_store(store)
    ambient.clear_cache()
    yield store


@pytest.fixture
def sample_bundle():
    """Bundle built from the deterministic sample series (no network)."""
    loc = make_location("Test City", 28.61, 77.21)
    aq = env.demo_air_quality(datetime(2026, 11, 19, 10, 0))
    aq["source"] = {**aq["source"], "type": "model", "name": "Test model"}
    bundle = ambient.build_bundle(loc, aq, None)
    return loc, bundle
