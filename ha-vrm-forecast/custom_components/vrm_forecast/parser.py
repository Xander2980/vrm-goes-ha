"""Turn the VRM Dynamic ESS stats into an hourly forecast (no Home Assistant imports, easy to test)."""
from __future__ import annotations

from typing import Any

from .const import SERIES_CONSUMPTION, SERIES_EV, SERIES_HEAT_PUMP, SERIES_SOLAR, SERIES_SOLAR_PARTS

HOUR_MS = 3_600_000


def _series(records: dict[str, Any], keys: tuple[str, ...]) -> tuple[str | None, list]:
    for key in keys:
        val = records.get(key)
        if isinstance(val, list) and val:
            return key, val
    return None, []


def _to_map(rows: list) -> dict[int, float]:
    """Rows [[ms, value], ...] → {hour start ms: kWh}; Wh are detected (> 30 per hour can only be Wh)."""
    clean = []
    for row in rows:
        if not isinstance(row, (list, tuple)) or len(row) < 2:
            continue
        try:
            t, v = int(row[0]), float(row[1])
        except (TypeError, ValueError):
            continue
        clean.append((t, v))
    factor = 0.001 if clean and max(abs(v) for _, v in clean) > 30 else 1.0
    out: dict[int, float] = {}
    for t, v in clean:
        hour = (t // HOUR_MS) * HOUR_MS
        out[hour] = out.get(hour, 0.0) + v * factor
    return out


def parse_forecast(records: dict[str, Any]) -> dict[str, Any]:
    """Hourly list with consumption, base load (consumption − EV − heat pump), EV, heat pump, solar (kWh)."""
    k_cons, cons = _series(records, SERIES_CONSUMPTION)
    k_ev, ev = _series(records, SERIES_EV)
    k_hp, hp = _series(records, SERIES_HEAT_PUMP)
    k_sol, sol = _series(records, SERIES_SOLAR)
    m_c, m_e, m_h = _to_map(cons), _to_map(ev), _to_map(hp)
    if k_sol:
        m_s = _to_map(sol)
    else:  # fallback: PV inverter + PV charger forecasts
        m_s = {}
        for key in SERIES_SOLAR_PARTS:
            for t, v in _to_map(records.get(key) or []).items():
                m_s[t] = m_s.get(t, 0.0) + v
    hours = []
    for t in sorted(set(m_c) | set(m_s)):
        c = m_c.get(t)
        e, h = m_e.get(t, 0.0), m_h.get(t, 0.0)
        hours.append({
            "t": t,
            "consumption": None if c is None else round(c, 3),
            "baseload": None if c is None else round(max(0.0, c - e - h), 3),
            "ev": round(e, 3),
            "heat_pump": round(h, 3),
            "solar": None if t not in m_s else round(m_s[t], 3),
        })
    return {
        "hours": hours,
        "sources": {
            "consumption": k_cons,
            "baseload": "consumption - ev - heat_pump",
            "ev": k_ev,
            "heat_pump": k_hp,
            "solar": k_sol or "+".join(SERIES_SOLAR_PARTS),
        },
    }


def sum_between(hours: list[dict[str, Any]], key: str, start_ms: int, end_ms: int) -> float | None:
    """Sum of one field for the hours in [start, end); None if there is no value at all."""
    vals = [h[key] for h in hours if start_ms <= h["t"] < end_ms and h.get(key) is not None]
    return round(sum(vals), 3) if vals else None


def value_at(hours: list[dict[str, Any]], key: str, hour_ms: int) -> float | None:
    """Value of one field for the hour starting at hour_ms."""
    for h in hours:
        if h["t"] == hour_ms:
            return h.get(key)
    return None
