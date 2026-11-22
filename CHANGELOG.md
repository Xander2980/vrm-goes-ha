# Changelog

## 1.1.1
- Fix: phone layout – the power value of the PV inverter and PV charger boxes and the ESS line of the battery box were covered by the rows below.

## 1.1.0
- Cards and forecast integration are now one HACS integration, "VRM goes HA" (repository `Xander2980/vrm-goes-ha`). The integration serves the cards and loads them on every dashboard – no resource to add.
- The card picker no longer shows duplicates when the card file is loaded twice.

## 1.0.1
- Fix: statistics queries with unset sensors (e.g. no `battery.soc`) or no ids at all made the chart and compare cards fail with "Error while loading".
- Fix: after a failed load the card retried on every Home Assistant state change; it now retries at most once a minute.

## 1.0.0
- First public version.
- Cards: `vrm-dashboard-card` (all in one), `vrm-overview-card`, `vrm-chart-card`, `vrm-compare-card`.
- Every device is configurable: any number of grid / load phases, PV inverters, solar chargers and battery monitors.
- Active battery monitor is detected automatically.
- Time range picker like VRM (quick select, custom, up to 10 days into the future).
- Own consumption, base load and solar forecasts; comparison with VRM (or any other) forecast.
- Optional forecast archive (template package) and VRM hourly forecast (Node-RED flow).
- German and English, light and dark theme, desktop and phone layout.
- Visual editor with automatic detection of the Victron GX integration and of the VRM Forecast integration.
- `energy.consumption_power` accepts a list of power sensors.
