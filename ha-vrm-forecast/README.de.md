# VRM Forecast für Home Assistant

[🇬🇧 English](README.md)

Liest die **stündliche Prognose aus dem Victron-VRM-Portal** (Verbrauch, Grundlast, Wallbox, Wärmepumpe, Solar – heute und
morgen) und stellt sie als Sensoren bereit. Einrichtung komplett über die Oberfläche: VRM-Zugriffstoken eingeben,
Installation wählen. Kein YAML, kein Node-RED.

Gedacht für die [VRM Style Cards](https://github.com/Xander2980/vrm-style-cards); die Sensoren lassen sich aber überall
nutzen (Automationen, Energieplanung, andere Karten).

> Kein offizielles Produkt von Victron Energy. „Victron“ und „VRM“ sind Marken der Victron Energy B.V.

## Installation

**HACS:** HACS → ⋮ → *Benutzerdefinierte Repositories* → `https://github.com/Xander2980/ha-vrm-forecast`, Typ **Integration** →
**VRM Forecast** installieren → Home Assistant neu starten.

**Von Hand:** `custom_components/vrm_forecast` nach `/config/custom_components/` kopieren und Home Assistant neu starten.

## Einrichtung

1. Im VRM-Portal ein Zugriffstoken erstellen: *Einstellungen → Integrationen → Zugriffstoken*
   (https://vrm.victronenergy.com/access-tokens).
2. Einstellungen → Geräte & Dienste → *Integration hinzufügen* → **VRM Forecast** → Token einfügen.
3. Installation wählen. Fertig – die Sensoren werden alle 15 Minuten aktualisiert (in den Optionen der Integration änderbar).

Das Token speichert Home Assistant wie bei jeder anderen Integration (in `.storage`), nicht in YAML.

## Sensoren (kWh)

| Sensor | Inhalt |
|---|---|
| Stundenprognose | Zustand = Verbrauch heute; Attribut `hours`: Liste `{t, consumption, baseload, ev, heat_pump, solar}` (t = Stundenbeginn in ms, kWh) für heute und morgen; Attribut `sources`: welche VRM-Reihen benutzt wurden |
| Verbrauch heute / morgen | Summe der stündlichen Verbrauchsprognose |
| Grundlast heute / morgen | Verbrauch − Wallbox − Wärmepumpe |
| Solar heute / morgen | Solarertrags-Prognose |
| Verbrauch / Solar aktuelle und nächste Stunde | Wert der laufenden bzw. nächsten Stunde (wechselt zur vollen Stunde) |

Die Prognose stammt aus der VRM-Statistik *Dynamic ESS* (`stats?type=dynamic_ess&interval=hours`). Gibt es eine angepasste
Prognose (`…_fc_adj`), wird sie genommen. Werte in Wh werden automatisch umgerechnet.

## Mit den VRM Style Cards

Im Karten-Editor **„VRM-Prognose-Integration erkennen“** drücken – die Sensoren werden eingetragen.

## Fehlersuche

- *Das Token ist ungültig* – neues Token erstellen; nur das Token kopieren (mit oder ohne vorangestelltes „Token“).
- Sensoren *unbekannt* – VRM hat für diese Installation noch keine Prognose (braucht einige Tage Verlauf).
- Debug-Log: `logger: logs: custom_components.vrm_forecast: debug`.

## Lizenz

MIT
