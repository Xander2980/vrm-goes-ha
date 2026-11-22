# VRM goes HA

Victron-VRM-Look für Home Assistant – zwei Teile:

> Inoffizielles Projekt, nicht mit Victron Energy verbunden und nicht von Victron Energy unterstützt. „Victron“, „Victron Energy“ und „VRM“ sind Marken bzw. Namen der Victron Energy B.V. und werden hier nur verwendet, um die Kompatibilität zu beschreiben.

| Ordner | Was | HACS-Typ |
|---|---|---|
| [`vrm-style-cards/`](vrm-style-cards/) | Lovelace-Karten im VRM-Stil (Übersicht, Charts, Vergleich, visueller Editor) | Plugin (Dashboard) |
| [`ha-vrm-forecast/`](ha-vrm-forecast/) | Integration: stündliche Verbrauchs-, Grundlast- und Solarprognose aus dem VRM-Portal (Dynamic ESS) | Integration |

Details und Installation stehen in der README des jeweiligen Ordners.

Hinweis: Die `.github/workflows` in den Unterordnern laufen hier nicht – sie sind für ein späteres eigenes GitHub-Repo pro Teil gedacht (HACS erwartet die Dateien im Repo-Root).
