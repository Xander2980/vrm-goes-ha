"""Tests for the forecast parser (run: python -m pytest tests)."""
import importlib.util
import pathlib
import sys
import types

# load parser.py without Home Assistant
base = pathlib.Path(__file__).resolve().parents[1] / "custom_components" / "vrm_forecast"
pkg = types.ModuleType("vrm_forecast"); pkg.__path__ = [str(base)]; sys.modules["vrm_forecast"] = pkg
for name in ("const", "parser"):
    spec = importlib.util.spec_from_file_location(f"vrm_forecast.{name}", base / f"{name}.py")
    mod = importlib.util.module_from_spec(spec); sys.modules[f"vrm_forecast.{name}"] = mod; spec.loader.exec_module(mod)
parser = sys.modules["vrm_forecast.parser"]

H = 3_600_000
T0 = 1_795_302_000_000  # 2026-11-22 00:00 CET


def test_hours_baseload_and_wh_detection():
    rec = {
        "vrm_consumption_fc": [[T0 + i * H, 500 + i] for i in range(24)],   # Wh
        "vrm_consumption_fc_adj": [],
        "vrm_consum_evcs_fc": [[T0 + 3 * H, 100]],                          # Wh
        "solar_yield_forecast": [[T0 + i * H, 0.5 if 9 <= i <= 15 else 0] for i in range(24)] + [[T0 + 24 * H, None]],
    }
    out = parser.parse_forecast(rec)
    h = out["hours"]
    assert len(h) == 24
    assert h[3] == {"t": T0 + 3 * H, "consumption": 0.503, "baseload": 0.403, "ev": 0.1, "heat_pump": 0.0, "solar": 0}
    assert h[12]["solar"] == 0.5
    assert out["sources"]["consumption"] == "vrm_consumption_fc"
    assert parser.sum_between(h, "solar", T0, T0 + 24 * H) == 3.5
    assert parser.value_at(h, "consumption", T0 + 5 * H) == 0.505


def test_adjusted_series_and_solar_fallback():
    rec = {
        "vrm_consumption_fc_adj": [[T0, 0.7]],
        "vrm_consumption_fc": [[T0, 0.9]],
        "vrm_pv_inverter_yield_fc": [[T0 + 10 * H, 0.4]],
        "vrm_pv_charger_yield_fc": [[T0 + 10 * H, 0.3]],
    }
    out = parser.parse_forecast(rec)
    assert out["hours"][0]["consumption"] == 0.7
    assert out["hours"][1]["solar"] == 0.7
    assert out["sources"]["solar"] == "vrm_pv_inverter_yield_fc+vrm_pv_charger_yield_fc"


def test_empty():
    out = parser.parse_forecast({})
    assert out["hours"] == []
    assert parser.sum_between([], "solar", 0, 1) is None
