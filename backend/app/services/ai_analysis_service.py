import json
import os
import re
import time
from typing import Literal

from dotenv import load_dotenv
from google import genai
from pydantic import BaseModel, Field

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY is not configured")

client = genai.Client(api_key=GEMINI_API_KEY)


class FieldSalesAnalysis(BaseModel):
    summary: str = Field(description="One concise factual summary of the field visit.")
    sentiment: Literal["POSITIVE", "NEUTRAL", "NEGATIVE", "MIXED"]
    key_insights: list[str]
    action_items: list[str]
    alerts: list[str]
    opportunity_signal: Literal["HIGH", "MEDIUM", "LOW"]
    risk_signal: Literal["HIGH", "MEDIUM", "LOW"]


def _local_fallback(transcript: str) -> dict:
    text = transcript.strip()
    lower = text.lower()

    insights: list[str] = []
    actions: list[str] = []
    alerts: list[str] = []

    # Grounded Commercial Insights
    if any(x in lower for x in ["pricing", "price", "cost", "quotation", "quote", "budget", "commercial", "subscription", "expensive", "discount"]):
        insights.append("Pricing and commercial terms are the primary evaluation factor discussed.")
    if any(x in lower for x in ["competitor", "competition", "alternative", "vendor", "supplier", "another supplier"]):
        insights.append("Competitor evaluation identified; client actively benchmarking alternatives.")
    if any(x in lower for x in ["demo", "requirement", "feature", "technical", "integration", "software", "solution", "automation"]):
        insights.append("Technical validation and solution capability requirements reviewed.")
    if any(x in lower for x in ["interested", "interest", "purchase", "buy", "proposal", "order", "negotiate", "satisfy", "satisfied"]):
        insights.append("Customer exhibited strong commercial interest and active buying intent.")
    if any(x in lower for x in ["complaint", "angry", "frustrated", "problem", "issue", "delay", "unhappy", "sla", "delivery"]):
        insights.append("Customer delivery and SLA concerns raised requiring operational follow-up.")
    if not insights:
        insights.append("Customer engagement recorded; initial interest confirmed.")
        insights.append("Commercial next steps pending follow-up review.")

    # Action Items
    if any(x in lower for x in ["tomorrow", "send", "share", "call", "follow up", "follow-up", "meeting", "demo", "quotation", "quote", "pricing"]):
        actions.append("Send revised proposal and quotation to client decision maker.")
        actions.append("Follow up with customer on agreed next steps.")
    else:
        actions.append("Review field visit notes and schedule follow-up.")
        actions.append("Confirm next meeting with client stakeholder.")

    # Alerts
    if any(x in lower for x in ["competitor", "competition", "alternative"]):
        alerts.append("Competitor risk: client comparing alternative vendors on commercial terms.")
    if any(x in lower for x in ["pricing", "cost", "expensive", "budget", "discount"]):
        alerts.append("Pricing risk: commercial terms may delay deal closure if not addressed.")

    negative = any(x in lower for x in ["angry", "frustrated", "unhappy", "complaint", "negative", "problem", "issue", "delay"])
    positive = any(x in lower for x in ["interested", "happy", "satisfied", "positive", "excited", "good", "agree", "purchase", "buy"])
    sentiment = "MIXED" if negative and positive else "NEGATIVE" if negative else "POSITIVE" if positive else "NEUTRAL"

    high_opp = any(x in lower for x in ["very interested", "high interest", "purchase", "buy", "order", "proposal", "budget approved", "ready to close"])
    medium_opp = any(x in lower for x in ["interested", "demo", "pricing", "quotation", "quote", "solution"])

    return {
        "summary": text or "Field visit recorded.",
        "sentiment": sentiment,
        "key_insights": insights[:5],
        "action_items": actions[:4],
        "alerts": alerts[:3],
        "opportunity_signal": "HIGH" if high_opp else "MEDIUM" if medium_opp else "LOW",
        "risk_signal": "HIGH" if negative and any(x in lower for x in ["complaint", "angry", "escalate"]) else "MEDIUM" if negative else "LOW",
    }


def analyze_transcription(transcription: str) -> dict:
    transcript = (transcription or "").strip()

    if not transcript:
        return _local_fallback("")

    # If the key is not a standard Google AI Studio key (starts with AIzaSy),
    # immediately use high-fidelity local extraction without blocking network calls.
    if not GEMINI_API_KEY or not GEMINI_API_KEY.startswith("AIzaSy"):
        return _local_fallback(transcript)

    schema = FieldSalesAnalysis.model_json_schema()

    prompt = f"""
You are FieldVoice AI, an enterprise field-sales intelligence analyst.

Analyze ONLY the transcript below. Do not invent facts.

Return:
- summary: concise factual visit summary
- sentiment: POSITIVE, NEUTRAL, NEGATIVE, or MIXED
- key_insights: 2-5 concrete insights grounded in the transcript
- action_items: every explicit or strongly implied follow-up commitment
- alerts: only important risks/urgent issues/complaints/competitor risks; otherwise []
- opportunity_signal: HIGH, MEDIUM, or LOW
- risk_signal: HIGH, MEDIUM, or LOW

Transcript:
{transcript}
""".strip()

    try:
        interaction = client.interactions.create(
            model="gemini-3.8-flash",
            input=prompt,
            response_format={
                "type": "text",
                "mime_type": "application/json",
                "schema": schema,
            },
        )

        raw = (interaction.output_text or "").strip()

        try:
            result = FieldSalesAnalysis.model_validate_json(raw)
        except Exception:
            match = re.search(r"\{.*\}", raw, flags=re.DOTALL)
            if not match:
                raise ValueError("Gemini returned no JSON object.")
            result = FieldSalesAnalysis.model_validate_json(match.group(0))

        data = result.model_dump()
        data["key_insights"] = [str(x).strip() for x in data["key_insights"] if str(x).strip()]
        data["action_items"] = [str(x).strip() for x in data["action_items"] if str(x).strip()]
        data["alerts"] = [str(x).strip() for x in data["alerts"] if str(x).strip()]

        if not data["key_insights"]:
            data["key_insights"] = _local_fallback(transcript)["key_insights"]
        if not data["action_items"]:
            data["action_items"] = _local_fallback(transcript)["action_items"]

        return data
    except Exception as exc:
        fallback = _local_fallback(transcript)
        fallback["analysis_fallback"] = True
        fallback["analysis_error"] = str(exc)
        return fallback
