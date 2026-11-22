"""Constants for the VRM Forecast integration."""

DOMAIN = "vrm_forecast"

API_BASE = "https://vrmapi.victronenergy.com/v2"

CONF_API_TOKEN = "api_token"
CONF_SITE_ID = "site_id"
CONF_SITE_NAME = "site_name"
CONF_SCAN_INTERVAL = "scan_interval"

DEFAULT_SCAN_INTERVAL = 15  # minutes
MIN_SCAN_INTERVAL = 5
MAX_SCAN_INTERVAL = 120

# Dynamic ESS stats series (first non-empty one wins)
SERIES_CONSUMPTION = ("vrm_consumption_fc_adj", "vrm_consumption_fc")
SERIES_EV = ("vrm_consum_evcs_fc_adj", "vrm_consum_evcs_fc")
SERIES_HEAT_PUMP = ("vrm_consum_hp_fc_adj", "vrm_consum_hp_fc")
SERIES_SOLAR = ("solar_yield_forecast",)
SERIES_SOLAR_PARTS = ("vrm_pv_inverter_yield_fc", "vrm_pv_charger_yield_fc")
