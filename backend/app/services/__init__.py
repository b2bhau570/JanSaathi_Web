"""
Jan Saathi AI — AI Service (mock / rule-based implementation).

All AI-generated content is clearly labelled as such.

⚠  DEVELOPMENT PROTOTYPE — outputs are for demonstration only.
"""

from __future__ import annotations

import re
from abc import ABC, abstractmethod

from pydantic import BaseModel, Field


# ═══════════════════════════════════════════════════════════════════════════
# Strict I/O schemas
# ═══════════════════════════════════════════════════════════════════════════
class FollowUpInput(BaseModel):
    chief_complaint: str
    existing_answers: list[dict[str, str]] = Field(
        default_factory=list,
        description="List of {'question': ..., 'answer': ...} dicts from the interview so far.",
    )


class FollowUpOutput(BaseModel):
    questions: list[str]
    source: str = "ai"
    disclaimer: str = (
        "AI-GENERATED — These follow-up questions are produced by an automated "
        "system and have NOT been reviewed by a clinician."
    )


class SymptomSummaryInput(BaseModel):
    chief_complaint: str
    responses: list[dict[str, str]] = Field(default_factory=list)
    severity: str | None = None


class SymptomSummaryOutput(BaseModel):
    summary: str
    source: str = "ai"
    disclaimer: str = (
        "AI-GENERATED — This summary is produced by an automated system "
        "and must be reviewed by a qualified clinician before any clinical use."
    )


# ═══════════════════════════════════════════════════════════════════════════
# Abstract interface
# ═══════════════════════════════════════════════════════════════════════════
class AIService(ABC):
    @abstractmethod
    def generate_follow_up_questions(self, inp: FollowUpInput) -> FollowUpOutput:
        ...

    @abstractmethod
    def generate_symptom_summary(self, inp: SymptomSummaryInput) -> SymptomSummaryOutput:
        ...


# ═══════════════════════════════════════════════════════════════════════════
# Mock / rule-based implementation
# ═══════════════════════════════════════════════════════════════════════════
# Keyword → relevant follow-up questions mapping.
_KEYWORD_QUESTIONS: dict[str, list[str]] = {
    "chest pain": [
        "Is the pain sharp, dull, or pressure-like?",
        "Does the pain radiate to your arm, jaw, or back?",
        "Does the pain worsen with physical activity or deep breathing?",
        "Have you experienced shortness of breath, sweating, or nausea along with the pain?",
    ],
    "headache": [
        "Where exactly is the headache located (front, sides, back)?",
        "How would you rate the pain on a scale of 1–10?",
        "Have you experienced any visual changes, nausea, or sensitivity to light?",
        "When did the headache start and has it been getting worse?",
    ],
    "fever": [
        "What is your current temperature (if measured)?",
        "How long have you had the fever?",
        "Do you have any other symptoms such as chills, body aches, or sore throat?",
        "Have you recently traveled or been in contact with someone who was ill?",
    ],
    "cough": [
        "Is the cough dry or producing phlegm?",
        "If producing phlegm, what colour is it?",
        "How long have you had the cough?",
        "Do you have any difficulty breathing or wheezing?",
    ],
    "abdominal pain": [
        "Where in the abdomen is the pain located?",
        "Is the pain constant or does it come and go?",
        "Have you experienced any nausea, vomiting, or changes in bowel habits?",
        "When did the pain start and what were you doing at the time?",
    ],
    "breathing": [
        "Do you feel short of breath at rest or only during activity?",
        "Do you have any history of asthma or other lung conditions?",
        "Have you noticed any wheezing or chest tightness?",
        "Is the difficulty breathing getting worse over time?",
    ],
    "dizziness": [
        "Does the room seem to spin, or do you feel lightheaded?",
        "Have you fainted or nearly fainted?",
        "Does the dizziness worsen when you change position?",
        "Are you currently taking any medications?",
    ],
    "injury": [
        "How did the injury occur?",
        "Is there visible swelling, bruising, or deformity?",
        "Can you move the affected area?",
        "Are you experiencing numbness or tingling?",
    ],
    "skin": [
        "Where on the body is the skin issue?",
        "Is there itching, pain, or burning?",
        "Have you noticed any changes in size or colour?",
        "Have you been exposed to any new products, foods, or environments recently?",
    ],
}

_GENERIC_QUESTIONS: list[str] = [
    "When did you first notice this problem?",
    "Has this happened before? If so, how was it treated?",
    "Are you currently taking any medications or supplements?",
    "Do you have any known allergies?",
    "Is there anything that makes the symptoms better or worse?",
]


class MockAIService(AIService):
    """
    Rule-based implementation that selects follow-up questions based on
    keyword matching against the chief complaint.  Suitable for development
    and demo; no network calls or GPU required.
    """

    def generate_follow_up_questions(self, inp: FollowUpInput) -> FollowUpOutput:
        complaint_lower = inp.chief_complaint.lower()
        asked = {a.get("question", "") for a in inp.existing_answers}

        questions: list[str] = []

        # Match keywords
        for keyword, qs in _KEYWORD_QUESTIONS.items():
            if keyword in complaint_lower:
                for q in qs:
                    if q not in asked and q not in questions:
                        questions.append(q)

        # If nothing matched (or too few), fall back to generic
        if len(questions) < 3:
            for q in _GENERIC_QUESTIONS:
                if q not in asked and q not in questions:
                    questions.append(q)
                if len(questions) >= 5:
                    break

        # Cap at 5
        return FollowUpOutput(questions=questions[:5])

    def generate_symptom_summary(self, inp: SymptomSummaryInput) -> SymptomSummaryOutput:
        parts: list[str] = [
            "[AI-GENERATED SUMMARY — NOT CLINICALLY VALIDATED]",
            "",
            f"Chief complaint: {inp.chief_complaint}",
        ]
        if inp.severity:
            parts.append(f"Self-reported severity: {inp.severity}")

        if inp.responses:
            parts.append("")
            parts.append("Interview responses:")
            for i, r in enumerate(inp.responses, 1):
                q = r.get("question", "N/A")
                a = r.get("answer", "N/A")
                parts.append(f"  {i}. Q: {q}")
                parts.append(f"     A: {a}")

        return SymptomSummaryOutput(summary="\n".join(parts))


# Module-level singleton
ai_service: AIService = MockAIService()
