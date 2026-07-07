"""
DebateX Backend — FastAPI + MongoDB + Groq + Edge-TTS

Provides authentication (JWT), debate session management, live turn-by-turn
AI debate replies powered by Groq (llama-3.3-70b-versatile + groq/compound
for web-search-augmented responses), voice character profiles, and
post-debate analysis. Text-to-speech is powered by Microsoft Edge-TTS
(free, high-quality, human-like voices).
"""
from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional, Literal
from datetime import datetime, timezone, timedelta
from pathlib import Path
import os
import re
import json
import uuid
import logging
import bcrypt
import jwt as pyjwt
from groq import Groq
import edge_tts

# --------------------------------------------------------------------------- #
# Setup
# --------------------------------------------------------------------------- #
ROOT_DIR = Path(__file__).resolve().parent
load_dotenv(ROOT_DIR / ".env", override=True)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("debatex")

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "debatex")
JWT_SECRET = os.environ.get("JWT_SECRET", "debatex-secure-jwt-secret-key-2024-production-ready-32bytes")
JWT_ALGO = "HS256"
JWT_TTL_HOURS = 24 * 7  # 7 days

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "").strip()
groq_client: Optional[Groq] = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None

mongo = AsyncIOMotorClient(MONGO_URL)
db = mongo[DB_NAME]

app = FastAPI(title="DebateX API")
api = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)


# --------------------------------------------------------------------------- #
# Edge-TTS Voice Mapping
# --------------------------------------------------------------------------- #
EDGE_TTS_VOICE_MAP = {
    "sage": "en-US-EmmaNeural",      # Calm, intellectual voice
    "maverick": "en-US-GuyNeural",   # Sharp, authoritative voice
}
DEFAULT_EDGE_TTS_VOICE = "en-US-JennyNeural"


# --------------------------------------------------------------------------- #
# Voice Characters
# --------------------------------------------------------------------------- #
VOICE_CHARACTERS = {
    "sage": {
        "id": "sage",
        "name": "Sage",
        "tagline": "Calm, intellectual",
        "description": "Thoughtful and precise. Speaks with the measured wisdom of a philosopher. Chooses every word carefully.",
        "tts_profile": {"voice_preference": "warm_female", "rate": 0.92, "pitch": 1.10},
    },
    "maverick": {
        "id": "maverick",
        "name": "Maverick",
        "tagline": "Sharp, aggressive",
        "description": "Uncompromising and direct. A rhetorical pitbull who goes for the jugular. No pleasantries.",
        "tts_profile": {"voice_preference": "deep_male", "rate": 1.10, "pitch": 0.85},
    },
    "echo": {
        "id": "echo",
        "name": "Echo",
        "tagline": "Balanced, neutral",
        "description": "Clear and even-handed. A neutral moderator who lets the arguments speak for themselves.",
        "tts_profile": {"voice_preference": "neutral", "rate": 1.0, "pitch": 1.0},
    },
}


# --------------------------------------------------------------------------- #
# Models
# --------------------------------------------------------------------------- #
class UserSignup(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    name: str = Field(min_length=1, max_length=80)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserPublic(BaseModel):
    id: str
    email: str
    name: str


class AuthResponse(BaseModel):
    token: str
    user: UserPublic


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    ts: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    used_web_search: bool = False


class DebateCreate(BaseModel):
    topic: str = Field(min_length=1, max_length=300)
    mode: str
    user_stance: Optional[str] = None  # "for" / "against" / None
    voice_character: Optional[str] = None  # "sage" / "maverick" / "echo" / None


class DebateTurn(BaseModel):
    debate_id: str
    user_message: str


class DebateOut(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    user_id: str
    topic: str
    mode: str
    user_stance: Optional[str] = None
    voice_character: Optional[str] = None
    messages: List[Message] = []
    created_at: str
    updated_at: str
    duration_seconds: int = 0
    bookmarked: bool = False
    report: Optional[dict] = None


class BookmarkToggle(BaseModel):
    bookmarked: bool


class FavoriteTopic(BaseModel):
    topic: str


class TTSRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    voice_character: Optional[str] = None  # "sage" / "maverick" / "echo" / None


# --------------------------------------------------------------------------- #
# Auth helpers
# --------------------------------------------------------------------------- #
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    return bcrypt.checkpw(pw.encode(), hashed.encode())


def create_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_TTL_HOURS),
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


async def current_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> dict:
    if not creds or not creds.credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = pyjwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGO])
        user_id = payload.get("sub")
    except pyjwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# --------------------------------------------------------------------------- #
# Groq prompts & helpers
# --------------------------------------------------------------------------- #
DEBATE_MODES = {
    "devils_advocate": (
        "You are a ruthless Devil's Advocate. You take the OPPOSITE position of the user "
        "on every claim, even if uncomfortable. Attack their strongest points first."
    ),
    "socratic": (
        "You are a Socratic questioner (like Socrates himself). You RARELY assert positions. "
        "Instead, ask 1-2 sharp probing questions per turn that expose hidden assumptions."
    ),
    "oxford": (
        "You are an Oxford-style formal debater. Use structured arguments: claim, warrant, evidence. "
        "Rebut the user's previous point directly before advancing your own."
    ),
    "cross_examination": (
        "You are a cross-examining trial lawyer. Ask pointed, closed-ended questions designed to "
        "trap contradictions. Occasionally state 'I put it to you that...' style challenges."
    ),
    "rapid_fire": (
        "You are in rapid-fire mode. Keep every reply under 40 words. Hit hard, hit fast, "
        "one sharp counterpoint per turn."
    ),
    "philosophy": (
        "You are a philosophy professor (analytic tradition). Ground rebuttals in relevant thinkers "
        "(Kant, Rawls, Nozick, Parfit, Nagel) but do NOT name-drop excessively."
    ),
    "business": (
        "You are a top-tier startup investor (Sequoia partner). Debate business strategy claims "
        "with unit economics, TAM, moat, and go-to-market skepticism."
    ),
    "friendly": (
        "You are a thoughtful debate partner. Steelman the user's point first, then present "
        "the strongest counterargument respectfully."
    ),
}

BASE_PERSONA = """You are DebateX, an elite AI debate partner. Your job is to IMPROVE THE USER'S THINKING, not win.

Core behavior:
- Never blindly agree. Challenge assumptions.
- Expose contradictions, name logical fallacies when you see them (ad hominem, straw man, false dilemma, etc.).
- Ask difficult follow-up questions.
- Distinguish facts from opinions.
- Admit uncertainty rather than invent information. Never fabricate citations.
- If the user makes a stronger point, acknowledge it honestly.
- Stay in-character with the chosen debate mode.
- Keep replies conversational and voice-friendly: 2-5 sentences, no markdown headings, no bullet lists, no code blocks. Plain spoken language."""


def build_system_prompt(mode: str, topic: str, user_stance: Optional[str], voice_char: Optional[str] = None) -> str:
    mode_prompt = DEBATE_MODES.get(mode, DEBATE_MODES["devils_advocate"])
    stance_line = ""
    if user_stance:
        stance_line = f"\nThe user's stance is: '{user_stance}'. You must argue against it (unless the user's later reasoning genuinely overpowers yours)."

    # Voice character persona tint
    voice_persona = ""
    if voice_char and voice_char in VOICE_CHARACTERS:
        vc = VOICE_CHARACTERS[voice_char]
        voice_persona = (
            f"\n\nYour speaking persona is '{vc['name']}': {vc['tagline']}. {vc['description']} "
            "This affects your tone and delivery — embody this character naturally in your responses."
        )

    return f"{BASE_PERSONA}\n\nMode: {mode_prompt}{stance_line}{voice_persona}\n\nDebate topic: \"{topic}\"."


TIME_SENSITIVE_HINTS = re.compile(
    r"\b(today|yesterday|this week|this month|this year|latest|current|recent|202[4-9]|203\d|"
    r"election|stock|price|breaking|news|inflation|rate|GDP|CEO of|as of)\b",
    re.IGNORECASE,
)


def needs_web_search(text: str) -> bool:
    return bool(TIME_SENSITIVE_HINTS.search(text or ""))


async def groq_debate_reply(system: str, history: List[dict], user_message: str) -> tuple[str, bool]:
    """Return (reply_text, used_web_search)."""
    if not groq_client:
        raise HTTPException(
            status_code=503,
            detail="GROQ_API_KEY is not configured on the server. Please set it in backend/.env and restart the backend.",
        )

    use_search = needs_web_search(user_message)
    model = "groq/compound" if use_search else "llama-3.3-70b-versatile"

    messages = [{"role": "system", "content": system}] + history + [
        {"role": "user", "content": user_message}
    ]

    try:
        completion = groq_client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.75 if not use_search else 0.55,
            max_tokens=350,
        )
        text = completion.choices[0].message.content.strip()
        tools_used = getattr(completion.choices[0].message, "executed_tools", None) or []
        used_search = bool(tools_used) or use_search
        return text, used_search
    except Exception as e:
        logger.error(f"Groq error: {e}")
        # Fallback to non-compound if compound fails
        if use_search:
            try:
                completion = groq_client.chat.completions.create(
                    model="llama-3.3-70b-versatile",
                    messages=messages,
                    temperature=0.75,
                    max_tokens=350,
                )
                return completion.choices[0].message.content.strip(), False
            except Exception as e2:
                logger.error(f"Groq fallback error: {e2}")
                raise HTTPException(status_code=502, detail=f"AI service error: {str(e2)[:120]}")
        raise HTTPException(status_code=502, detail=f"AI service error: {str(e)[:120]}")


ANALYSIS_PROMPT = """You are a debate coach analyzing a completed debate. Return STRICT JSON only (no markdown, no prose outside JSON) with this exact schema:
{
  "overall_score": <int 0-100>,
  "logic_score": <int 0-100>,
  "evidence_score": <int 0-100>,
  "critical_thinking_score": <int 0-100>,
  "persuasiveness_score": <int 0-100>,
  "communication_score": <int 0-100>,
  "confidence_score": <int 0-100>,
  "strongest_argument": "<string, 1-2 sentences quoting or paraphrasing user>",
  "weakest_argument": "<string, 1-2 sentences>",
  "biggest_assumption": "<string, 1 sentence>",
  "fallacies_detected": [<0-4 short strings, e.g. "Straw Man", "Ad Hominem">],
  "suggestions": [<3-5 short actionable strings>],
  "summary": "<string, 2-3 sentences summarizing the user's performance>"
}
Score conservatively. A truly excellent debater gets 85+. Average is 55-70."""


async def groq_generate_report(topic: str, mode: str, messages: List[dict]) -> dict:
    if not groq_client:
        raise HTTPException(status_code=503, detail="GROQ_API_KEY is not configured.")

    transcript = "\n".join(
        f"{m['role'].upper()}: {m['content']}" for m in messages if m.get("role") in ("user", "assistant")
    )
    user_prompt = f"Debate topic: {topic}\nMode: {mode}\n\nTranscript:\n{transcript}\n\nAnalyze the USER's debate performance now. Return the JSON."

    try:
        completion = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": ANALYSIS_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.3,
            max_tokens=900,
            response_format={"type": "json_object"},
        )
        raw = completion.choices[0].message.content
        return json.loads(raw)
    except Exception as e:
        logger.error(f"Report generation failed: {e}")
        # Return graceful default so UI still renders
        return {
            "overall_score": 60,
            "logic_score": 60,
            "evidence_score": 55,
            "critical_thinking_score": 60,
            "persuasiveness_score": 60,
            "communication_score": 65,
            "confidence_score": 60,
            "strongest_argument": "Analysis unavailable — the debate was too short or the AI service errored.",
            "weakest_argument": "Analysis unavailable.",
            "biggest_assumption": "Analysis unavailable.",
            "fallacies_detected": [],
            "suggestions": ["Debate for longer to enable full analysis.", "Try a different mode."],
            "summary": "Insufficient data or temporary AI service issue prevented full analysis.",
        }


# --------------------------------------------------------------------------- #
# Routes: Health
# --------------------------------------------------------------------------- #
@api.get("/")
async def root():
    return {"service": "DebateX", "status": "ok", "ai_ready": bool(groq_client)}


@api.get("/modes")
async def list_modes():
    return [
        {"id": "devils_advocate", "name": "Devil's Advocate", "desc": "Ruthless opposition. AI takes the opposite side of everything."},
        {"id": "socratic", "name": "Socratic Questioning", "desc": "Piercing questions that expose your assumptions."},
        {"id": "oxford", "name": "Oxford Debate", "desc": "Formal structured argumentation. Claim, warrant, evidence."},
        {"id": "cross_examination", "name": "Cross Examination", "desc": "Trial-lawyer style pointed questioning."},
        {"id": "rapid_fire", "name": "Rapid Fire", "desc": "Fast, punchy exchanges. Under 40 words per reply."},
        {"id": "philosophy", "name": "Philosophy", "desc": "Grounded in analytic philosophy and ethics."},
        {"id": "business", "name": "Business Strategy", "desc": "Investor-grade scrutiny: TAM, moat, GTM."},
        {"id": "friendly", "name": "Friendly Discussion", "desc": "Respectful, steelmanned counterpoints."},
    ]


@api.get("/voices")
async def list_voices():
    """Return available voice character profiles."""
    return [vc for vc in VOICE_CHARACTERS.values()]


# --------------------------------------------------------------------------- #
# Route: Text-to-Speech (Edge-TTS)
# --------------------------------------------------------------------------- #
@api.post("/tts")
async def text_to_speech(payload: TTSRequest):
    """
    Convert text to speech using Microsoft Edge-TTS.
    Returns streaming MP3 audio data.
    
    Maps voice_character to Edge-TTS voices:
      - 'sage'    -> en-US-EmmaNeural (calm, intellectual)
      - 'maverick' -> en-US-GuyNeural (sharp, authoritative)
      - default   -> en-US-JennyNeural (neutral, clear)
    """
    voice = EDGE_TTS_VOICE_MAP.get(payload.voice_character, DEFAULT_EDGE_TTS_VOICE)
    text = payload.text.strip()

    if not text:
        raise HTTPException(status_code=400, detail="Text is required")

    try:
        # Create an edge-tts Communicate instance
        communicate = edge_tts.Communicate(text=text, voice=voice)

        # Stream the audio data generator
        async def audio_stream():
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    yield chunk["data"]

        return StreamingResponse(
            audio_stream(),
            media_type="audio/mpeg",
            headers={
                "X-Edge-TTS-Voice": voice,
                "Cache-Control": "no-cache",
            },
        )
    except Exception as e:
        logger.error(f"Edge-TTS error: {e}")
        raise HTTPException(status_code=502, detail=f"Text-to-speech error: {str(e)[:200]}")


# --------------------------------------------------------------------------- #
# Routes: Auth
# --------------------------------------------------------------------------- #
@api.post("/auth/signup", response_model=AuthResponse)
async def signup(payload: UserSignup):
    email = payload.email.lower().strip()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = str(uuid.uuid4())
    doc = {
        "id": user_id,
        "email": email,
        "name": payload.name.strip(),
        "password": hash_password(payload.password),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "favorite_topics": [],
    }
    await db.users.insert_one(doc)
    token = create_token(user_id)
    return AuthResponse(token=token, user=UserPublic(id=user_id, email=email, name=payload.name))


@api.post("/auth/login", response_model=AuthResponse)
async def login(payload: UserLogin):
    email = payload.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_token(user["id"])
    return AuthResponse(token=token, user=UserPublic(id=user["id"], email=user["email"], name=user["name"]))


@api.get("/auth/me", response_model=UserPublic)
async def me(user=Depends(current_user)):
    return UserPublic(id=user["id"], email=user["email"], name=user["name"])


# --------------------------------------------------------------------------- #
# Routes: Favorite topics
# --------------------------------------------------------------------------- #
@api.get("/favorites")
async def get_favorites(user=Depends(current_user)):
    doc = await db.users.find_one({"id": user["id"]}, {"_id": 0, "favorite_topics": 1})
    return {"favorites": doc.get("favorite_topics", [])}


@api.post("/favorites")
async def add_favorite(payload: FavoriteTopic, user=Depends(current_user)):
    topic = payload.topic.strip()
    if not topic:
        raise HTTPException(status_code=400, detail="Topic required")
    await db.users.update_one({"id": user["id"]}, {"$addToSet": {"favorite_topics": topic}})
    doc = await db.users.find_one({"id": user["id"]}, {"_id": 0, "favorite_topics": 1})
    return {"favorites": doc.get("favorite_topics", [])}


@api.delete("/favorites")
async def remove_favorite(payload: FavoriteTopic, user=Depends(current_user)):
    await db.users.update_one({"id": user["id"]}, {"$pull": {"favorite_topics": payload.topic}})
    doc = await db.users.find_one({"id": user["id"]}, {"_id": 0, "favorite_topics": 1})
    return {"favorites": doc.get("favorite_topics", [])}


# --------------------------------------------------------------------------- #
# Routes: Debates
# --------------------------------------------------------------------------- #
def _debate_doc_to_out(doc: dict) -> dict:
    doc.pop("_id", None)
    return doc


@api.post("/debates", response_model=DebateOut)
async def create_debate(payload: DebateCreate, user=Depends(current_user)):
    if payload.mode not in DEBATE_MODES:
        raise HTTPException(status_code=400, detail="Invalid mode")

    # Validate voice_character if provided
    if payload.voice_character and payload.voice_character not in VOICE_CHARACTERS:
        raise HTTPException(status_code=400, detail=f"Invalid voice_character. Choose from: {', '.join(VOICE_CHARACTERS.keys())}")

    now = datetime.now(timezone.utc).isoformat()
    debate_id = str(uuid.uuid4())

    # Opening message from AI to kick off the debate
    system = build_system_prompt(payload.mode, payload.topic, payload.user_stance, payload.voice_character)
    opener_prompt = (
        f"Begin the debate on: '{payload.topic}'. Give a brief, provocative opening (2-3 sentences) "
        "that stakes out a strong opposing position and invites the user to respond. No preamble."
    )
    try:
        opener_text, used_search = await groq_debate_reply(system, [], opener_prompt)
    except HTTPException as e:
        # If AI not configured, still create the debate with a placeholder
        opener_text = f"Let's debate: {payload.topic}. Make your opening argument."
        used_search = False
        logger.warning(f"Opener fallback due to: {e.detail}")

    opener = Message(role="assistant", content=opener_text, used_web_search=used_search)

    doc = {
        "id": debate_id,
        "user_id": user["id"],
        "topic": payload.topic.strip(),
        "mode": payload.mode,
        "user_stance": payload.user_stance,
        "voice_character": payload.voice_character,
        "messages": [opener.model_dump()],
        "created_at": now,
        "updated_at": now,
        "duration_seconds": 0,
        "bookmarked": False,
        "report": None,
    }
    await db.debates.insert_one(doc)
    return _debate_doc_to_out(doc)


@api.get("/debates", response_model=List[DebateOut])
async def list_debates(user=Depends(current_user), search: Optional[str] = None, bookmarked: Optional[bool] = None):
    query: dict = {"user_id": user["id"]}
    if bookmarked is True:
        query["bookmarked"] = True
    if search:
        query["topic"] = {"$regex": re.escape(search), "$options": "i"}
    cursor = db.debates.find(query, {"_id": 0}).sort("created_at", -1).limit(200)
    return [d async for d in cursor]


@api.get("/debates/{debate_id}", response_model=DebateOut)
async def get_debate(debate_id: str, user=Depends(current_user)):
    doc = await db.debates.find_one({"id": debate_id, "user_id": user["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Debate not found")
    return doc


@api.post("/debates/turn", response_model=DebateOut)
async def debate_turn(payload: DebateTurn, user=Depends(current_user)):
    doc = await db.debates.find_one({"id": payload.debate_id, "user_id": user["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Debate not found")

    user_msg = Message(role="user", content=payload.user_message.strip())

    # Build history for groq
    history = [{"role": m["role"], "content": m["content"]} for m in doc["messages"]]
    system = build_system_prompt(doc["mode"], doc["topic"], doc.get("user_stance"), doc.get("voice_character"))
    ai_text, used_search = await groq_debate_reply(system, history, user_msg.content)
    ai_msg = Message(role="assistant", content=ai_text, used_web_search=used_search)

    now = datetime.now(timezone.utc).isoformat()
    await db.debates.update_one(
        {"id": payload.debate_id},
        {
            "$push": {"messages": {"$each": [user_msg.model_dump(), ai_msg.model_dump()]}},
            "$set": {"updated_at": now},
        },
    )
    doc = await db.debates.find_one({"id": payload.debate_id}, {"_id": 0})
    return doc


@api.post("/debates/{debate_id}/report", response_model=DebateOut)
async def finalize_debate(debate_id: str, user=Depends(current_user)):
    doc = await db.debates.find_one({"id": debate_id, "user_id": user["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Debate not found")

    # Only need a report if there's actual user content
    user_turns = [m for m in doc["messages"] if m["role"] == "user"]
    if not user_turns:
        raise HTTPException(status_code=400, detail="Debate has no user turns to analyze")

    report = await groq_generate_report(doc["topic"], doc["mode"], doc["messages"])

    # duration = time between first and last message
    try:
        first = datetime.fromisoformat(doc["messages"][0]["ts"])
        last = datetime.fromisoformat(doc["messages"][-1]["ts"])
        duration = int((last - first).total_seconds())
    except Exception:
        duration = 0

    await db.debates.update_one(
        {"id": debate_id},
        {"$set": {"report": report, "duration_seconds": max(duration, 0), "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    doc = await db.debates.find_one({"id": debate_id}, {"_id": 0})
    return doc


@api.patch("/debates/{debate_id}/bookmark", response_model=DebateOut)
async def toggle_bookmark(debate_id: str, payload: BookmarkToggle, user=Depends(current_user)):
    result = await db.debates.update_one(
        {"id": debate_id, "user_id": user["id"]},
        {"$set": {"bookmarked": payload.bookmarked}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Debate not found")
    doc = await db.debates.find_one({"id": debate_id}, {"_id": 0})
    return doc


@api.delete("/debates/{debate_id}")
async def delete_debate(debate_id: str, user=Depends(current_user)):
    result = await db.debates.delete_one({"id": debate_id, "user_id": user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Debate not found")
    return {"ok": True}


# --------------------------------------------------------------------------- #
# Routes: Dashboard aggregates
# --------------------------------------------------------------------------- #
@api.get("/dashboard")
async def dashboard(user=Depends(current_user)):
    debates = await db.debates.find({"user_id": user["id"]}, {"_id": 0}).to_list(1000)

    total = len(debates)
    total_seconds = sum(d.get("duration_seconds", 0) for d in debates)
    reports = [d["report"] for d in debates if d.get("report")]
    avg_score = round(sum(r.get("overall_score", 0) for r in reports) / len(reports), 1) if reports else 0

    # improvement over time (chronological overall_score)
    improvement = [
        {"date": d["created_at"], "score": d["report"]["overall_score"]}
        for d in sorted(debates, key=lambda x: x["created_at"])
        if d.get("report") and "overall_score" in d["report"]
    ]

    # favorite topics (by frequency)
    topic_counts: dict = {}
    for d in debates:
        topic_counts[d["topic"]] = topic_counts.get(d["topic"], 0) + 1
    fav_topics = sorted(topic_counts.items(), key=lambda x: -x[1])[:5]

    # common fallacies
    fallacy_counts: dict = {}
    for r in reports:
        for f in r.get("fallacies_detected", []) or []:
            fallacy_counts[f] = fallacy_counts.get(f, 0) + 1
    common_fallacies = sorted(fallacy_counts.items(), key=lambda x: -x[1])[:5]

    recent = sorted(debates, key=lambda x: x["created_at"], reverse=True)[:5]

    return {
        "total_debates": total,
        "total_hours": round(total_seconds / 3600, 2),
        "average_score": avg_score,
        "improvement": improvement,
        "favorite_topics": [{"topic": t, "count": c} for t, c in fav_topics],
        "common_fallacies": [{"name": n, "count": c} for n, c in common_fallacies],
        "recent_debates": recent,
    }


# --------------------------------------------------------------------------- #
# App wiring
# --------------------------------------------------------------------------- #
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown():
    mongo.close()