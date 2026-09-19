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

    if any(x in lower for x in ["pricing", "price", "cost", "quotation", "quote", "budget"]):
        insights.append("Pricing or commercial terms were discussed.")
    if any(x in lower for x in ["competitor", "competition", "alternative", "vendor"]):
        insights.append("A competitor or alternative vendor was mentioned.")
    if any(x in lower for x in ["demo", "requirement", "feature", "technical", "integration"]):
        insights.append("Product requirements or technical validation was discussed.")
    if any(x in lower for x in ["interested", "interest", "purchase", "buy", "proposal", "order"]):
        insights.append("The customer showed a buying or evaluation signal.")
    if any(x in lower for x in ["complaint", "angry", "frustrated", "problem", "issue", "delay", "unhappy"]):
        insights.append("A customer concern, issue, or frustration was reported.")
    if not insights:
        insights.append("No separate commercial concern was explicitly detected in the transcript.")

    if any(x in lower for x in ["tomorrow", "send", "share", "call", "follow up", "follow-up", "meeting", "demo", "quotation", "quote"]):
        actions.append("Follow up on the commitment mentioned in the field note.")
    else:
        actions.append("Review the visit and add any required follow-up.")

    negative = any(x in lower for x in ["angry", "frustrated", "unhappy", "complaint", "negative", "problem", "issue"])
    positive = any(x in lower for x in ["interested", "happy", "satisfied", "positive", "excited", "good", "agree"])
    sentiment = "MIXED" if negative and positive else "NEGATIVE" if negative else "POSITIVE" if positive else "NEUTRAL"

    high_opp = any(x in lower for x in ["very interested", "high interest", "purchase", "buy", "order", "proposal", "budget approved"])
    medium_opp = any(x in lower for x in ["interested", "demo", "pricing", "quotation", "quote"])

    return {
        "summary": text or "Field visit recorded.",
        "sentiment": sentiment,
        "key_insights": insights,
        "action_items": actions,
        "alerts": [],
        "opportunity_signal": "HIGH" if high_opp else "MEDIUM" if medium_opp else "LOW",
        "risk_signal": "HIGH" if negative and any(x in lower for x in ["complaint", "angry", "escalate"]) else "MEDIUM" if negative else "LOW",
    }


def analyze_transcription(transcription: str) -> dict:
    transcript = (transcription or "").strip()

    if not transcript:
        return _local_fallback("")

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

Important:
1. Preserve names, dates, amounts, products, competitors, requests, and commitments only when spoken.
2. Do not create generic filler such as "review the visit" when the transcript contains a real action.
3. Every key insight must be traceable to something actually said.
4. Prefer specific commercial details over vague observations.
5. Keep key_insights and action_items as plain strings.

Transcript:
{transcript}
""".strip()

    last_error = None

    for attempt in range(3):
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
            last_error = exc
            if attempt < 2:
                time.sleep(2 ** attempt)

    # Never break the voice-note workflow only because the LLM is temporarily unavailable.
    # The UI will still receive a useful, transcript-grounded analysis.
    fallback = _local_fallback(transcript)
    fallback["analysis_fallback"] = True
    fallback["analysis_error"] = str(last_error) if last_error else None
    return fallback
