"""
DebateX Backend Tests
Tests all API endpoints with mocked external services (Groq, MongoDB).
Run with: python -m pytest tests/test_backend.py -v
"""
import pytest
import asyncio
import uuid
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient

# ── patch Groq & Motor before importing the app ─────────────────────────────
import sys, types

# Stub the groq module so it doesn't need a real key at import time
mock_groq_module = types.ModuleType("groq")
mock_groq_module.Groq = MagicMock
sys.modules["groq"] = mock_groq_module

# Stub motor to avoid real DB connections at import
mock_motor = types.ModuleType("motor")
mock_motor_asyncio = types.ModuleType("motor.motor_asyncio")
mock_motor_asyncio.AsyncIOMotorClient = MagicMock
mock_motor.motor_asyncio = mock_motor_asyncio
sys.modules["motor"] = mock_motor
sys.modules["motor.motor_asyncio"] = mock_motor_asyncio

import os
os.environ.setdefault("MONGO_URI", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "debatex_test")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-key-for-unit-testing-32bytes")
os.environ.setdefault("GROQ_API_KEY", "fake-test-key")

# now safe to import
import importlib, backend.server as server_module
from backend.server import (
    hash_password, verify_password, create_token,
    build_system_prompt, needs_web_search, DEBATE_MODES,
    VOICE_CHARACTERS
)


# ── Auth helper tests ────────────────────────────────────────────────────────
class TestAuthHelpers:
    def test_hash_and_verify_password(self):
        pw = "SecurePass123"
        hashed = hash_password(pw)
        assert hashed != pw
        assert verify_password(pw, hashed)

    def test_wrong_password_fails(self):
        hashed = hash_password("correct")
        assert not verify_password("wrong", hashed)

    def test_create_token_returns_string(self):
        token = create_token(str(uuid.uuid4()))
        assert isinstance(token, str)
        assert len(token) > 20

    def test_token_contains_user_id(self):
        import jwt as pyjwt
        uid = str(uuid.uuid4())
        token = create_token(uid)
        payload = pyjwt.decode(token, server_module.JWT_SECRET, algorithms=["HS256"])
        assert payload["sub"] == uid


# ── Debate helpers ────────────────────────────────────────────────────────────
class TestDebateHelpers:
    def test_build_system_prompt_contains_topic(self):
        prompt = build_system_prompt("devils_advocate", "AI in schools", "for")
        assert "AI in schools" in prompt

    def test_build_system_prompt_contains_stance(self):
        prompt = build_system_prompt("oxford", "Climate change", "against")
        assert "against" in prompt

    def test_build_system_prompt_unknown_mode_falls_back(self):
        prompt = build_system_prompt("nonexistent_mode", "Test topic", None)
        assert "Test topic" in prompt

    def test_build_system_prompt_with_voice_character_sage(self):
        prompt = build_system_prompt("devils_advocate", "AI ethics", None, "sage")
        assert "Sage" in prompt
        assert "Calm, intellectual" in prompt
        assert "AI ethics" in prompt

    def test_build_system_prompt_with_voice_character_maverick(self):
        prompt = build_system_prompt("oxford", "Free speech", "for", "maverick")
        assert "Maverick" in prompt
        assert "Sharp, aggressive" in prompt
        assert "for" in prompt

    def test_build_system_prompt_ignores_unknown_voice_character(self):
        prompt = build_system_prompt("friendly", "Test", None, "nonexistent_voice")
        # Should not error, should simply not add a persona tint
        assert "Test" in prompt
        assert "nonexistent_voice" not in prompt

    def test_voice_characters_have_required_keys(self):
        """Every voice character must have id, name, tagline, description, tts_profile."""
        for vc_id, vc in VOICE_CHARACTERS.items():
            assert vc["id"] == vc_id
            assert "name" in vc
            assert "tagline" in vc
            assert "description" in vc
            assert "tts_profile" in vc
            assert "rate" in vc["tts_profile"]
            assert "pitch" in vc["tts_profile"]

    def test_needs_web_search_current_year(self):
        assert needs_web_search("What is the stock price today?")

    def test_needs_web_search_recent(self):
        assert needs_web_search("What is the latest news about the election?")

    def test_needs_web_search_false_for_generic(self):
        assert not needs_web_search("Is democracy the best system?")

    def test_all_debate_modes_exist(self):
        expected = {
            "devils_advocate", "socratic", "oxford", "cross_examination",
            "rapid_fire", "philosophy", "business", "friendly"
        }
        assert set(DEBATE_MODES.keys()) == expected


# ── Groq integration (mocked) ─────────────────────────────────────────────────
class TestGroqDebateReply:
    @pytest.mark.asyncio
    async def test_groq_reply_returns_text_and_bool(self):
        mock_choice = MagicMock()
        mock_choice.message.content = "That is a flawed argument."
        mock_choice.message.executed_tools = None

        mock_completion = MagicMock()
        mock_completion.choices = [mock_choice]

        mock_groq = MagicMock()
        mock_groq.chat.completions.create.return_value = mock_completion

        with patch.object(server_module, "groq_client", mock_groq):
            text, used_search = await server_module.groq_debate_reply(
                "You are a debater.",
                [],
                "AI is good for humanity"
            )
        assert text == "That is a flawed argument."
        assert isinstance(used_search, bool)

    @pytest.mark.asyncio
    async def test_groq_reply_raises_when_no_client(self):
        from fastapi import HTTPException
        with patch.object(server_module, "groq_client", None):
            with pytest.raises(HTTPException) as exc_info:
                await server_module.groq_debate_reply("sys", [], "msg")
        assert exc_info.value.status_code == 503


# ── Report generation (mocked) ────────────────────────────────────────────────
class TestReportGeneration:
    @pytest.mark.asyncio
    async def test_generate_report_returns_valid_schema(self):
        import json
        expected_report = {
            "overall_score": 72,
            "logic_score": 70,
            "evidence_score": 65,
            "critical_thinking_score": 75,
            "persuasiveness_score": 68,
            "communication_score": 80,
            "confidence_score": 72,
            "strongest_argument": "Strong on economic analysis.",
            "weakest_argument": "Weak on social impact.",
            "biggest_assumption": "Assumes steady growth.",
            "fallacies_detected": ["Straw Man"],
            "suggestions": ["Use more data.", "Define your terms."],
            "summary": "A competent debater with room for improvement."
        }

        mock_choice = MagicMock()
        mock_choice.message.content = json.dumps(expected_report)
        mock_completion = MagicMock()
        mock_completion.choices = [mock_choice]
        mock_groq = MagicMock()
        mock_groq.chat.completions.create.return_value = mock_completion

        messages = [
            {"role": "assistant", "content": "Let's debate AI."},
            {"role": "user", "content": "AI is transformative."},
            {"role": "assistant", "content": "But at what cost?"},
        ]

        with patch.object(server_module, "groq_client", mock_groq):
            report = await server_module.groq_generate_report(
                "AI in society", "devils_advocate", messages
            )

        assert report["overall_score"] == 72
        assert "fallacies_detected" in report
        assert isinstance(report["suggestions"], list)

    @pytest.mark.asyncio
    async def test_generate_report_returns_default_on_error(self):
        mock_groq = MagicMock()
        mock_groq.chat.completions.create.side_effect = Exception("API timeout")

        with patch.object(server_module, "groq_client", mock_groq):
            report = await server_module.groq_generate_report("Topic", "oxford", [])

        # Should return graceful default
        assert "overall_score" in report
        assert report["overall_score"] == 60


# ── FastAPI endpoints (HTTP level) ────────────────────────────────────────────
# We use in-memory MongoDB mock for these tests
class TestAPIEndpoints:
    @pytest.fixture(autouse=True)
    def setup_mock_db(self):
        """Replace the DB with an async in-memory mock."""
        self.users_store = {}
        self.debates_store = {}

        mock_users = MagicMock()
        mock_debates = MagicMock()

        # Users collection mock
        async def fake_find_one_user(query, *args, **kwargs):
            if "email" in query:
                return next(
                    (u for u in self.users_store.values() if u["email"] == query["email"]),
                    None
                )
            if "id" in query:
                return self.users_store.get(query["id"])
            return None

        async def fake_insert_user(doc):
            self.users_store[doc["id"]] = doc

        mock_users.find_one = fake_find_one_user
        mock_users.insert_one = fake_insert_user
        mock_users.update_one = AsyncMock()

        # Debates collection mock
        async def fake_find_one_debate(query, *args, **kwargs):
            did = query.get("id")
            uid = query.get("user_id")
            d = self.debates_store.get(did)
            if d and (uid is None or d["user_id"] == uid):
                return d
            return None

        async def fake_insert_debate(doc):
            self.debates_store[doc["id"]] = doc

        async def fake_update_debate(query, update, *args, **kwargs):
            did = query.get("id")
            if did and did in self.debates_store:
                if "$push" in update:
                    for field, val in update["$push"].items():
                        if "$each" in val:
                            self.debates_store[did][field].extend(val["$each"])
                        else:
                            self.debates_store[did][field].append(val)
                if "$set" in update:
                    self.debates_store[did].update(update["$set"])

        async def fake_delete_debate(query):
            did = query.get("id")
            if did and did in self.debates_store:
                del self.debates_store[did]
                r = MagicMock()
                r.deleted_count = 1
                return r
            r = MagicMock()
            r.deleted_count = 0
            return r

        mock_debates.find_one = fake_find_one_debate
        mock_debates.insert_one = fake_insert_debate
        mock_debates.update_one = fake_update_debate
        mock_debates.delete_one = fake_delete_debate

        mock_db = MagicMock()
        mock_db.users = mock_users
        mock_db.debates = mock_debates

        with patch.object(server_module, "db", mock_db):
            yield

    @pytest.fixture
    def client(self):
        return TestClient(server_module.app)

    @pytest.fixture
    def auth_headers(self, client):
        """Register a user and return auth headers."""
        resp = client.post("/api/auth/signup", json={
            "email": "test@debatex.io",
            "password": "Password123",
            "name": "Test User"
        })
        assert resp.status_code == 200
        token = resp.json()["token"]
        return {"Authorization": f"Bearer {token}"}

    def test_health_check(self, client):
        resp = client.get("/api/")
        assert resp.status_code == 200
        data = resp.json()
        assert data["service"] == "DebateX"
        assert data["status"] == "ok"

    def test_list_modes(self, client):
        resp = client.get("/api/modes")
        assert resp.status_code == 200
        modes = resp.json()
        assert len(modes) == 8
        mode_ids = [m["id"] for m in modes]
        assert "devils_advocate" in mode_ids
        assert "socratic" in mode_ids

    def test_list_voices(self, client):
        resp = client.get("/api/voices")
        assert resp.status_code == 200
        voices = resp.json()
        assert len(voices) == 3
        voice_ids = [v["id"] for v in voices]
        assert "sage" in voice_ids
        assert "maverick" in voice_ids
        assert "echo" in voice_ids
        # Each voice must have the required fields
        for v in voices:
            assert "name" in v
            assert "tagline" in v
            assert "description" in v
            assert "tts_profile" in v

    def test_signup_success(self, client):
        resp = client.post("/api/auth/signup", json={
            "email": "newuser@test.com",
            "password": "StrongPass99",
            "name": "New User"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data
        assert data["user"]["email"] == "newuser@test.com"
        assert data["user"]["name"] == "New User"

    def test_signup_duplicate_email_rejected(self, client, auth_headers):
        resp = client.post("/api/auth/signup", json={
            "email": "test@debatex.io",
            "password": "AnotherPass1",
            "name": "Duplicate"
        })
        assert resp.status_code == 400
        assert "already registered" in resp.json()["detail"]

    def test_login_success(self, client, auth_headers):
        resp = client.post("/api/auth/login", json={
            "email": "test@debatex.io",
            "password": "Password123"
        })
        assert resp.status_code == 200
        assert "token" in resp.json()

    def test_login_wrong_password(self, client, auth_headers):
        resp = client.post("/api/auth/login", json={
            "email": "test@debatex.io",
            "password": "WrongPassword"
        })
        assert resp.status_code == 401

    def test_me_endpoint(self, client, auth_headers):
        resp = client.get("/api/auth/me", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["email"] == "test@debatex.io"

    def test_me_requires_auth(self, client):
        resp = client.get("/api/auth/me")
        assert resp.status_code == 401

    def test_create_debate_default(self, client, auth_headers):
        """Create a debate without voice_character."""
        mock_reply = MagicMock()
        mock_reply.message.content = "Let's debate AI! What's your opening argument?"
        mock_reply.message.executed_tools = None
        mock_completion = MagicMock()
        mock_completion.choices = [mock_reply]
        mock_groq = MagicMock()
        mock_groq.chat.completions.create.return_value = mock_completion

        with patch.object(server_module, "groq_client", mock_groq):
            resp = client.post("/api/debates", json={
                "topic": "AI will replace all human jobs",
                "mode": "devils_advocate",
                "user_stance": "for"
            }, headers=auth_headers)

        assert resp.status_code == 200
        data = resp.json()
        assert data["topic"] == "AI will replace all human jobs"
        assert data["mode"] == "devils_advocate"
        assert data.get("voice_character") is None
        assert len(data["messages"]) == 1
        assert data["messages"][0]["role"] == "assistant"

    def test_create_debate_with_voice_character(self, client, auth_headers):
        """Create a debate specifying a voice_character."""
        mock_reply = MagicMock()
        mock_reply.message.content = "Your reasoning is flawed, my friend."
        mock_reply.message.executed_tools = None
        mock_completion = MagicMock()
        mock_completion.choices = [mock_reply]
        mock_groq = MagicMock()
        mock_groq.chat.completions.create.return_value = mock_completion

        with patch.object(server_module, "groq_client", mock_groq):
            resp = client.post("/api/debates", json={
                "topic": "Universal basic income",
                "mode": "socratic",
                "user_stance": "for",
                "voice_character": "sage"
            }, headers=auth_headers)

        assert resp.status_code == 200
        data = resp.json()
        assert data["voice_character"] == "sage"
        assert data["topic"] == "Universal basic income"

    def test_create_debate_invalid_voice_character(self, client, auth_headers):
        """Create a debate with an invalid voice_character should return 400."""
        resp = client.post("/api/debates", json={
            "topic": "Test",
            "mode": "friendly",
            "voice_character": "invalid_voice"
        }, headers=auth_headers)
        assert resp.status_code == 400
        assert "Invalid voice_character" in resp.json()["detail"]

    def test_create_debate_invalid_mode(self, client, auth_headers):
        resp = client.post("/api/debates", json={
            "topic": "Some topic",
            "mode": "invalid_mode"
        }, headers=auth_headers)
        assert resp.status_code == 400

    def test_get_debates_list(self, client, auth_headers):
        mock_reply = MagicMock()
        mock_reply.message.content = "Opener text"
        mock_reply.message.executed_tools = None
        mock_completion = MagicMock()
        mock_completion.choices = [mock_reply]
        mock_groq = MagicMock()
        mock_groq.chat.completions.create.return_value = mock_completion

        # Mock the find cursor
        async def mock_to_list(n):
            return list(self.debates_store.values())

        async def async_debates_iter():
            for d in list(self.debates_store.values()):
                yield d

        cursor_mock = MagicMock()
        cursor_mock.sort = MagicMock(return_value=cursor_mock)
        cursor_mock.limit = MagicMock(return_value=cursor_mock)
        cursor_mock.__aiter__ = lambda s: async_debates_iter().__aiter__()

        with patch.object(server_module, "groq_client", mock_groq):
            client.post("/api/debates", json={
                "topic": "First test debate",
                "mode": "socratic"
            }, headers=auth_headers)

        with patch.object(server_module.db.debates, "find", return_value=cursor_mock):
            resp = client.get("/api/debates", headers=auth_headers)

        assert resp.status_code == 200

    def test_delete_debate(self, client, auth_headers):
        mock_reply = MagicMock()
        mock_reply.message.content = "Opener"
        mock_reply.message.executed_tools = None
        mock_completion = MagicMock()
        mock_completion.choices = [mock_reply]
        mock_groq = MagicMock()
        mock_groq.chat.completions.create.return_value = mock_completion

        with patch.object(server_module, "groq_client", mock_groq):
            create_resp = client.post("/api/debates", json={
                "topic": "Delete me",
                "mode": "friendly"
            }, headers=auth_headers)

        debate_id = create_resp.json()["id"]
        del_resp = client.delete(f"/api/debates/{debate_id}", headers=auth_headers)
        assert del_resp.status_code == 200
        assert del_resp.json()["ok"] is True