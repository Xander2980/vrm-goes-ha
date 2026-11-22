# VRM Style Cards für Home Assistant

[🇬🇧 English](README.md)

Lovelace-Karten im Aussehen des **Victron-VRM-Portals**: Energiefluss-Übersicht, Diagramm für Verbrauch, Solar und
Batterie mit Prognosen sowie ein Vergleich der eigenen Prognose mit der VRM-Prognose.
Alle Geräte werden per YAML eingestellt: beliebig viele Netzphasen, PV-Wechselrichter, Laderegler und
Batteriewächter, beliebige Energiezähler. Die Karten funktionieren auch ohne Victron-Geräte, solange die Sensoren in
Home Assistant vorhanden sind.

> Kein offizielles Produkt von Victron Energy. „Victron“ und „VRM“ sind Marken der Victron Energy B.V.

## Funktionen

- **Übersicht**: Netz, AC-Lasten, Wechselrichter/Lader, AC-gekoppelte PV-Wechselrichter, DC-Laderegler (MPPT),
  Batterie, Batteriewächter, Gesamt Solar mit Tagesverlauf und Wetter mit 5-Tage-Vorhersage. Animierte Flusslinien und
  animiertes „Echtzeit“-Symbol wie bei VRM.
- **Flexibel**: Kästen und Zeilen passen sich an (1 oder 3 Phasen, 1 oder 10 MPPT, 0–n Batteriewächter …); was nicht
  eingestellt ist, wird ausgeblendet.
- **Aktiver Batteriewächter** (z. B. BMS oder SmartShunt) wird automatisch erkannt.
- **Diagramm**: Verbrauch, Solar, Ladestand, Prognosen (schraffiert) für Stunden, Tage, Wochen, Monate. Zeitraum-Auswahl
  wie bei VRM: Schnellauswahl, eigener Zeitraum, Vergangenheit und bis 10 Tage in die Zukunft.
- **Eigene Prognosen**: Verbrauch (Mittel der letzten 7 Tage), Grundlast (Median, ohne Wallbox/Wärmepumpe),
  Solar (Klarhimmel-Ertrag der letzten 21 Tage × Einstrahlungs- oder Bewölkungsprognose, kalibriert sich selbst).
- **Vergleichskarte**: eigene Prognose gegen VRM-Prognose (oder eine andere) gegen Ist – je Stunde und Tag, mit mittlerem Fehler.
- **Prognose-Archiv** (optional): speichert die Prognose jedes Tages, damit vergangene Tage mit der damaligen Prognose verglichen werden.
- Deutsch und Englisch, hell und dunkel, eigenes Handy-Layout.

## Installation

Direkt in Home Assistant öffnen (HACS nötig):

[![Open your Home Assistant instance and open this repository in HACS.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=Xander2980&repository=vrm-style-cards&category=plugin)


### HACS (benutzerdefiniertes Repository)
1. HACS → ⋮ → *Benutzerdefinierte Repositories* → `https://github.com/Xander2980/vrm-style-cards` hinzufügen, Typ **Dashboard**.
2. **VRM Style Cards** installieren und den Browser neu laden (Strg+F5 bzw. in der App nach unten ziehen).

### Von Hand
1. `dist/vrm-style-cards.js` nach `/config/www/vrm-style-cards.js` kopieren.
2. Einstellungen → Dashboards → ⋮ → *Ressourcen* → `/local/vrm-style-cards.js` als **JavaScript-Modul** hinzufügen.
3. Browser neu laden.

## Einrichtung im Dashboard-Editor (ohne YAML)

Im Dashboard-Editor die Karte **VRM Style – Dashboard** (oder eine Einzelkarte) hinzufügen. Das Formular hat für jeden
Teil der Anlage einen Abschnitt mit Entitäten-Auswahl und *+ Hinzufügen* / *Entfernen* für Listen. Zwei Knöpfe füllen es
automatisch:

- **Victron GX automatisch erkennen** – übernimmt alle Geräte der Integration *Victron GX* (Netzzähler, PV-Wechselrichter,
  Laderegler, MultiPlus/Quattro, Batterie und Batteriewächter samt Energiezählern).
- **VRM-Prognose-Integration erkennen** – trägt die Sensoren von [VRM Forecast](https://github.com/Xander2980/ha-vrm-forecast) ein.

Danach prüfen und Wetter sowie (optional) Einstrahlung ergänzen. Alles bleibt auch in YAML bearbeitbar.

## Schnellstart (YAML)

```yaml
type: custom:vrm-dashboard-card
title: Mein Haus
grid:
  power: sensor.netz_leistung
ac_loads:
  power: sensor.ac_lasten
battery:
  soc: sensor.batterie_ladestand
  power: sensor.batterie_leistung
solar_chargers:
  - name: MPPT
    power: sensor.mppt_leistung
energy:
  grid_import: sensor.netz_bezug_energie
  grid_export: sensor.netz_einspeisung_energie
  solar: [sensor.mppt_ertrag_gesamt]
weather: weather.home
```

Die Karte am besten in eine **Panel-Ansicht** (oder einen Abschnitt in voller Breite) legen. Sie passt sich der Breite an
und schaltet unter 700 px auf das Handy-Layout um. Weitere Beispiele: [`examples/`](examples/).

## Karten

| Karte | Inhalt |
|---|---|
| `custom:vrm-dashboard-card` | Alle Karten mit **einer** Konfiguration. `cards:` legt Auswahl und Reihenfolge fest: `overview`, `chart`, `solar_compare`, `baseload_compare`. |
| `custom:vrm-overview-card` | Energiefluss-Übersicht |
| `custom:vrm-chart-card` | Diagramm mit Zeitraum-Auswahl und Tageskacheln |
| `custom:vrm-compare-card` | Prognose-Vergleich, `metric: solar` oder `metric: baseload` |

Alle Karten verstehen dieselben Schlüssel – ein Block kann zwischen ihnen kopiert werden.

## Konfiguration

Die vollständige Liste aller Schlüssel steht in der [englischen Anleitung](README.md#configuration); hier die wichtigsten:

| Schlüssel | Bedeutung |
|---|---|
| `title`, `icon`, `language` (`de`/`en`), `theme` (`light`/`dark`) | Allgemein |
| `grid` | `name`, `power`, `phases` (Liste `{voltage, current, power}`), `invert: true` wenn Bezug negativ ist |
| `ac_loads` | `power` oder `phases` (Liste von Leistungssensoren) |
| `inverter` | `name`, `state` (Text im blauen Kasten), `dc_voltage`, `dc_current`, `dc_power` (+ = Laden) |
| `pv_inverters` | Liste `{name, power, phases}` – AC-gekoppelte PV |
| `solar_chargers` | Liste `{name, power, voltage, current}` – MPPT-Laderegler |
| `battery` | `soc`, `power`, `voltage`, `current`, `temperature`, `state`, `ess_state` |
| `battery_monitors` | Liste `{name, soc, voltage, current, power, time_to_go}` |
| `total_solar`, `weather` | Gesamt-Solarleistung, Wetter-Entität |
| `energy` | Zähler für Diagramm und Vergleich: `grid_import`, `grid_export`, `solar` (Liste), `battery_charge`, `battery_discharge`, `consumption_power`, `exclude_from_baseload` (Liste, z. B. Wallbox und Wärmepumpe), `solar_reference`, `solar_today` |
| `forecast` | `name`, `consumption`/`solar` (`yesterday`, `today`, `tomorrow`, `current_hour`, `next_hour`), `hourly`, `archive`, `irradiance`, `use_energy_dashboard` |

Die Zähler brauchen **Langzeitstatistik** (`state_class: total_increasing`), der Ladestand und `consumption_power`
`state_class: measurement`. `forecast.irradiance` erwartet das Format der **DWD-Integration** (Attribut `data` mit
stündlichen Werten in W/m²).

## Zusätze (optional)

- [`packages/vrm_forecast_archive.yaml`](packages/vrm_forecast_archive.yaml): Template-Sensor, der die Prognose jedes Tages speichert (35 Tage).
- [VRM Forecast](https://github.com/Xander2980/ha-vrm-forecast): Integration, die die stündliche VRM-Prognose (Verbrauch,
  Grundlast, Solar) liest und über die Oberfläche mit dem VRM-Zugriffstoken eingerichtet wird. Empfohlen.
- [`node-red/vrm-forecast-flow.json`](node-red/vrm-forecast-flow.json): Alternative zur Integration – Node-RED-Flow, der die stündliche VRM-Prognose (Verbrauch, Grundlast, Solar)
  mit dem Node [victron-vrm-api](https://flows.nodered.org/node/victron-vrm-api) holt und `sensor.vrm_forecast_hours` schreibt.
  Nach dem Import im VRM-Node den eigenen VRM-Zugang und die Installation (Site-ID) wählen, im Sensor-Node den Home-Assistant-Server.

## Fehlersuche

- **Karte nicht gefunden**: Ressource prüfen und den Browser-Cache leeren.
- **Diagramm leer**: Die Zähler brauchen Langzeitstatistik (Entwicklerwerkzeuge → Statistik). Neue Sensoren liefern erst nach einer Stunde Werte.
- **Netz-Fluss falsch herum**: `grid: invert: true`.

## Lizenz

MIT – siehe [LICENSE](LICENSE).
