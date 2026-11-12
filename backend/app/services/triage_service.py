"""
Jan Saathi AI — Rule-based triage service.

⚠  DEVELOPMENT EXAMPLES — NOT CLINICALLY APPROVED.
All triage rules in this module are for demonstration purposes only and MUST
be reviewed and replaced by clinically validated logic before any real use.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field

RULE_VERSION = "0.1.0-dev"


@dataclass
class TriageResult:
    priority: str          # normal | elevated | urgent | emergency
    reason: str
    triggering_data: str   # JSON string
    rule_version: str = RULE_VERSION


# ── Emergency keywords (English & Hindi) ──────────────────────────────────
# ⚠ CLINICAL REVIEW REQUIRED — Must be certified by institutional clinicians.
_EMERGENCY_KEYWORDS: list[str] = [
    # English
    "unconscious",
    "not breathing",
    "severe bleeding",
    "cardiac arrest",
    "heart attack",
    "stroke",
    "anaphylaxis",
    "seizure",
    "choking",
    "suicide",
    "self-harm",
    "gunshot",
    "stab",
    "poisoning",
    "overdose",
    # Hindi (Devanagari)
    "बेहोश",
    "बेहोशी",
    "सांस बंद",
    "सांस नहीं आ रही",
    "दिल का दौरा",
    "भारी रक्तस्राव",
    "खून बह रहा",
    "मिर्गी का दौरा",
    "दौरा पड़ना",
    "गंभीर चोट",
    "जहर",
    "विषाक्तता",
    "आत्महत्या",
    # Odia
    "ଅଚେତ",
    "ନିଶ୍ୱାସ ବନ୍ଦ",
    "ନିଶ୍ୱାସ ନାହିଁ",
    "ପ୍ରବଳ ରକ୍ତସ୍ରାବ",
    "ହୃଦଘାତ",
    "ମୂର୍ଚ୍ଛା",
    "ଶ୍ୱାସରୋଧ",
    "ବିଷ",
    "ଆତ୍ମହତ୍ୟା",
]

_URGENT_KEYWORDS: list[str] = [
    # English
    "chest pain",
    "difficulty breathing",
    "shortness of breath",
    "high fever",
    "severe pain",
    "head injury",
    "fracture",
    "broken bone",
    "severe burn",
    "allergic reaction",
    "blood in stool",
    "blood in urine",
    "sudden vision loss",
    "sudden weakness",
    "confusion",
    "fainting",
    # Hindi (Devanagari)
    "छाती में दर्द",
    "सीने में दर्द",
    "छाती में तेज दर्द",
    "सीने में तेज दर्द",
    "सीने में भारीपन",
    "सांस लेने में बहुत तकलीफ",
    "सांस फूलना",
    "तेज बुखार",
    "उच्च बुखार",
    "खून की उल्टी",
    "मल में खून",
    "पेशाब में खून",
    "अचानक कमजोरी",
    "हड्डी टूटना",
    "चक्कर खाकर गिरना",
    "गंभीर जलन",
    "असहनीय दर्द",
    # Odia
    "ଛାତି ଯନ୍ତ୍ରଣା",
    "ଛାତିରେ ଯନ୍ତ୍ରଣା",
    "ଛାତିରେ ତୀବ୍ର ଯନ୍ତ୍ରଣା",
    "ଛାତିରେ ଭାରୀପଣ",
    "ନିଶ୍ୱାସ ନେବାରେ କଷ୍ଟ",
    "ଶ୍ୱାସକଷ୍ଟ",
    "ତୀବ୍ର ଜ୍ୱର",
    "ହାଡ଼ ଭାଙ୍ଗିବା",
    "ରକ୍ତ ବାନ୍ତି",
    "ଅସହ୍ୟ ଯନ୍ତ୍ରଣା",
]

_ELEVATED_KEYWORDS: list[str] = [
    # English
    "fever",
    "persistent pain",
    "vomiting",
    "diarrhea",
    "rash",
    "swelling",
    "infection",
    "wound",
    "sprain",
    "burn",
    "dizziness",
    "numbness",
    # Hindi (Devanagari)
    "बुखार",
    "उल्टी",
    "दस्त",
    "चक्कर",
    "खांसी",
    "सूजन",
    "घाव",
    "संक्रमण",
    "पेट दर्द",
    "खुजली",
    "सुन्न",
    # Odia
    "ଜ୍ୱର",
    "ବାନ୍ତି",
    "ଝାଡ଼ା",
    "ମୁଣ୍ଡ ବୁଲାଇବା",
    "କାଶ",
    "ଫୁଲିଯିବା",
    "କ୍ଷତ",
    "ପେଟ ଯନ୍ତ୍ରଣା",
    "ପେଟ ବିନ୍ଧା",
    "ମୁଣ୍ଡବିନ୍ଧା",
    "କୁଣ୍ଡାଇ ହେବା",
]


def _check_keywords(text: str) -> tuple[str | None, list[str]]:
    """Return (priority, matched_keywords) from keyword scan."""
    lower = text.lower()

    matched_emergency = [kw for kw in _EMERGENCY_KEYWORDS if kw in lower]
    if matched_emergency:
        return "emergency", matched_emergency

    matched_urgent = [kw for kw in _URGENT_KEYWORDS if kw in lower]
    if matched_urgent:
        return "urgent", matched_urgent

    matched_elevated = [kw for kw in _ELEVATED_KEYWORDS if kw in lower]
    if matched_elevated:
        return "elevated", matched_elevated

    return None, []


# ── Vital-sign rules ──────────────────────────────────────────────────────
_VITAL_THRESHOLDS: dict[str, dict[str, tuple[float, float, str]]] = {
    # measurement_type -> { level: (low, high, priority) }
    "heart_rate": {
        "emergency_low":  (0, 40, "emergency"),
        "emergency_high": (150, 999, "emergency"),
        "urgent_low":     (40, 50, "urgent"),
        "urgent_high":    (120, 150, "urgent"),
        "elevated_low":   (50, 60, "elevated"),
        "elevated_high":  (100, 120, "elevated"),
    },
    "spo2": {
        "emergency": (0, 85, "emergency"),
        "urgent":    (85, 90, "urgent"),
        "elevated":  (90, 94, "elevated"),
    },
    "temperature": {
        "emergency_high": (40.5, 50, "emergency"),
        "urgent_high":    (39.4, 40.5, "urgent"),
        "elevated_high":  (38.0, 39.4, "elevated"),
        "emergency_low":  (30, 35, "emergency"),
    },
    "systolic_bp": {
        "emergency_high": (180, 400, "emergency"),
        "urgent_high":    (160, 180, "urgent"),
        "emergency_low":  (0, 70, "emergency"),
        "urgent_low":     (70, 90, "urgent"),
    },
    "respiratory_rate": {
        "emergency_high": (30, 100, "emergency"),
        "urgent_high":    (24, 30, "urgent"),
        "emergency_low":  (0, 8, "emergency"),
        "urgent_low":     (8, 12, "urgent"),
    },
}

_PRIORITY_ORDER = {"emergency": 4, "urgent": 3, "elevated": 2, "normal": 1}


def _check_vitals(
    measurements: list[dict[str, float | str]],
) -> tuple[str | None, list[str]]:
    """
    Evaluate vital-sign measurements against thresholds.

    Each measurement dict should contain at least ``measurement_type`` and ``value``.
    Returns (highest_priority, list_of_reasons).
    """
    highest: str | None = None
    reasons: list[str] = []

    for m in measurements:
        raw_type = str(m.get("measurement_type", "")).lower().strip()
        mtype = "systolic_bp" if raw_type in ("blood_pressure", "bp", "systolic_bp", "sbp") else raw_type
        value = m.get("value")
        if mtype not in _VITAL_THRESHOLDS or value is None:
            continue
        try:
            val = float(value)
        except (TypeError, ValueError):
            continue

        # Ignore uninitialized / disconnected probe readings (<= 0)
        if val <= 0:
            continue

        # Normalize °F -> °C before threshold comparison
        unit_str = str(m.get("unit", "") or "").lower().strip()
        if mtype == "temperature" and (val > 45.0 or unit_str in ("f", "degf", "°f", "fahrenheit")):
            val = round((val - 32.0) * 5.0 / 9.0, 2)

        for label, (lo, hi, prio) in _VITAL_THRESHOLDS[mtype].items():
            if lo <= val < hi:
                unit_suffix = "°C" if mtype == "temperature" else ""
                reasons.append(
                    f"{mtype} = {val}{unit_suffix} ({label} range {lo}–{hi}) → {prio}"
                )
                if highest is None or _PRIORITY_ORDER.get(prio, 0) > _PRIORITY_ORDER.get(highest, 0):
                    highest = prio

    return highest, reasons


def evaluate_triage(
    chief_complaint: str,
    severity: str | None = None,
    responses: list[dict[str, str]] | None = None,
    measurements: list[dict[str, float | str]] | None = None,
) -> TriageResult:
    """
    Run all triage rules and return the highest-priority result.

    ⚠ DEVELOPMENT EXAMPLES — NOT CLINICALLY APPROVED.
    """
    triggers: list[str] = []
    final_priority = "normal"

    # 1. Keyword scan on chief complaint + answers
    all_text = chief_complaint
    if responses:
        all_text += " " + " ".join(r.get("answer", "") for r in responses)

    kw_prio, kw_matches = _check_keywords(all_text)
    if kw_prio:
        triggers.append(f"Keyword match ({kw_prio}): {', '.join(kw_matches)}")
        if _PRIORITY_ORDER.get(kw_prio, 0) > _PRIORITY_ORDER.get(final_priority, 0):
            final_priority = kw_prio

    # 2. Self-reported severity
    if severity == "severe" and _PRIORITY_ORDER.get(final_priority, 0) < _PRIORITY_ORDER["elevated"]:
        triggers.append("Self-reported severity: severe → elevated")
        final_priority = "elevated"

    # 3. Vital signs
    if measurements:
        vit_prio, vit_reasons = _check_vitals(measurements)
        if vit_prio:
            triggers.extend(vit_reasons)
            if _PRIORITY_ORDER.get(vit_prio, 0) > _PRIORITY_ORDER.get(final_priority, 0):
                final_priority = vit_prio

    # Safety: never auto-downgrade from emergency
    # (not applicable in current flow, but explicit guard)

    reason = (
        "⚠ DEVELOPMENT RULE — NOT CLINICALLY APPROVED.\n"
        + ("; ".join(triggers) if triggers else "No specific risk indicators detected.")
    )

    return TriageResult(
        priority=final_priority,
        reason=reason,
        triggering_data=json.dumps({"triggers": triggers}, ensure_ascii=False),
    )
