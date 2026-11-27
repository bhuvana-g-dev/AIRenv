"""Firebase authentication path and role checks, with firebase_admin replaced by in-memory fakes."""
import asyncio
import sys
import types

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.config import get_settings
from app.core import security
from app.core.rate_limit import limiter
from app.core.security import CurrentUser, get_current_user, get_optional_user, require_role
from app.db.store import get_store
from app.main import app


class FakeFirebase:
    def __init__(self, monkeypatch, initialised=True):
        self.tokens: dict[str, dict] = {}
        self.verified: list[str] = []
        self.certificates: list = []
        self.initialised_with: list = []
        root = types.ModuleType("firebase_admin")
        root._apps = {"[DEFAULT]": object()} if initialised else {}
        auth = types.ModuleType("firebase_admin.auth")
        credentials = types.ModuleType("firebase_admin.credentials")

        def verify_id_token(token):
            self.verified.append(token)
            if token not in self.tokens:
                raise ValueError("Token expired")
            return self.tokens[token]

        def certificate(value):
            self.certificates.append(value)
            return ("cert", value)

        def initialize_app(cred, options):
            self.initialised_with.append((cred, options))
            root._apps["[DEFAULT]"] = object()

        auth.verify_id_token = verify_id_token
        credentials.Certificate = certificate
        root.auth = auth
        root.credentials = credentials
        root.initialize_app = initialize_app
        self.root = root
        monkeypatch.setitem(sys.modules, "firebase_admin", root)
        monkeypatch.setitem(sys.modules, "firebase_admin.auth", auth)
        monkeypatch.setitem(sys.modules, "firebase_admin.credentials", credentials)


@pytest.fixture
def firebase(monkeypatch):
    monkeypatch.setattr(get_settings(), "auth_mode", "firebase")
    monkeypatch.setattr(get_settings(), "admin_emails", "")
    return FakeFirebase(monkeypatch)


def _user(authorization):
    return asyncio.run(get_current_user(authorization))


@pytest.mark.parametrize("header", [None, "", "Basic abc", "Token xyz"])
def test_missing_or_non_bearer_header_is_401(firebase, header):
    with pytest.raises(HTTPException) as info:
        _user(header)
    assert info.value.status_code == 401 and info.value.detail == "Sign in required"
    assert firebase.verified == []


def test_invalid_token_is_401(firebase):
    with pytest.raises(HTTPException) as info:
        _user("Bearer not-a-real-token")
    assert info.value.status_code == 401 and info.value.detail == "Invalid or expired session"
    assert firebase.verified == ["not-a-real-token"]


def test_valid_token_creates_member_profile(firebase):
    firebase.tokens["good"] = {"uid": "u1", "email": "Asha@Example.COM", "name": "Asha"}
    user = _user("bearer   good  ")
    assert user == CurrentUser(uid="u1", email="asha@example.com", display_name="Asha", role="member",
                               auth_mode="firebase")
    profile = asyncio.run(get_store().get("users", "u1"))
    assert profile["email"] == "asha@example.com" and profile["role"] == "member"
    assert profile["display_name"] == "Asha" and profile["onboarded"] is False


def test_token_without_email_or_name_uses_defaults(firebase):
    firebase.tokens["anon"] = {"uid": "anon1"}
    user = _user("Bearer anon")
    assert user.email is None and user.display_name == "AIRenv member" and user.role == "member"


def test_existing_profile_is_reused(firebase):
    asyncio.run(get_store().set("users", "u2", {"uid": "u2", "display_name": "Kept", "role": "community_admin"}))
    firebase.tokens["t"] = {"uid": "u2", "email": "u2@example.com", "name": "New name"}
    user = _user("Bearer t")
    assert user.display_name == "Kept" and user.role == "community_admin"


def test_admin_email_creates_admin(firebase, monkeypatch):
    monkeypatch.setattr(get_settings(), "admin_emails", "boss@example.com, other@example.com")
    firebase.tokens["t"] = {"uid": "boss", "email": "BOSS@example.com"}
    assert _user("Bearer t").role == "admin"
    assert asyncio.run(get_store().get("users", "boss"))["role"] == "admin"


def test_admin_email_promotes_existing_member(firebase, monkeypatch):
    monkeypatch.setattr(get_settings(), "admin_emails", "boss@example.com")
    asyncio.run(get_store().set("users", "boss", {"uid": "boss", "display_name": "Boss", "role": "member"}))
    firebase.tokens["t"] = {"uid": "boss", "email": "boss@example.com"}
    user = _user("Bearer t")
    assert user.role == "admin" and user.display_name == "Boss"
    assert asyncio.run(get_store().get("users", "boss"))["role"] == "admin"


def test_uninitialised_firebase_without_credentials_is_503(monkeypatch):
    monkeypatch.setattr(get_settings(), "auth_mode", "firebase")
    monkeypatch.setattr(get_settings(), "firebase_credentials", "")
    fb = FakeFirebase(monkeypatch, initialised=False)
    with pytest.raises(HTTPException) as info:
        _user("Bearer anything")
    assert info.value.status_code == 503 and info.value.detail == "Authentication is not configured"
    assert fb.verified == []


@pytest.mark.parametrize("raw, expected", [('{"type": "service_account"}', {"type": "service_account"}),
                                           ("/secrets/sa.json", "/secrets/sa.json")])
def test_firebase_is_initialised_from_json_or_path(monkeypatch, raw, expected):
    monkeypatch.setattr(get_settings(), "auth_mode", "firebase")
    monkeypatch.setattr(get_settings(), "firebase_credentials", raw)
    monkeypatch.setattr(get_settings(), "firebase_project_id", "airenv-test")
    fb = FakeFirebase(monkeypatch, initialised=False)
    fb.tokens["t"] = {"uid": "u9"}
    assert _user("Bearer t").uid == "u9"
    assert fb.certificates == [expected]
    assert fb.initialised_with == [(("cert", expected), {"projectId": "airenv-test"})]


def test_get_optional_user_returns_none_on_failure(firebase):
    assert asyncio.run(get_optional_user(None)) is None
    assert asyncio.run(get_optional_user("Bearer bad")) is None
    firebase.tokens["ok"] = {"uid": "u3"}
    assert asyncio.run(get_optional_user("Bearer ok")).uid == "u3"


def test_local_mode_returns_local_admin(monkeypatch):
    monkeypatch.setattr(get_settings(), "auth_mode", "local")
    user = _user(None)
    assert (user.uid, user.role, user.auth_mode) == (security.LOCAL_UID, "admin", "local")


# ----------------------------------------------------------------------------- roles

@pytest.mark.parametrize("role, required, allowed", [
    ("member", ("member",), True),
    ("member", ("community_admin",), False),
    ("community_admin", ("community_admin", "admin"), True),
    ("admin", ("community_admin",), True),
    ("member", (), False),
])
def test_has_role(role, required, allowed):
    assert CurrentUser(uid="x", role=role).has_role(*required) is allowed


def test_require_role_forbids_and_allows():
    checker = require_role("community_admin")
    member = CurrentUser(uid="m", role="member")
    with pytest.raises(HTTPException) as info:
        asyncio.run(checker(member))
    assert info.value.status_code == 403
    assert info.value.detail == "You do not have permission for this action"
    ca = CurrentUser(uid="c", role="community_admin")
    assert asyncio.run(checker(ca)) is ca
    admin = CurrentUser(uid="a", role="admin")
    assert asyncio.run(checker(admin)) is admin


def test_new_token_is_url_safe_and_unique():
    tokens = {security.new_token(8) for _ in range(20)}
    assert len(tokens) == 20
    assert all(set(t) <= set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_") for t in tokens)


# ----------------------------------------------------------------------------- through the API

def test_api_requires_bearer_token_in_firebase_mode(firebase):
    firebase.tokens["good"] = {"uid": "api-user", "email": "api@example.com", "name": "API"}
    limiter.reset()
    with TestClient(app) as c:
        r = c.get("/api/me")
        assert r.status_code == 401 and r.json()["detail"] == "Sign in required"
        r = c.get("/api/me", headers={"Authorization": "Bearer nope"})
        assert r.status_code == 401
        me = c.get("/api/me", headers={"Authorization": "Bearer good"}).json()
        assert me["uid"] == "api-user" and me["auth_mode"] == "firebase" and me["role"] == "member"
        # Optional-auth endpoints still work anonymously.
        assert c.get("/api/telegram/status").status_code == 200
    limiter.reset()
