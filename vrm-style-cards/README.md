# VRM Style Cards for Home Assistant

[🇩🇪 Deutsche Anleitung](README.de.md)

Lovelace cards that look like the **Victron VRM portal**: energy flow overview, consumption / solar / battery
chart with forecasts, and a comparison of your own forecast with the VRM forecast.
Every device is configured in YAML: as many grid phases, PV inverters, solar chargers and battery monitors as you
have, and any energy counters you like. The cards work without Victron hardware, as long as the sensors exist in Home Assistant.

> Not affiliated with or endorsed by Victron Energy. "Victron" and "VRM" are trademarks of Victron Energy B.V.

<!-- Add screenshots to docs/ and link them here, e.g. ![Overview](docs/overview.png) -->

## Features

- **Overview**: grid, AC loads, inverter/charger, AC-coupled PV inverters, DC solar chargers (MPPT), battery,
  battery monitors, total solar with today's curve and weather with a 5-day forecast. Animated flow lines and an
  animated "real-time" icon, like VRM.
- **Flexible**: boxes and rows adapt to what you configure (1 or 3 phases, 1 or 10 MPPTs, 0–n battery monitors …);
  missing parts are hidden.
- **Active battery monitor** (e.g. BMS vs. SmartShunt) is detected by comparing it with the system values.
- **Chart**: consumption, solar, battery SoC, forecasts (hatched) for hours, days, weeks, months. Time range picker like
  VRM: quick select, custom range, past and up to 10 days into the future.
- **Own forecasts**: consumption (average of the last 7 days), base load (median, without EV / heat pump),
  solar (clear-sky yield of the last 21 days × irradiance or cloud forecast; self-calibrating).
- **Comparison card**: own forecast vs. VRM (or any other) forecast vs. actual, per hour and per day, with mean error.
- **Forecast archive** (optional): stores the forecast of each day so past days are compared with the forecast as it
  was issued.
- German and English, light and dark theme, separate phone layout.

## Installation

Open directly in Home Assistant (needs HACS):

[![Open your Home Assistant instance and open this repository in HACS.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=Xander2980&repository=vrm-style-cards&category=plugin)


### HACS (custom repository)
1. HACS → ⋮ → *Custom repositories* → add `https://github.com/Xander2980/vrm-style-cards`, type **Dashboard**.
2. Install **VRM Style Cards**, then reload the browser (Ctrl+F5 / pull down in the app).

### Manual
1. Copy `dist/vrm-style-cards.js` to `/config/www/vrm-style-cards.js`.
2. Settings → Dashboards → ⋮ → *Resources* → add `/local/vrm-style-cards.js` as **JavaScript module**.
3. Reload the browser.

## Setup in the dashboard editor (no YAML)

Add the card **VRM Style – Dashboard** (or one of the single cards) in the dashboard editor. The form has a section
for every part of the system with entity pickers and *+ add* / *remove* for lists. Two buttons fill it automatically:

- **Detect Victron GX automatically** – reads all devices of the *Victron GX* integration (grid meter, PV inverters,
  solar chargers, MultiPlus/Quattro, battery and battery monitors with their energy counters).
- **Detect VRM forecast integration** – adds the sensors of [VRM Forecast](https://github.com/Xander2980/ha-vrm-forecast).

Check the result, then add weather and (optionally) irradiance. Everything can still be edited in YAML.

## Quick start (YAML)

```yaml
type: custom:vrm-dashboard-card
title: My house
grid:
  power: sensor.grid_power
ac_loads:
  power: sensor.ac_loads_power
battery:
  soc: sensor.battery_soc
  power: sensor.battery_power
solar_chargers:
  - name: MPPT
    power: sensor.mppt_pv_power
energy:
  grid_import: sensor.grid_energy_import
  grid_export: sensor.grid_energy_export
  solar: [sensor.mppt_yield_total]
weather: weather.home
```

Put the card in a **panel view** (or a section with full width) – it scales to the available width and switches to the
phone layout below 700 px. More examples: [`examples/`](examples/).

## Cards

| Card | Shows |
|---|---|
| `custom:vrm-dashboard-card` | All cards below with **one** configuration. `cards:` chooses which ones and in which order: `overview`, `chart`, `solar_compare`, `baseload_compare`. |
| `custom:vrm-overview-card` | Energy flow overview |
| `custom:vrm-chart-card` | Chart with time range picker and daily tiles |
| `custom:vrm-compare-card` | Forecast comparison, `metric: solar` or `metric: baseload` |

All cards read the same configuration keys, so you can copy one block between them.

## Configuration

Entity ids can always be given as a plain string. Lists may have any length.

### General

| Key | Description |
|---|---|
| `title` | Title of the overview |
| `icon` | Icon next to the title (default `mdi:home-lightning-bolt-outline`) |
| `language` | `de` or `en` (default: Home Assistant language) |
| `theme` | `light` or `dark` (default: Home Assistant theme) |
| `show` | `{ devices: false, weather: false, total_solar: false }` hides parts of the overview |
| `cards`, `gap` | only `vrm-dashboard-card`: list of cards, gap in px |

### Overview

| Key | Fields |
|---|---|
| `grid` | `name`, `power`, `phases` (list of `{voltage, current, power}`, max. 3 shown), `invert: true` if import is negative |
| `ac_loads` | `name`, `power` (optional, otherwise sum of phases), `phases` (list of power sensors or `{power}`) |
| `inverter` | `name`, `state` (text in the blue box), `dc_voltage`, `dc_current`, `dc_power` (+ = charging; sets the flow direction). With `name` and `dc_power` it is also listed at the bottom. |
| `pv_inverters` | list of `{name, power, phases}` – AC-coupled PV. One inverter with phases → one row per phase; several → one row per inverter. |
| `solar_chargers` | list of `{name, power, voltage, current}` – DC-coupled PV (MPPT) |
| `battery` | `soc`, `power`, `voltage`, `current`, `temperature`, `state` (idle/charging/discharging), `ess_state`, `ess_name` |
| `battery_monitors` | list of `{name, soc, voltage, current, power, time_to_go}`. With two or more, the one matching `battery` is marked *active*. |
| `total_solar` | power sensor for the "Total solar" box (otherwise PV inverters + solar chargers) |
| `weather` | weather entity (current condition + daily forecast) |

### Energy (chart and comparisons)

The chart uses Home Assistant **long-term statistics**, so all counters need `state_class: total_increasing`
(or `total`) and an energy unit; the SoC and `consumption_power` need `state_class: measurement`.

| Key | Description |
|---|---|
| `energy.grid_import`, `energy.grid_export` | grid energy counters |
| `energy.solar` | list of solar yield counters (added up) |
| `energy.solar_reference` | optional counter used when one of the `solar` counters has no data for a period |
| `energy.solar_today` | optional daily solar energy for the "Total solar" box |
| `energy.battery_charge`, `energy.battery_discharge` | battery energy counters |
| `energy.consumption_power` | optional power sensor(s) of all consumers (W, a list is added up, e.g. AC loads L1–L3). Consumption = hourly mean, like VRM. Without it consumption = import − export + solar + discharge − charge. |
| `energy.exclude_from_baseload` | list of energy counters (EV charger, heat pump …) that are not part of the base load |
| `battery.soc` | battery SoC line in the chart |

### Forecasts (all optional)

| Key | Description |
|---|---|
| `forecast.name` | label of the external forecast (e.g. `VRM`, `Solcast`) |
| `forecast.consumption` | `yesterday`, `today`, `tomorrow`, `current_hour`, `next_hour` – kWh sensors, e.g. from the *Victron Remote Monitoring* integration |
| `forecast.solar` | `yesterday`, `today`, `tomorrow`, `current_hour` |
| `forecast.use_energy_dashboard` | `false` to ignore the solar forecast configured in the HA energy dashboard (used by default for hourly values) |
| `forecast.hourly` | sensor with attribute `hours: [{t, consumption, baseload, solar}]` (t in ms, kWh) – see [Node-RED flow](node-red/) |
| `forecast.archive` | sensor of the [forecast archive package](packages/) |
| `forecast.irradiance` | global irradiance forecast in the format of the **DWD** integration: attribute `data` = list of `{datetime, value}` in W/m² (value at T = mean of the hour before). Improves the own solar forecast a lot. |

## How the own forecasts work

- **Consumption**: average of the same hour on the previous 7 days, scaled to the external daily forecast if there is one.
- **Base load**: consumption minus `exclude_from_baseload`, **median** of the same hour on the previous 7 days (single peaks do not count).
- **Solar**, per hour, best method first:
  1. *Directly calibrated*: once there are ≥ 5 values per hour of day with measured irradiance: median(yield ÷ irradiance) × forecast irradiance.
  2. *Irradiance × clear sky*: clear-sky yield of your system per hour of day (median of the last 21 days, corrected for clouds) × clearness index (forecast irradiance ÷ clear-sky irradiance, sun position from your HA location).
  3. *Cloud cover*: clear-sky yield × Kasten-Czeplak factor of the weather entity's cloud cover.

For past days the comparison uses the **archived** forecast if the archive package is installed; otherwise it is a
recalculation with the measured weather, and the tile says so.

## Optional extras

- [`packages/vrm_forecast_archive.yaml`](packages/vrm_forecast_archive.yaml) – template sensor that stores the forecast of every day (35 days).
- [VRM Forecast](https://github.com/Xander2980/ha-vrm-forecast) – integration that reads the hourly VRM forecast
  (consumption, base load, solar) and is set up in the UI with your VRM access token. Recommended.
- [`node-red/vrm-forecast-flow.json`](node-red/vrm-forecast-flow.json) – alternative to the integration: Node-RED flow that reads the hourly VRM forecast (consumption, base load, solar) with
  the [victron-vrm-api](https://flows.nodered.org/node/victron-vrm-api) node and writes `sensor.vrm_forecast_hours`.
  After the import select your VRM API config node, installation (site id) and Home Assistant server.

## Troubleshooting

- **Card not found** – check the resource (Settings → Dashboards → Resources) and reload the browser cache.
- **Chart is empty** – the counters need long-term statistics (Developer tools → Statistics). New sensors need one hour for the first values.
- **Values far too high** – counters in Wh are converted automatically; check that each counter only increases.
- **Grid flow in the wrong direction** – `grid: invert: true`.

## Development

The source is in `src/` (plain JavaScript, no dependencies). `./build.sh` joins the files into `dist/vrm-style-cards.js`.
Texts are written in German in the code and translated in `src/10-i18n.js` – add a language there.

## License

MIT – see [LICENSE](LICENSE).
