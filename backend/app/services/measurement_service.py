"""
Jan Saathi AI — Vital Signs & ESP32-S3 Medical Kiosk Telemetry Service.

Handles decoding, validation, and calibration of real physical sensor measurements
ingested from the connected ESP32-S3 Medical Kiosk (MAX30102, DS18B20, AD8232)
and clinical staff examinations.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger("jansaathi.measurements")


@dataclass
class ClinicalVitalReading:
    measurement_type: str
    value: float
    unit: str
    signal_quality: str
    source: str = "esp32_sensor"  # esp32_sensor | clinical_examination | patient_reported
    device_id: str | None = None
    recorded_at: datetime | None = None

    def __post_init__(self):
        if self.recorded_at is None:
            self.recorded_at = datetime.now(timezone.utc)


# Normal physiological reference boundaries for real telemetry validation
VITAL_LIMITS: dict[str, tuple[float, float, str]] = {
    "heart_rate":       (30.0, 240.0, "bpm"),
    "spo2":             (50.0, 100.0, "%"),
    "temperature":      (30.0, 45.0,  "°C"),
    "systolic_bp":      (40.0, 260.0, "mmHg"),
    "diastolic_bp":     (30.0, 160.0, "mmHg"),
    "respiratory_rate": (4.0,  60.0,  "breaths/min"),
}


def validate_vital_measurement(mtype: str, value: float) -> tuple[bool, str]:
    """
    Validate that an ingested physical reading falls within credible human limits.
    """
    if mtype not in VITAL_LIMITS:
        return True, "ok"

    min_val, max_val, unit = VITAL_LIMITS[mtype]
    if value < min_val or value > max_val:
        return False, f"Reading {value} {unit} outside physiological range ({min_val}-{max_val} {unit})"

    return True, "ok"


def parse_esp32_packet(raw_payload: dict[str, Any], device_id: str = "ESP32-S3-N16R8") -> list[ClinicalVitalReading]:
    """
    Parse a real-time telemetry packet transmitted by the ESP32-S3 Medical Kiosk.
    Extracts heart rate, oxygen saturation, temperature, blood pressure, and signal quality.
    """
    readings: list[ClinicalVitalReading] = []
    now = datetime.now(timezone.utc)

    # Heart Rate (from MAX30102 / AD8232)
    hr_val = raw_payload.get("hr") or raw_payload.get("heart_rate")
    if hr_val is not None:
        try:
            hr = float(hr_val)
            valid, _ = validate_vital_measurement("heart_rate", hr)
            if valid:
                readings.append(ClinicalVitalReading(
                    measurement_type="heart_rate",
                    value=hr,
                    unit="bpm",
                    signal_quality=str(raw_payload.get("quality", "good")),
                    source="esp32_sensor",
                    device_id=device_id,
                    recorded_at=now,
                ))
        except (ValueError, TypeError):
            pass

    # SpO2 (from MAX30102)
    spo2_val = raw_payload.get("spo2")
    if spo2_val is not None:
        try:
            spo2 = float(spo2_val)
            valid, _ = validate_vital_measurement("spo2", spo2)
            if valid:
                readings.append(ClinicalVitalReading(
                    measurement_type="spo2",
                    value=spo2,
                    unit="%",
                    signal_quality=str(raw_payload.get("quality", "good")),
                    source="esp32_sensor",
                    device_id=device_id,
                    recorded_at=now,
                ))
        except (ValueError, TypeError):
            pass

    # Temperature (from DS18B20 1-Wire probe)
    temp_val = raw_payload.get("temp") or raw_payload.get("temperature")
    if temp_val is not None:
        try:
            temp = float(temp_val)
            # Normalize degF to degC if required
            if temp > 80.0:
                temp_c = round((temp - 32.0) * 5.0 / 9.0, 1)
            else:
                temp_c = temp

            valid, _ = validate_vital_measurement("temperature", temp_c)
            if valid:
                readings.append(ClinicalVitalReading(
                    measurement_type="temperature",
                    value=temp_c,
                    unit="°C",
                    signal_quality=str(raw_payload.get("quality", "good")),
                    source="esp32_sensor",
                    device_id=device_id,
                    recorded_at=now,
                ))
        except (ValueError, TypeError):
            pass

    # Blood Pressure (Systolic / Diastolic)
    bp_sys = raw_payload.get("bp_sys") or raw_payload.get("blood_pressure_systolic")
    bp_dia = raw_payload.get("bp_dia") or raw_payload.get("blood_pressure_diastolic")
    if bp_sys is not None and bp_dia is not None:
        try:
            sys_val = float(bp_sys)
            dia_val = float(bp_dia)
            readings.append(ClinicalVitalReading(
                measurement_type="systolic_bp",
                value=sys_val,
                unit="mmHg",
                signal_quality="good",
                source="esp32_sensor",
                device_id=device_id,
                recorded_at=now,
            ))
            readings.append(ClinicalVitalReading(
                measurement_type="diastolic_bp",
                value=dia_val,
                unit="mmHg",
                signal_quality="good",
                source="esp32_sensor",
                device_id=device_id,
                recorded_at=now,
            ))
        except (ValueError, TypeError):
            pass

    return readings
