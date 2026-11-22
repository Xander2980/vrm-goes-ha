# VRM Forecast for Home Assistant

[🇩🇪 Deutsch](README.de.md)

Reads the **hourly forecast of the Victron VRM portal** (consumption, base load, EV charger, heat pump, solar – today and
tomorrow) and makes it available as sensors. Set up completely in the UI: enter your VRM access token, choose the installation.
No YAML, no Node-RED.

Made for [VRM Style Cards](https://github.com/Xander2980/vrm-style-cards), but the sensors can be used anywhere
(automations, energy planning, other cards).

> Not affiliated with or endorsed by Victron Energy. "Victron" and "VRM" are trademarks of Victron Energy B.V.

## Installation

Open directly in Home Assistant (needs HACS):

[![Open your Home Assistant instance and open this repository in HACS.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=Xander2980&repository=ha-vrm-forecast&category=integration)

After installing and restarting, set it up:

[![Open your Home Assistant instance and start setting up VRM Forecast.](https://my.home-assistant.io/badges/config_flow_start.svg)](https://my.home-assistant.io/redirect/config_flow_start/?domain=vrm_forecast)


**HACS:** HACS → ⋮ → *Custom repositories* → `https://github.com/Xander2980/ha-vrm-forecast`, type **Integration** →
install **VRM Forecast** → restart Home Assistant.

**Manual:** copy `custom_components/vrm_forecast` to `/config/custom_components/` and restart Home Assistant.

## Setup

1. In the VRM portal create an access token: *Preferences → Integrations → Access tokens*
   (https://vrm.victronenergy.com/access-tokens).
2. Settings → Devices & services → *Add integration* → **VRM Forecast** → paste the token.
3. Choose the installation. Done – the sensors are updated every 15 minutes (changeable in the integration options).

The token is stored like the credentials of every other integration (in `.storage`), not in YAML.

## Sensors (kWh)

| Sensor | Content |
|---|---|
| Hourly forecast | state = consumption today; attribute `hours`: list of `{t, consumption, baseload, ev, heat_pump, solar}` (t = start of the hour in ms, kWh) for today and tomorrow; attribute `sources`: which VRM series were used |
| Consumption today / tomorrow | sum of the hourly consumption forecast |
| Base load today / tomorrow | consumption − EV charger − heat pump |
| Solar today / tomorrow | solar yield forecast |
| Consumption current / next hour, Solar current / next hour | value of the current or next hour (switches at the full hour) |

The forecast comes from the VRM *Dynamic ESS* statistics (`stats?type=dynamic_ess&interval=hours`). It is available for
installations for which VRM calculates consumption and solar forecasts. If an adjusted forecast (`…_fc_adj`) exists, it
is used. Values in Wh are converted automatically.

## Use with VRM Style Cards

In the card editor press **"Detect VRM forecast integration"**, or set:

```yaml
forecast:
  name: VRM
  hourly: sensor.vrm_my_house_hourly_forecast
  consumption: { today: sensor.vrm_my_house_consumption_today, tomorrow: sensor.vrm_my_house_consumption_tomorrow }
  solar: { today: sensor.vrm_my_house_solar_today, tomorrow: sensor.vrm_my_house_solar_tomorrow }
```

## Troubleshooting

- *The token is not valid* – create a new token; copy only the token (with or without the word "Token" in front).
- Sensors are *unknown* – VRM has no forecast for this installation yet (it needs some days of history).
- Debug log: `logger: logs: custom_components.vrm_forecast: debug`.

## License

MIT
