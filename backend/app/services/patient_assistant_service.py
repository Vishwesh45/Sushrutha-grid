"""
Rule-gated patient visit assistant (multi-visit aware).

Flow:
  1) Classify intent with rules (allow / refuse / emergency)
  2) Build context from this patient's Rx / visits / tokens / follow-ups
  3) Focus on a selected prescription when the patient has several
  4) LLM answers naturally from that context (or templates if no API key)
  5) Post-filter blocks doctor-like / out-of-scope phrasing
"""
from __future__ import annotations

import json
import re
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import httpx

from app import config


REFUSE_REPLY = (
    "I can only help with your own Sushrutha prescription, dosage, missed-dose questions, "
    "follow-up, investigations on your slip, diet advice written by your doctor, "
    "token/queue status, and department for your visit. "
    "I cannot diagnose, suggest new remedies, or act like a doctor. "
    "Please ask your doctor or hospital desk for anything else."
)

EMERGENCY_REPLY = (
    "If this feels like an emergency (severe pain, breathing trouble, heavy bleeding, "
    "fainting, chest pain), go to the nearest emergency desk or call 108 now. "
    "This app helper cannot manage emergencies."
)

SYSTEM_PROMPT = """You are a warm, clear helper inside Sushrutha Grid (Karnataka government hospital app).
Speak like a helpful hospital desk volunteer — natural, short, human. You are NOT a doctor.

STRICT RULES:
- Use ONLY the PATIENT CONTEXT JSON. Never invent medicines, doses, diagnoses, or remedies.
- The patient may have SEVERAL prescriptions. If FOCUS_PRESCRIPTION_ID is set, answer from that Rx and name it.
- If several Rx exist and the question is about medicines/dose/follow-up but no focus is set, ask which visit/Rx (list the short labels) instead of mixing them.
- Allowed: medicines on the slip, dosage/frequency/timing, missed dose (do not double-dose unless slip says; ask doctor/desk), follow-up dates, investigations, diet text on slip, department, token/queue, reading diagnosis wording on the slip.
- If something is missing from context, say so kindly and suggest the hospital desk.
- Never prescribe, diagnose, compare treatments, or give home remedies.
- Tone: conversational (1–4 short paragraphs or bullets). No robotic headers unless listing medicines.
- End with one short line: "This only explains what is already on your slip — not new medical advice."
"""

_EMERGENCY = re.compile(
    r"\b(chest pain|can'?t breathe|cannot breathe|breathing (hard|difficulty)|"
    r"heavy bleeding|unconscious|faint(ed|ing)?|stroke|heart attack|seizure|"
    r"suicid|overdose)\b",
    re.I,
)

_BLOCK = re.compile(
    r"\b(diagnos(e|is|ing)|do i have|is it cancer|home remed|remed(y|ies)|"
    r"ayurved|herbal|natural cure|which doctor is better|compare (doctor|hospital|medicine)|"
    r"should i stop|increase (the )?dose|decrease (the )?dose|alternative (medicine|drug)|"
    r"what antibiotic|prescribe|self[- ]?medicat|treat me|cure me|"
    r"best (medicine|treatment) for|is .* contagious)\b",
    re.I,
)

_ALLOW = re.compile(
    r"\b(prescription|rx|medicine|medication|tablet|capsule|syrup|dose|dosage|"
    r"frequency|timing|when (do|should) i take|miss(ed)? (a |my )?dose|forgot|"
    r"skip(ped)?|follow[- ]?up|appointment|investigation|test(s)?|lab|"
    r"diet|lifestyle|advice|treatment|slip|"
    r"what did (the )?doctor (give|write|advise)|department|token|queue|"
    r"waiting|chamber|room|how many days|duration|before food|after food|"
    r"my (last|latest|previous|other) (visit|rx|prescription)|which visit)\b",
    re.I,
)

_RX_TOPIC = re.compile(
    r"\b(medicine|medication|tablet|capsule|syrup|dose|dosage|frequency|timing|"
    r"miss(ed)?|forgot|prescription|rx|follow[- ]?up|investigation|test|diet|"
    r"when (do|should) i take|advice)\b",
    re.I,
)


def classify_intent(question: str) -> Tuple[str, bool]:
    q = (question or "").strip()
    if not q:
        return "empty", False
    if _EMERGENCY.search(q):
        return "emergency", False
    if _BLOCK.search(q):
        return "blocked", False
    if _ALLOW.search(q):
        return "visit_scope", True
    return "out_of_scope", False


def _llm_endpoint() -> Tuple[Optional[str], Optional[str], str]:
    provider = config.PATIENT_LLM_PROVIDER
    if provider in ("off", "none", "disabled"):
        return None, None, ""
    if provider == "groq":
        return (config.GROQ_API_KEY or None), "https://api.groq.com/openai/v1", (
            config.PATIENT_LLM_MODEL or "llama-3.3-70b-versatile"
        )
    if provider == "xai":
        return (config.XAI_API_KEY or None), (config.XAI_BASE_URL or "https://api.x.ai/v1"), (
            config.PATIENT_LLM_MODEL or "grok-2-latest"
        )
    return (config.OPENAI_API_KEY or None), (config.OPENAI_BASE_URL or "https://api.openai.com/v1"), (
        config.PATIENT_LLM_MODEL or "gpt-4o-mini"
    )


def llm_is_configured() -> bool:
    key, _, _ = _llm_endpoint()
    return bool(key)


def _fmt_day(iso_str: Optional[str]) -> str:
    if not iso_str:
        return "—"
    raw = str(iso_str).replace("Z", "")[:10]
    try:
        return datetime.strptime(raw, "%Y-%m-%d").strftime("%d %b %Y")
    except ValueError:
        return raw


def _visit_label(rx: Dict[str, Any], index: int) -> str:
    dept = rx.get("department") or "OPD"
    day = _fmt_day(rx.get("issued_at"))
    dx = (rx.get("clinical_diagnosis") or "").strip()
    short_dx = (dx[:28] + "…") if len(dx) > 28 else dx
    base = f"Visit {index} · {day} · {dept}"
    return f"{base} · {short_dx}" if short_dx else base


def build_patient_context(db, patient_id: str) -> Dict[str, Any]:
    prescriptions = list(
        db.prescriptions.find({"patient_id": patient_id}, {"_id": 0})
        .sort("issued_at", -1)
        .limit(8)
    )
    consultations = list(
        db.consultations.find({"patient_id": patient_id})
        .sort("created_at", -1)
        .limit(8)
    )

    consult_slim = [{
        "consultation_id": str(c.get("_id")),
        "chief_complaint": c.get("chief_complaint"),
        "department": c.get("department") or c.get("recommended_department"),
        "priority": c.get("priority"),
        "status": c.get("status"),
        "created_at": c.get("created_at"),
        "prescription_id": c.get("prescription_id"),
        "hospital_name": c.get("hospital_name"),
    } for c in consultations]

    rx_slim = []
    visit_options = []
    for i, rx in enumerate(prescriptions, start=1):
        meds = [{
            "medicine_name": m.get("medicine_name"),
            "dosage": m.get("dosage"),
            "frequency": m.get("frequency"),
            "timing": m.get("timing"),
            "duration": m.get("duration"),
            "instructions": m.get("instructions"),
        } for m in (rx.get("medications") or [])]
        row = {
            "visit_index": i,
            "visit_label": _visit_label(rx, i),
            "prescription_id": rx.get("prescription_id"),
            "issued_at": rx.get("issued_at"),
            "doctor_name": rx.get("doctor_name"),
            "department": rx.get("department"),
            "clinical_diagnosis": rx.get("clinical_diagnosis"),
            "medications": meds,
            "investigations_advised": rx.get("investigations_advised") or [],
            "diet_lifestyle_advice": rx.get("diet_lifestyle_advice"),
            "follow_up_date": rx.get("follow_up_date"),
            "follow_up_on": rx.get("follow_up_on"),
            "hospital_name": rx.get("hospital_name"),
        }
        rx_slim.append(row)
        if row.get("prescription_id"):
            visit_options.append({
                "prescription_id": row["prescription_id"],
                "label": row["visit_label"],
                "issued_at": row.get("issued_at"),
                "department": row.get("department"),
                "diagnosis": row.get("clinical_diagnosis"),
            })

    tokens = list(
        db.opd_tokens.find(
            {"patient_id": patient_id, "status": {"$in": ["WAITING", "CALLED", "IN_CONSULTATION", "SKIPPED"]}},
            {"_id": 0},
        ).sort("created_at", -1).limit(3)
    )
    token_slim = [{
        "token_number": t.get("token_number"),
        "status": t.get("status"),
        "department": t.get("department"),
        "assigned_doctor_name": t.get("assigned_doctor_name"),
        "assigned_room": t.get("assigned_room") or t.get("room_number"),
        "queue_position": t.get("queue_position"),
        "estimated_wait_minutes": t.get("estimated_wait_minutes"),
    } for t in tokens]

    try:
        followups = list(
            db.follow_up_appointments.find(
                {"patient_id": patient_id, "status": {"$in": ["scheduled", "missed"]}},
                {"_id": 0},
            ).sort("follow_up_on", -1).limit(5)
        )
    except Exception:
        followups = []

    fu_slim = [{
        "follow_up_on": f.get("follow_up_on"),
        "department": f.get("department"),
        "prescription_id": f.get("prescription_id"),
        "status": f.get("status"),
        "follow_up_advice": f.get("follow_up_advice") or f.get("notes"),
    } for f in followups]

    labels: List[str] = []
    if rx_slim:
        labels.append(f"{len(rx_slim)} prescription(s)")
    if consult_slim:
        labels.append(f"{len(consult_slim)} visit(s)")
    if token_slim:
        labels.append("active token")
    if fu_slim:
        labels.append("follow-up(s)")

    return {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "prescriptions": rx_slim,
        "consultations": consult_slim,
        "active_tokens": token_slim,
        "follow_ups": fu_slim,
        "visit_options": visit_options,
        "context_labels": labels,
        "has_records": bool(rx_slim or consult_slim or token_slim or fu_slim),
    }


def _focus_context(ctx: Dict[str, Any], prescription_id: Optional[str]) -> Dict[str, Any]:
    focused = dict(ctx)
    pid = (prescription_id or "").strip()
    if not pid:
        focused["focus_prescription_id"] = None
        focused["focused_prescription"] = None
        return focused

    match = next((r for r in (ctx.get("prescriptions") or []) if r.get("prescription_id") == pid), None)
    focused["focus_prescription_id"] = pid if match else None
    focused["focused_prescription"] = match
    if match:
        # Keep full list for awareness, but highlight focus
        focused["context_labels"] = list(ctx.get("context_labels") or []) + [f"focused {pid}"]
    return focused


def _needs_visit_pick(question: str, ctx: Dict[str, Any], prescription_id: Optional[str]) -> bool:
    if prescription_id:
        return False
    rx_list = ctx.get("prescriptions") or []
    if len(rx_list) < 2:
        return False
    # Token/queue questions don't need a Rx pick
    q = question.lower()
    if any(w in q for w in ("token", "queue", "waiting", "chamber", "room")):
        return False
    return bool(_RX_TOPIC.search(question))


def _pick_prompt(visit_options: List[Dict[str, Any]]) -> str:
    lines = [
        "You have more than one treatment record. Which visit should I look at?",
    ]
    for v in visit_options[:6]:
        lines.append(f"• {v.get('label')} ({v.get('prescription_id')})")
    lines.append("Tap a visit above, or say the date/department in your question.")
    return "\n".join(lines)


def _template_answer(question: str, ctx: Dict[str, Any]) -> str:
    q = question.lower()
    lines: List[str] = []

    if not ctx.get("has_records"):
        return (
            "I don't see a visit or prescription on your account yet. "
            "Once your doctor issues a digital Rx, ask me about medicines, dose, or follow-up.\n"
            "This only explains what is already on your slip — not new medical advice."
        )

    if any(w in q for w in ("token", "queue", "waiting", "chamber", "room")) and ctx.get("active_tokens"):
        t = ctx["active_tokens"][0]
        lines.append(
            f"Right now token {t.get('token_number')} is marked {t.get('status')} "
            f"for {t.get('department') or 'OPD'}"
            + (f" with {t.get('assigned_doctor_name')}" if t.get("assigned_doctor_name") else "")
            + (f" in room {t.get('assigned_room')}" if t.get("assigned_room") else "")
            + "."
        )
        if t.get("queue_position") is not None:
            lines.append(f"You're at queue position {t.get('queue_position')}.")

    focused = ctx.get("focused_prescription")
    rx_list = [focused] if focused else (ctx.get("prescriptions") or [])
    rx_list = [r for r in rx_list if r]

    if rx_list and any(w in q for w in (
        "medicine", "tablet", "dose", "dosage", "prescription", "rx",
        "frequency", "timing", "miss", "forgot", "take",
    )):
        for rx in rx_list[:1]:
            lines.append(
                f"Looking at {rx.get('visit_label') or rx.get('prescription_id')} "
                f"({rx.get('doctor_name') or 'your doctor'}):"
            )
            meds = rx.get("medications") or []
            if not meds:
                lines.append("No medicines are listed on this slip.")
            for m in meds:
                lines.append(
                    f"• {m.get('medicine_name')}: {m.get('dosage')}, {m.get('frequency')}, "
                    f"{m.get('timing')}, for {m.get('duration')}"
                    + (f" — {m.get('instructions')}" if m.get("instructions") else "")
                )
            if any(w in q for w in ("miss", "forgot", "skip")):
                lines.append(
                    "If you missed a dose: don't take a double dose unless the slip says so. "
                    "Take the next one at the usual time, and check with the doctor or pharmacy desk if you're unsure."
                )

    if rx_list and any(w in q for w in ("follow", "appointment")):
        rx = rx_list[0]
        fu = rx.get("follow_up_on") or rx.get("follow_up_date")
        if fu:
            lines.append(f"On this slip, follow-up is noted as: {fu}.")
        elif ctx.get("follow_ups"):
            live = [f for f in ctx["follow_ups"] if f.get("status") == "scheduled"]
            if live:
                lines.append(f"Your next scheduled follow-up on record is {live[0].get('follow_up_on')}.")
            else:
                lines.append("I don't see an upcoming follow-up date on your latest slip.")
        else:
            lines.append("No follow-up date is written on this prescription.")

    if rx_list and any(w in q for w in ("diet", "lifestyle", "advice", "investigation", "test", "lab")):
        rx = rx_list[0]
        if rx.get("investigations_advised"):
            lines.append("Tests on this slip: " + ", ".join(rx["investigations_advised"]) + ".")
        if rx.get("diet_lifestyle_advice"):
            lines.append("Diet / lifestyle on this slip: " + rx["diet_lifestyle_advice"])

    if any(w in q for w in ("department", "complaint", "visit")) and ctx.get("consultations"):
        c = ctx["consultations"][0]
        lines.append(
            f"Your latest visit was routed to {c.get('department') or '—'}. "
            f"Complaint on file: {c.get('chief_complaint') or '—'}."
        )

    if not lines:
        opts = ctx.get("visit_options") or []
        if len(opts) > 1:
            lines.append(
                f"I can see {len(opts)} treatment records. Pick a visit, then ask about medicines, dose, or follow-up."
            )
        else:
            lines.append(
                "Ask me about medicines, dosage, a missed dose, follow-up, tests on the slip, "
                "diet advice, department, or token status."
            )

    lines.append("This only explains what is already on your slip — not new medical advice.")
    return "\n".join(lines)


_POST_BLOCK = re.compile(
    r"\b(you (may |might |should )?have|i (diagnose|prescribe)|home remed|"
    r"try (this|taking)|ayurved|herbal cure|instead of your (doctor|medicine))\b",
    re.I,
)


def _post_filter(answer: str) -> str:
    if not answer:
        return REFUSE_REPLY
    if _POST_BLOCK.search(answer):
        return (
            "I almost stepped outside your written slip, so I stopped. "
            + REFUSE_REPLY
        )
    return answer.strip()


def call_llm(
    question: str,
    ctx: Dict[str, Any],
    history: Optional[List[Dict[str, str]]] = None,
) -> Optional[str]:
    key, base, model = _llm_endpoint()
    if not key or not base:
        return None

    hist = (history or [])[-6:]
    hist_lines = []
    for turn in hist:
        role = turn.get("role") or "user"
        text = (turn.get("text") or "").strip()
        if text:
            hist_lines.append(f"{role.upper()}: {text}")

    user_content = (
        "PATIENT CONTEXT JSON:\n"
        + json.dumps(ctx, ensure_ascii=False, default=str)[:14000]
        + "\n\nFOCUS_PRESCRIPTION_ID: "
        + str(ctx.get("focus_prescription_id") or "none")
        + "\n\nRECENT CHAT:\n"
        + ("\n".join(hist_lines) if hist_lines else "(none)")
        + "\n\nPATIENT QUESTION:\n"
        + question.strip()
    )
    payload = {
        "model": model,
        "temperature": 0.45,
        "max_tokens": 500,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
    }
    try:
        with httpx.Client(timeout=45.0) as client:
            res = client.post(
                f"{base.rstrip('/')}/chat/completions",
                headers={
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            res.raise_for_status()
            data = res.json()
            return (data["choices"][0]["message"]["content"] or "").strip()
    except Exception:
        return None


def answer_patient_question(
    db,
    patient_id: str,
    question: str,
    prescription_id: Optional[str] = None,
    history: Optional[List[Dict[str, str]]] = None,
) -> Dict[str, Any]:
    intent, allowed = classify_intent(question)
    configured = llm_is_configured()
    base = {
        "focused_prescription_id": None,
        "visit_options": [],
        "needs_visit_pick": False,
        "llm_configured": configured,
    }

    if intent == "emergency":
        return {
            **base,
            "allowed": False,
            "intent": intent,
            "answer": EMERGENCY_REPLY,
            "source": "rules_refuse",
            "used_llm": False,
            "context_used": [],
        }

    if not allowed:
        return {
            **base,
            "allowed": False,
            "intent": intent,
            "answer": REFUSE_REPLY,
            "source": "rules_refuse",
            "used_llm": False,
            "context_used": [],
        }

    ctx = build_patient_context(db, patient_id)
    visit_options = ctx.get("visit_options") or []
    base["visit_options"] = visit_options

    if _needs_visit_pick(question, ctx, prescription_id):
        return {
            **base,
            "allowed": True,
            "intent": "needs_visit_pick",
            "answer": _pick_prompt(visit_options),
            "source": "rules_template",
            "used_llm": False,
            "context_used": ctx.get("context_labels") or [],
            "needs_visit_pick": True,
        }

    focused_ctx = _focus_context(ctx, prescription_id)
    labels = focused_ctx.get("context_labels") or []
    focus_id = focused_ctx.get("focus_prescription_id")

    hist_payload = [
        {"role": h.get("role"), "text": h.get("text")}
        for h in (history or [])
        if h.get("role") in ("user", "assistant") and h.get("text")
    ]

    llm_text = call_llm(question, focused_ctx, hist_payload) if configured else None
    if llm_text:
        return {
            **base,
            "allowed": True,
            "intent": intent,
            "answer": _post_filter(llm_text),
            "source": "llm",
            "used_llm": True,
            "context_used": labels,
            "focused_prescription_id": focus_id,
        }

    return {
        **base,
        "allowed": True,
        "intent": intent,
        "answer": _template_answer(question, focused_ctx),
        "source": "llm_fallback" if configured else "rules_template",
        "used_llm": False,
        "context_used": labels,
        "focused_prescription_id": focus_id,
    }
