/*!
 * VRM Style Cards for Home Assistant
 * Energy flow overview, day chart with forecasts and forecast comparison in the style of the
 * Victron VRM portal. Every device (grid phases, PV inverters, solar chargers, battery monitors,
 * energy counters, forecast sources) is configured in YAML – see README.md.
 *
 * Not affiliated with or endorsed by Victron Energy. "Victron" and "VRM" are trademarks of Victron Energy B.V.
 * License: MIT
 */
const VRM_VERSION = "1.1.0";

// ---------------------------------------------------------------- Language (de / en)
let VRM_LANG = "en";
let VRM_LOCALE = "en";
let VRM_LANG_FIXED = false;
function vrmSetLang(hass, config) {
  const cfg = config && config.language;
  if (!cfg && VRM_LANG_FIXED) return;       // a card with an explicit "language:" decides for all cards
  if (cfg) VRM_LANG_FIXED = true;
  const hl = (hass && ((hass.locale && hass.locale.language) || hass.language)) || (navigator.language || "en");
  const l = String(cfg || hl).toLowerCase();
  VRM_LANG = l.startsWith("de") ? "de" : "en";
  VRM_LOCALE = cfg ? (VRM_LANG === "de" ? "de-DE" : "en-GB") : hl;
}
function vrmLoc() { return VRM_LOCALE || "en"; }
// Texts are written in German in the code and translated here (key = German text)
function L_(s, vars) {
  let r = VRM_LANG === "de" ? s : (VRM_EN[s] != null ? VRM_EN[s] : s);
  if (vars) for (const k of Object.keys(vars)) r = r.split(`{${k}}`).join(vars[k]);
  return r;
}

// ---------------------------------------------------------------- Configuration
// Turns the YAML configuration into the internal structure (see README.md for all options).
function vrmNormalize(cfg) {
  const c = cfg || {};
  const A = (x) => (x == null || x === "" ? [] : Array.isArray(x) ? x.filter((v) => v != null && v !== "") : [x]);
  const phases = (x) => A(x).map((p) => (typeof p === "string" ? { power: p } : Object.assign({}, p)));
  const grid = Object.assign({}, c.grid || {});
  grid.phases = phases(grid.phases);
  const loads = Object.assign({}, c.ac_loads || {});
  loads.phases = phases(loads.phases);
  const pvInverters = A(c.pv_inverters).map((p) => (typeof p === "string" ? { power: p, phases: [] } : Object.assign({}, p, { phases: phases(p.phases) })));
  const chargers = A(c.solar_chargers).map((m) => (typeof m === "string" ? { power: m } : Object.assign({}, m)));
  const monitors = A(c.battery_monitors).map((m) => (typeof m === "string" ? { soc: m } : Object.assign({}, m)));
  const battery = Object.assign({}, c.battery || {});
  const inverter = Object.assign({}, c.inverter || {});
  const en = c.energy || {}, fc = c.forecast || {}, fcc = fc.consumption || {}, fcs = fc.solar || {};
  const e = {
    bat_soc: battery.soc, weather: c.weather, sol_total: c.total_solar,
    e_grid_in: en.grid_import, e_grid_out: en.grid_export,
    e_solar_parts: A(en.solar), e_solar: en.solar_reference,
    e_bat_in: en.battery_charge, e_bat_out: en.battery_discharge,
    load_power: A(en.consumption_power), e_excl: A(en.exclude_from_baseload),
    fc_cons_yesterday: fcc.yesterday, fc_cons_today: fcc.today, fc_cons_tomorrow: fcc.tomorrow, fc_cons_cur: fcc.current_hour, fc_cons_next: fcc.next_hour,
    fc_solar_yesterday: fcs.yesterday, fc_solar_today: fcs.today, fc_solar_tomorrow: fcs.tomorrow, fc_sol_cur: fcs.current_hour,
    fc_hours: fc.hourly, fc_archive: fc.archive, irr: fc.irradiance,
  };
  return {
    title: c.title != null ? String(c.title) : "", icon: c.icon,
    grid, loads, pvInverters, chargers, monitors, battery, inverter,
    weather: c.weather, totalSolar: c.total_solar, solarToday: en.solar_today,
    show: c.show || {}, invert_grid: !!grid.invert,
    useEnergyForecast: fc.use_energy_dashboard !== false,
    get fcName() { return fc.name || L_("Prognose"); },
    e,
  };
}
// Sum of the means of several power sensors (statistics), only periods where all sensors have data
async function vrmMeanSum(hass, ids, q) {
  const r = await vrmWS(hass, Object.assign({ type: "recorder/statistics_during_period", statistic_ids: ids, types: ["mean"] }, q));
  const m = new Map();
  for (const id of ids) for (const x of r[id] || []) {
    if (x.mean == null) continue;
    const k = typeof x.start === "number" ? x.start : Date.parse(x.start);
    const o = m.get(k) || { start: k, end: x.end, mean: 0, n: 0 };
    o.mean += x.mean; o.n++; m.set(k, o);
  }
  return [...m.values()].filter((o) => o.n === ids.length).sort((a, b) => a.start - b.start);
}
// All entity ids of a configuration (to redraw only when one of them changes)
function vrmCollectIds(o, out = []) {
  if (typeof o === "string") { if (/^[a-z_]+\.[a-z0-9_]+$/.test(o)) out.push(o); }
  else if (Array.isArray(o)) o.forEach((x) => vrmCollectIds(x, out));
  else if (o && typeof o === "object") Object.values(o).forEach((x) => vrmCollectIds(x, out));
  return out;
}
// Energy value in kWh (Wh / kWh / MWh)
function vrmKwh(hass, id) {
  const v = vrmNum(hass, id);
  if (isNaN(v)) return NaN;
  const u = (hass.states[id].attributes || {}).unit_of_measurement;
  return u === "Wh" ? v / 1000 : u === "MWh" ? v * 1000 : v;
}
// Remaining time ("time to go") as hours text; the unit is taken from the sensor (s / min / h)
function vrmTtg(hass, id) {
  const v = vrmNum(hass, id);
  if (isNaN(v)) return "";
  const u = ((hass.states[id] || {}).attributes || {}).unit_of_measurement;
  const hrs = u === "h" ? v : u === "min" ? v / 60 : u === "d" ? v * 24 : v / 3600;
  return `${hrs.toFixed(hrs < 10 ? 2 : 1)} h`;
}
// Start configuration when the card is added in the dashboard editor:
// the form then offers "Detect Victron GX automatically"
function vrmStubConfig() {
  return { title: "Home" };
}

// English texts (key = German text used in the code)
const VRM_EN = {
  // overview
  "Zuletzt aktualisiert:": "Last update:", "Echtzeit": "Real-time", "Status:": "Status:", "Ortszeit:": "Local time:", "Offline": "Offline",
  "Netz": "Grid", "AC-Lasten": "AC Loads", "PV-Wechselrichter": "PV Inverter", "PV‑Wechsel&shy;richter": "PV In&shy;verter",
  "PV-Ladegerät": "PV Charger", "PV‑Lade&shy;gerät": "PV Char&shy;ger", "Spannung": "Voltage", "Strom": "Current", "Temperatur": "Temperature", "Temp.": "Temp.",
  "Batterie": "Battery", "Batteriewächter": "Battery monitor", "Laden": "Charging", "Entladen": "Discharging", "Leerlauf": "Idle", "aktiv": "active",
  "Gesamt Solar": "Total Solar", "kWh heute": "kWh today", "Wetter": "Weather", "Keine Vorhersage verfügbar": "No forecast available",
  "Heute": "Today", "Morgen": "Tomorrow",
  "Noch keine Geräte eingestellt – siehe Anleitung (grid, ac_loads, battery, pv_inverters, solar_chargers …).": "No devices configured yet – see the documentation (grid, ac_loads, battery, pv_inverters, solar_chargers …).",
  // weather
  "Klar": "Clear", "Bewölkt": "Cloudy", "Unwetter": "Severe weather", "Nebel": "Fog", "Hagel": "Hail", "Gewitter": "Thunderstorm",
  "Teils bewölkt": "Partly cloudy", "Starkregen": "Heavy rain", "Regen": "Rain", "Schnee": "Snow", "Schneeregen": "Sleet", "Sonnig": "Sunny", "Windig": "Windy",
  // system / ESS states
  "Externe Strg": "External control", "Aus": "Off", "Energiesparmodus": "Low power", "Fehler": "Fault", "Bulk": "Bulk", "Absorption": "Absorption",
  "Erhaltung": "Float", "Lagerung": "Storage", "Ausgleich": "Equalize", "Durchschalten": "Passthru", "Wechselrichten": "Inverting", "Power Assist": "Power assist",
  "Netzteil": "Power supply", "Geplantes Laden": "Scheduled charging", "Eigenverbrauch": "Self-consumption", "Minimaler SoC erreicht": "Min SoC reached",
  "Batterie voll": "Battery full", "Entladen deaktiviert": "Discharge disabled", "Zwangsladung": "Forced charge", "Nachladen": "Recharge",
  "Geladen halten": "Keep charged", "Langsames Laden": "Slow charge", "Nachladen (niedriger SoC)": "Recharge (low SoC)",
  // chart
  "Verbrauch": "Consumption", "Solar": "Solar", "Solarprognose": "Solar forecast", "Solarprognose (eigene)": "Solar forecast (own)",
  "Verbrauchsprognose": "Consumption forecast", "Grundlastprognose": "Base load forecast", "Zum Netz": "To grid", "Aus dem Netz": "From grid",
  "Gesamtverbrauch": "Total consumption", "Gesamt": "Total", "Gesamtprognose": "Total forecast", "Lade Daten …": "Loading data …",
  "Zurück": "Back", "Weiter": "Next", "Jetzt": "Now", "KW": "Wk", "Prognose": "Forecast", "Fehler beim Laden": "Error while loading",
  "Schnellauswahl": "Quick select", "Zeiträume": "Periods", "Zukunft": "Future", "Tag wählen": "Choose day", "Benutzerdefiniert": "Custom",
  "Datum": "Date", "Von": "From", "Bis": "To", "Übernehmen": "Apply",
  "Letzten 2 Tage": "Last 2 days", "Letzten 7 Tage": "Last 7 days", "Letzten 30 Tage": "Last 30 days", "Letzte 12 Wochen": "Last 12 weeks",
  "Letzten 6 Monate": "Last 6 months", "Letzte 12 Monate": "Last 12 months", "Gestern": "Yesterday", "Tag davor": "Day before",
  "Heute vor einer Woche": "Today last week", "Voriger Monat": "Previous month", "Vorige Woche": "Previous week", "Diese Woche": "This week",
  "Dieser Monat": "This month", "Dieses Jahr": "This year", "Letztes Jahr": "Last year", "Letzte Stunde": "Last hour", "Letzten 3 Stunden": "Last 3 hours",
  "Letzten 6 Stunden": "Last 6 hours", "Letzten 12 Stunden": "Last 12 hours", "Letzten 24 Stunden": "Last 24 hours", "Letzten 48 Stunden": "Last 48 hours",
  "Übermorgen": "Day after tomorrow", "Vorgestern": "Day before yesterday", "Nächsten 2 Tage": "Next 2 days", "Nächsten 7 Tage": "Next 7 days",
  "Kürzlich und bevorstehend": "Recent and upcoming",
  // comparison
  "Grundlastprognose – Vergleich": "Base load forecast – comparison", "Solarprognose – Vergleich": "Solar forecast – comparison",
  "Eigene Berechnung (Verbrauch ohne ausgenommene Verbraucher, Median der 7 Tage davor) gegen {fc}":
    "Own calculation (consumption without excluded loads, median of the previous 7 days) vs. {fc}",
  "Eigene Prognose (Klarhimmel-Ertrag aus 21 Tagen × Globalstrahlungs-Prognose, sonst Bewölkung) gegen {fc}":
    "Own forecast (clear-sky yield of the last 21 days × irradiance forecast, otherwise cloud cover) vs. {fc}",
  "Grundlast Ist": "Base load actual", "Solar Ist": "Solar actual", "Grundlast – tatsächlich (Tag)": "Base load – actual (day)", "Solar – tatsächlich (Tag)": "Solar – actual (day)",
  "Keine Grundlast von {fc} für diesen Tag (stündliche Prognose nur für heute/morgen)": "No base load from {fc} for this day (hourly forecast only for today/tomorrow)",
  "Keine Solarprognose von {fc} für diesen Tag": "No solar forecast from {fc} for this day",
  "Eigene Berechnung": "Own calculation", "Eigene Prognose (Tag)": "Own forecast (day)", "{fc} (Tag)": "{fc} (day)",
  "Abweichung eigen − {fc}": "Difference own − {fc}", "Mittl. Fehler je Stunde": "Mean error per hour", "Bewölkung": "Cloud cover",
  "eigene Prognose": "own forecast", "für diesen Tag nicht verfügbar": "not available for this day",
  "Einstrahlung direkt kalibriert ({n} Tage)": "Irradiance, directly calibrated ({n} days)", "Einstrahlung × Klarhimmel": "Irradiance × clear sky",
  "Bewölkung (keine Einstrahlung)": "Cloud cover (no irradiance)", "zu wenig Daten": "not enough data", "Klarhimmel": "Clear sky", "vom": "from",
  "gespeicherte Prognose": "stored forecast", "Nachrechnung mit gemessenem Wetter (kein Archiv)": "recalculated with measured weather (no archive)",
  "aus Verlauf des Stundensensors": "from the hourly sensor history", "gegenüber": "vs.", "noch keine Ist-Werte für diesen Tag": "no actual values for this day yet",
  "ganzer Tag · Ist gegenüber Prognose": "whole day · actual vs. forecast", "eigen": "own", "bis": "until", "Prognose bis dahin": "forecast until then",
  "über {n} Stunde mit Ist-Werten – kleiner ist besser": "over {n} hour with actual values – lower is better",
  "über {n} Stunden mit Ist-Werten – kleiner ist besser": "over {n} hours with actual values – lower is better",
  // editor
  "Aktuelle Stunde": "Current hour",
  "Allgemein": "General",
  "Automatisch": "Automatic",
  "Batterie entladen": "Battery discharged",
  "Batterie geladen": "Battery charged",
  "Bezug ist negativ (umkehren)": "Import is negative (invert)",
  "DC-Leistung (+ = Laden)": "DC power (+ = charging)",
  "DC-Spannung": "DC voltage",
  "DC-Strom": "DC current",
  "Deutsch": "Deutsch",
  "Diagramm": "Chart",
  "Dunkel": "Dark",
  "ESS-Bezeichnung": "ESS label",
  "ESS-Zustand": "ESS state",
  "Einspeisung": "Grid export",
  "Einstrahlungsprognose (DWD)": "Irradiance forecast (DWD)",
  "Energiezähler (Diagramm)": "Energy counters (chart)",
  "English": "English",
  "Entfernen": "Remove",
  "Gesamt-Solarleistung (optional)": "Total solar power (optional)",
  "Grundlast-Vergleich": "Base load comparison",
  "Hell": "Light",
  "Integration „VRM goes HA“ nicht gefunden.": "Integration \"VRM goes HA\" not found.",
  "Karten": "Cards",
  "Keine Geräte der Victron-GX-Integration gefunden.": "No devices of the Victron GX integration found.",
  "Laderegler": "Solar charger",
  "Ladestand": "State of charge",
  "Leistung": "Power",
  "Leistung (optional, sonst Summe der Phasen)": "Power (optional, otherwise sum of phases)",
  "Leistung je Phase (optional)": "Power per phase (optional)",
  "Name": "Name",
  "Name der Prognose (z. B. VRM)": "Name of the forecast (e.g. VRM)",
  "Netzbezug": "Grid import",
  "Nicht zur Grundlast (z. B. Wallbox, Wärmepumpe)": "Not part of the base load (e.g. EV charger, heat pump)",
  "Nächste Stunde": "Next hour",
  "PV-Laderegler (MPPT)": "Solar chargers (MPPT)",
  "PV-Spannung": "PV voltage",
  "PV-Strom": "PV current",
  "PV-Wechselrichter (AC)": "PV inverters (AC)",
  "Phase": "Phase",
  "Phasen": "Phases",
  "Prognose-Archiv": "Forecast archive",
  "Prognose-Sensoren übernommen.": "Forecast sensors added.",
  "Prognosen": "Forecasts",
  "Restlaufzeit": "Time to go",
  "Solar heute (optional)": "Solar today (optional)",
  "Solar-Ersatzzähler (optional)": "Solar fallback counter (optional)",
  "Solarprognose (kWh)": "Solar forecast (kWh)",
  "Solarprognose des Energie-Dashboards nutzen": "Use the solar forecast of the energy dashboard",
  "Solarprognose-Vergleich": "Solar forecast comparison",
  "Solarzähler (werden addiert)": "Solar counters (added up)",
  "Stundenprognose (Attribut hours)": "Hourly forecast (attribute hours)",
  "Suche …": "Searching …",
  "Symbol": "Icon",
  "Systemzustand": "System state",
  "Titel": "Title",
  "VRM-Prognose-Integration erkennen": "Detect VRM forecast integration",
  "Verbrauchsleistung (W, werden addiert)": "Consumption power (W, added up)",
  "Verbrauchsprognose (kWh)": "Consumption forecast (kWh)",
  "Vergleich": "Comparison",
  "Victron GX automatisch erkennen": "Detect Victron GX automatically",
  "Wechselrichter / Lader": "Inverter / charger",
  "Zustand": "State",
  "{n} Geräte übernommen – bitte prüfen.": "{n} devices added – please check.",
  "Übersicht": "Overview",
  "Sprache": "Language",
  "Design": "Theme",
  "Name der Prognose": "Forecast name",
};
const VRM_FONT = `"Museo Sans", -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;

function vrmNum(hass, id) {
  const s = hass && id ? hass.states[id] : undefined;
  if (!s) return NaN;
  const v = parseFloat(s.state);
  return isNaN(v) ? NaN : v;
}
function vrmStr(hass, id) {
  const s = hass && id ? hass.states[id] : undefined;
  return s ? s.state : "";
}
function fW(v) { return isNaN(v) ? "–" : `${Math.round(v)}`; }
function fA(v) { if (isNaN(v)) return "–"; return Math.abs(v) < 0.05 ? "0" : v.toFixed(1); }
function fV(v, d) { return isNaN(v) ? "–" : v.toFixed(d); }
function fP(v) { return isNaN(v) ? "–" : v.toFixed(1); }
function sum(arr) { const f = arr.filter((x) => !isNaN(x)); return f.length ? f.reduce((a, b) => a + b, 0) : NaN; }

const BAT_STATE = { idle: "Leerlauf", charging: "Laden", discharging: "Entladen" };
const BAT_STATE_EN = { idle: "Idle", charging: "Charging", discharging: "Discharging" };
const ESS_STATE = {
  self_consumption: "Eigenverbrauch",
  self_consumption_soc_below_min: "Minimaler SoC erreicht",
  self_consumption_soc_above_min: "Eigenverbrauch",
  soc_below_min: "Minimaler SoC erreicht",
  self_consumption_full: "Batterie voll",
  battery_full: "Batterie voll",
  discharge_disabled: "Entladen deaktiviert",
  force_charge: "Zwangsladung",
  recharge: "Nachladen",
  keep_charged: "Geladen halten",
  sustain: "Erhaltung",
  slow_charge: "Langsames Laden",
  low_soc_recharge: "Nachladen (niedriger SoC)",
  scheduled_charge: "Geplantes Laden",
};
const SYS_STATE = {
  external_control: "Externe Strg",
  off: "Aus", low_power: "Energiesparmodus", fault: "Fehler", bulk: "Bulk",
  absorption: "Absorption", float: "Erhaltung", storage: "Lagerung", equalize: "Ausgleich",
  passthru: "Durchschalten", inverting: "Wechselrichten", power_assist: "Power Assist",
  power_supply: "Netzteil", sustain: "Erhaltung", discharging: "Entladen", charging: "Laden",
  scheduled_charging: "Geplantes Laden",
};
// Sonnenhöhe (cos Zenit) für Zeitpunkt t (ms) und Ort – NOAA-Näherung
function vrmSunCos(t, lat, lon) {
  const d = new Date(t), rad = Math.PI / 180;
  const doy = Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 0)) / 864e5);
  const g = 2 * Math.PI / 365 * (doy - 1 + (d.getUTCHours() - 12) / 24);
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const tst = d.getUTCHours() * 60 + d.getUTCMinutes() + eqt + 4 * lon;
  const ha = (tst / 4 - 180) * rad;
  return Math.sin(lat * rad) * Math.sin(decl) + Math.cos(lat * rad) * Math.cos(decl) * Math.cos(ha);
}
// Klarhimmel-Globalstrahlung (Haurwitz) in W/m²
function vrmGhiClear(t, lat, lon) { const c = vrmSunCos(t, lat, lon); return c <= 0 ? 0 : 1098 * c * Math.exp(-0.057 / c); }
// Gemeinsamer Abfrage-Cache für alle Karten (4,5 min), damit gleiche Statistik-Abfragen nur einmal laufen
const VRM_WS_CACHE = new Map();
function vrmWS(h, msg) {
  if (msg.type === "recorder/statistics_during_period") {
    // HA rejects null ids and an empty list – drop unset sensors, skip the call if none remain
    const ids = (msg.statistic_ids || []).filter(Boolean);
    if (!ids.length) return Promise.resolve({});
    msg = Object.assign({}, msg, { statistic_ids: ids });
  }
  const k = JSON.stringify(msg), n = Date.now(), c = VRM_WS_CACHE.get(k);
  if (c && n - c.t < 270000) return c.p;
  const p = h.callWS(msg);
  VRM_WS_CACHE.set(k, { t: n, p });
  p.catch(() => VRM_WS_CACHE.delete(k));
  if (VRM_WS_CACHE.size > 80) for (const [kk, v] of VRM_WS_CACHE) if (n - v.t > 270000) VRM_WS_CACHE.delete(kk);
  return p;
}
function vrmNowQ() { return Math.floor(Date.now() / 300000) * 300000; }
function vrmMedian(a) { if (!a.length) return 0; const b = a.slice().sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; }
function mapState(map, s) {
  if (!s || s === "unknown" || s === "unavailable") return "–";
  return map[s] ? L_(map[s]) : s.replace(/_/g, " ");
}

// ---------------------------------------------------------------- Theme (hell/dunkel nach HA)
const VRM_THEME_CSS = `
  .wrap { --bg:#ffffff; --box:#ffffff; --low:#f8f7f3; --bd:#dedede; --sep:#e2e0da; --t1:#222222; --t2:#3d3d3d; --t3:#6b6b6b;
          --rail:#d8d8d8; --railin:#ffffff; --hl:#e5e3df; --hlt:#efede9; --grid:#eeeeee; --ax:#555555; --yax:#5a7a99; --hatch:#ffffff; }
  .wrap.dark { --bg:#3b3a38; --box:#3b3a38; --low:#3b3a38; --bd:#5a5852; --sep:#5a5852; --t1:#f4f4f4; --t2:#e2e2e2; --t3:#bdbcb8;
          --rail:#62605a; --railin:#3b3a38; --hl:#4c4b48; --hlt:#2c2b29; --grid:#4a4946; --ax:#8d8b86; --yax:#d0d0d0; --hatch:#3b3a38; }
  .wrap { position:relative; width:100%; overflow:hidden; background:var(--bg); border-radius:var(--ha-card-border-radius,12px); }
  .stage { position:absolute; left:0; top:0; transform-origin:0 0; font-family:${VRM_FONT}; color:var(--t1); background:var(--bg); }
  .tx1 { fill:var(--t1); } .tx2 { fill:var(--t2); } .tx3 { fill:var(--t3); } .txy { fill:var(--yax); }
  .ax { stroke:var(--ax); } .gl { stroke:var(--grid); } .hl { fill:var(--hl); } .hlt { fill:var(--hlt); } .hbg { fill:var(--hatch); }
`;
function vrmDark(hass, config) {
  if (config && config.theme === "dark") return true;
  if (config && config.theme === "light") return false;
  return !!(hass && hass.themes && hass.themes.darkMode);
}
function vrmIsMobile(el) {
  const w = el.clientWidth || (el.parentElement && el.parentElement.clientWidth) || window.innerWidth;
  return w < 700;
}

// ---------------------------------------------------------------- Overview card (energy flow)
// Weather conditions (HA weather) → label + icon
const VRM_WX = {
  "clear-night": ["Klar", "mdi:weather-night"], cloudy: ["Bewölkt", "mdi:weather-cloudy"], exceptional: ["Unwetter", "mdi:alert-circle-outline"],
  fog: ["Nebel", "mdi:weather-fog"], hail: ["Hagel", "mdi:weather-hail"], lightning: ["Gewitter", "mdi:weather-lightning"],
  "lightning-rainy": ["Gewitter", "mdi:weather-lightning-rainy"], partlycloudy: ["Teils bewölkt", "mdi:weather-partly-cloudy"],
  pouring: ["Starkregen", "mdi:weather-pouring"], rainy: ["Regen", "mdi:weather-rainy"], snowy: ["Schnee", "mdi:weather-snowy"],
  "snowy-rainy": ["Schneeregen", "mdi:weather-snowy-rainy"], sunny: ["Sonnig", "mdi:weather-sunny"], windy: ["Windig", "mdi:weather-windy"],
  "windy-variant": ["Windig", "mdi:weather-windy-variant"],
};
// Area sparkline over the whole day (values per 5 minutes, index 0 = 00:00)
function vrmSpark(vals, w, h) {
  const n = 288, max = Math.max(1, ...vals.filter((v) => v != null));
  let d = "", first = null, last = null;
  vals.forEach((v, i) => {
    if (v == null) return;
    const x = (i / (n - 1)) * w, y = h - 1 - (v / max) * (h - 4);
    d += `${first == null ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)} `;
    if (first == null) first = x; last = x;
  });
  if (first == null) return "";
  return `<path d="${d}L${last.toFixed(1)} ${h} L${first.toFixed(1)} ${h} Z" fill="#fbe6c8" stroke="none"/><path d="${d}" fill="none" stroke="#f5b55a" stroke-width="1.2"/>`;
}
function B_(b) { return b[1] + b[3]; }
function vrmEsc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

class VrmOverviewCard extends HTMLElement {
  setConfig(config) {
    this._config = config || {};
    this._c = vrmNormalize(this._config);
    this._e = this._c.e;
    this._mode = null;
    this._ids = null;
  }
  static getStubConfig() { return vrmStubConfig(); }
  static getConfigElement() { return document.createElement("vrm-card-editor"); }
  getCardSize() { return 14; }
  getGridOptions() { return { columns: "full", rows: "auto" }; }

  connectedCallback() {
    if (!this._ro) this._ro = new ResizeObserver(() => this._onResize());
    this._ro.observe(this);
  }
  disconnectedCallback() { if (this._ro) this._ro.disconnect(); }

  _onResize() {
    if (!this._hass) return;
    const mob = vrmIsMobile(this);
    if ((mob ? "mob" : "desk") !== this._mode) this.hass = this._hass;
    else this._scale();
  }

  _scale() {
    if (!this._stage || !this._lay) return;
    const Lw = this._lay.W, Lh = this._lay.H;
    const w = this.clientWidth || Lw;
    const s = this._mode === "mob" ? w / Lw : Math.min(1, w / Lw);
    const fcH = this._mode === "mob" && this._wxOpen && this._wxH ? this._wxH + 10 : 0;   // expanded weather forecast (mobile: below the card)
    this._stage.style.transform = `scale(${s})`;
    this._stage.style.height = `${Lh + fcH}px`;
    this._stage.style.left = `${Math.max(0, (w - Lw * s) / 2)}px`;
    this._wrap.style.height = `${Math.ceil((Lh + fcH) * s)}px`;
  }

  // ---- what is configured --------------------------------------------------
  _has() {
    const c = this._c;
    return {
      grid: !!(c.grid.power || c.grid.phases.length),
      load: !!(c.loads.power || c.loads.phases.length),
      pvinv: c.pvInverters.length > 0,
      mppt: c.chargers.length > 0,
      bat: !!(c.battery.soc || c.battery.power || c.battery.voltage),
      sol: c.show.total_solar !== false && !!(c.totalSolar || c.pvInverters.length || c.chargers.length),
      wx: c.show.weather !== false && !!c.weather,
      devs: c.show.devices !== false ? this._devList().length : 0,
    };
  }
  _devList() {
    const c = this._c, out = c.monitors.map((m, k) => ({ id: `d${k}`, p: `m${k}_`, mon: m }));
    if (c.inverter.name && (c.inverter.dc_power || c.inverter.dc_voltage)) out.push({ id: "d_inv", p: "mu_", inv: true });
    return out;
  }
  _pvRows() {
    // one inverter with phases → one row per phase, several inverters → one row per inverter
    const P = this._c.pvInverters;
    if (P.length === 1 && P[0].phases.length) return P[0].phases.map((ph, i) => ({ l: `L${i + 1}`, w: ph.power }));
    return P.map((p) => ({ l: p.name || "", w: p.power, wide: true }));
  }

  // ---- layout (absolute positions, like the VRM portal) -------------------
  _batRows() {
    const b = this._c.battery;
    return [["Spannung", "bat_v", "V", b.voltage], ["Strom", "bat_a", "A", b.current], ["Temperatur", "bat_t", "°C", b.temperature]].filter((r) => r[3]);
  }
  _layout(mode) {
    const has = this._has();
    const nB = this._batRows().length + (this._c.battery.ess_state ? 1 : 0);
    const gPh = Math.min(3, this._c.grid.phases.length), lPh = Math.min(3, this._c.loads.phases.length);
    const mob = mode === "mob";
    const pvRows = this._pvRows(), nM = this._c.chargers.length, devs = this._devList();
    const L = { mob, has, boxes: {} };
    if (!mob) {
      const pvH = 117 + Math.max(1, pvRows.length) * 32 + 20;
      const mH = 117 + Math.max(1, nM) * 41 + 25;
      L.boxes = {
        grid: [22, 105, 312, gPh ? 138 + gPh * 32 : 118], load: [366, 105, 312, lPh ? 138 + lPh * 32 : 118], pvinv: [22, 495, 312, pvH],
        bat: [366, 545, 312, has.bat ? 118 + (nB ? nB * 32 + 20 : 0) : 0], mppt: [710, 495, 312, mH],
      };
      const gB = B_(L.boxes.grid) - 1, lB = B_(L.boxes.load) - 1;
      let bottom = 480;
      for (const k of ["pvinv", "bat", "mppt"]) if (has[k]) bottom = Math.max(bottom, L.boxes[k][1] + L.boxes[k][3]);
      const perRow = Math.min(3, Math.max(1, devs.length)), dw = 1030 / perRow;
      L.devs = devs.map((d, i) => ({ d, x: 8 + (i % perRow) * dw, y: bottom + 17 + Math.floor(i / perRow) * 72, w: dw + 1 }));
      const devBottom = devs.length && has.devs ? bottom + 17 + Math.ceil(devs.length / perRow) * 72 : bottom + 6;
      L.side = has.sol || has.wx;
      L.W = L.side ? 1400 : 1046;
      L.H = Math.max(devBottom + 5, has.wx || has.sol ? 400 : 0);
      L.rails = [];
      L.flows = {};
      const rail = (id, d) => { L.rails.push(d); if (id) L.flows[id] = d; };
      if (has.grid) rail("f_grid", `M180 ${gB} V418`);
      if (has.pvinv) rail("f_pvinv", "M180 495 V418");
      if (has.grid || has.pvinv) rail("f_bus", "M180 418 H372");
      if (has.load) rail("f_load", `M372 418 V${lB}`);
      rail("f_inv", "M372 418 H472");
      if (has.bat || has.mppt) rail("f_bat", "M522 479 V545");
      if (has.mppt) { rail(null, "M522 522 H710"); L.flows.f_mppt = "M710 522 H522"; }
      L.solBox = [1062, 105, 330, 118]; L.wxBox = [1062, has.sol ? 233 : 105, 330, 132];
    } else {
      const pvH = 76 + Math.max(1, pvRows.length) * 28;
      const mH = 78 + Math.max(1, nM) * 65;
      L.boxes = {
        grid: [10, 62, 114, gPh ? 62 + gPh * 40 : 62], load: [140, 62, 114, lPh ? 62 + lPh * 28 : 62], pvinv: [10, 400, 114, pvH],
        bat: [140, 450, 114, has.bat ? 110 + this._batRows().length * 44 + (this._c.battery.ess_state ? 62 : 0) : 0], mppt: [269, 400, 114, mH],
      };
      const gBm = B_(L.boxes.grid), lBm = B_(L.boxes.load);
      let bottom = 390;
      for (const k of ["pvinv", "bat", "mppt"]) if (has[k]) bottom = Math.max(bottom, L.boxes[k][1] + L.boxes[k][3]);
      L.devs = devs.map((d, i) => ({ d, x: 10, y: bottom + 14 + i * 62, w: 373 }));
      let y = devs.length && has.devs ? bottom + 14 + devs.length * 62 + 10 : bottom + 10;
      if (has.sol && has.wx) { L.solBox = [10, y, 181, 112]; L.wxBox = [202, y, 181, 112]; y += 112 + 6; }
      else if (has.sol) { L.solBox = [10, y, 373, 112]; y += 118; }
      else if (has.wx) { L.wxBox = [10, y, 373, 112]; y += 118; }
      L.fcTop = y;
      L.W = 393; L.H = y;
      L.rails = []; L.flows = {};
      const rail = (id, d) => { L.rails.push(d); if (id) L.flows[id] = d; };
      if (has.grid) rail("f_grid", `M67 ${gBm} V333`);
      if (has.pvinv) rail("f_pvinv", "M67 400 V333");
      if (has.grid || has.pvinv) rail("f_bus", "M67 333 H153");
      if (has.load) rail("f_load", `M153 333 V${lBm}`);
      rail("f_inv", "M153 333 H160");
      if (has.bat || has.mppt) rail("f_bat", "M207 382 V450");
      if (has.mppt) { rail(null, "M207 425 H269"); L.flows.f_mppt = "M269 425 H207"; }
    }
    return L;
  }

  _svg(L) {
    return `<svg class="flows" width="${L.W}" height="${L.H}">
    <g fill="none" stroke-linecap="square">
      ${L.rails.map((d) => `<path d="${d}" style="stroke:var(--rail)" stroke-width="7"/><path d="${d}" style="stroke:var(--railin)" stroke-width="3.4"/>`).join("")}
    </g>
    ${Object.entries(L.flows).map(([id, d]) => `<path id="${id}" class="dash off" d="${d}"/>`).join("")}
  </svg>`;
  }

  _commonCss() {
    return `
  :host { display:block; }
  ${VRM_THEME_CSS}
  .abs { position:absolute; }
  .box { position:absolute; background:var(--box); border:1px solid var(--bd); border-radius:3px; box-sizing:border-box; overflow:hidden; cursor:pointer; }
  .box .top { position:relative; box-sizing:border-box; }
  .box .lower { background:var(--low); border-top:1px solid var(--sep); position:absolute; left:0; right:0; bottom:0; box-sizing:border-box; }
  .ttl { display:flex; align-items:center; gap:6px; color:var(--t2); }
  .ttl span { overflow:hidden; text-overflow:ellipsis; }
  .big { color:var(--t1); } .big .u { color:var(--t3); }
  b { font-weight:500; color:var(--t1); }
  .meta-k { color:var(--t3); }
  .meta-v { font-weight:600; color:var(--t2); display:flex; align-items:center; gap:4px; }
  .rt { overflow:hidden; flex:none; }
  .rt path { fill:none; stroke:#4a90d9; stroke-width:2.2; stroke-linecap:round; animation:vrmwave 1.2s linear infinite; }
  .rt.off path { animation:none; opacity:.4; }
  @keyframes vrmwave { from { transform:translateX(0); } to { transform:translateX(12px); } }
  .inv { position:absolute; border:1px solid #2f73b9; border-radius:3px; overflow:hidden; cursor:pointer; box-sizing:border-box; }
  .inv .blue { background:#3b84cc; position:relative; display:flex; align-items:center; justify-content:center; }
  .inv .blue:after { content:""; position:absolute; left:0; right:0; height:4px; background:#f0a63a; }
  .inv .blue ha-icon { color:#fff; }
  .inv .lbl { background:var(--box); color:#3c87d6; display:flex; align-items:center; justify-content:center; text-align:center; }
  .badge { position:absolute; width:22px; height:14px; border-radius:7px; background:#ec6b6b; display:flex; align-items:center; justify-content:center; }
  .badge ha-icon { --mdc-icon-size:11px; color:#fff; }
  .ess { color:#3c87d6; display:flex; align-items:center; gap:4px; }
  .dev { position:absolute; border:1px solid var(--bd); box-sizing:border-box; cursor:pointer; background:var(--box); overflow:hidden; }
  .dev .a { display:flex; align-items:center; gap:6px; color:var(--t1); white-space:nowrap; }
  .dev .a ha-icon { color:#3c87d6; flex:none; }
  .dev .a .p { margin-left:auto; }
  .dev .act { color:#3c87d6; font-size:.85em; white-space:nowrap; }
  .dev.active { border-color:#3c87d6; }
  .dev .b { display:flex; gap:16px; color:var(--t1); white-space:nowrap; }
  .dev .b .s { margin-left:auto; }
  svg.flows { position:absolute; left:0; top:0; pointer-events:none; }
  .dash { stroke:#4b9be6; stroke-width:3; fill:none; stroke-dasharray:7 44; animation:vrmflow 1.6s linear infinite; }
  .dash.rev { animation-direction:reverse; }
  .dash.off { display:none; }
  @keyframes vrmflow { from { stroke-dashoffset:51; } to { stroke-dashoffset:0; } }
  .spark { position:absolute; left:0; right:0; bottom:0; display:block; }
  .sol .kwh { position:absolute; color:var(--t2); }
  .wx { cursor:default; }
  .wx .cond { position:absolute; color:var(--t2); }
  .wx .wxi { position:absolute; color:#3c87d6; }
  .wx .tog { position:absolute; left:0; right:0; bottom:0; border-top:1px solid var(--sep); background:var(--low); display:flex; align-items:center; justify-content:center; cursor:pointer; color:#3c87d6; }
  .wxfc { position:absolute; background:var(--box); border:1px solid var(--bd); border-top:none; box-sizing:border-box; display:none; }
  .wxfc.open { display:block; }
  .wxfc .fr { display:flex; align-items:center; border-bottom:1px solid var(--sep); color:var(--t2); }
  .wxfc .fr:last-child { border-bottom:none; }
  .wxfc .fr .d { flex:1; } .wxfc .fr ha-icon { color:#3c87d6; } .wxfc .fr .tt { text-align:right; } .wxfc .fr .tt span { color:var(--t3); }
  .cfgerr { position:absolute; left:20px; right:20px; top:20px; padding:12px 16px; border:1px solid #e2554f; border-radius:4px; color:var(--t1); font-size:13px; background:var(--box); }`;
  }

  _boxStyle(b) { return `left:${b[0]}px;top:${b[1]}px;width:${b[2]}px;height:${b[3]}px`; }

  _deskHtml(L) {
    const c = this._c, has = L.has, B = L.boxes, bat = c.battery;
    const pvRows = this._pvRows();
    const ph3 = (arr, f) => arr.slice(0, 3).map(f).join("");
    return `<style>${this._commonCss()}
  .stage { width:${L.W}px; height:${L.H}px; }
  .box .top { height:117px; padding:14px 16px 0 16px; }
  .box .lower { padding:6px 16px 0 16px; }
  .ttl { font-size:12.5px; } .ttl ha-icon { --mdc-icon-size:17px; }
  .big { font-size:27px; margin-top:12px; letter-spacing:.2px; }
  .row { display:flex; align-items:center; height:32px; font-size:11.5px; border-bottom:1px solid var(--sep); color:var(--t2); }
  .row:last-child { border-bottom:none; }
  .row .l { color:var(--t3); width:20px; } .row .l.wide { width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; } .row .c { flex:1; } .row .k { color:var(--t3); width:88px; }
  .mrow { padding:4px 0 6px 0; border-bottom:1px solid var(--sep); font-size:11.5px; color:var(--t2); }
  .mrow:last-child { border-bottom:none; } .mrow .n { margin-bottom:2px; }
  .mrow .v { display:flex; } .mrow .v span { flex:1; }
  .hdr-title { font-size:34px; font-weight:600; color:var(--t1); letter-spacing:.3px; white-space:nowrap; }
  .hdr-icon { width:62px; height:62px; border-radius:50%; background:var(--hl); display:flex; align-items:center; justify-content:center; }
  .hdr-icon ha-icon { --mdc-icon-size:30px; color:var(--t3); }
  .meta-k { font-size:12px; } .meta-v { font-size:13px; margin-top:6px; } .meta-v ha-icon { --mdc-icon-size:18px; }
  .inv { left:472px; top:355px; width:100px; height:124px; }
  .inv .blue { height:92px; } .inv .blue:after { top:48px; } .inv .blue ha-icon { --mdc-icon-size:38px; margin-top:-26px; }
  .inv .lbl { height:31px; font-size:11.5px; }
  .badge { right:30px; top:28px; }
  .ess { position:absolute; right:16px; top:46px; font-size:12.5px; } .ess ha-icon { --mdc-icon-size:16px; }
  .topright { position:absolute; right:16px; top:16px; font-size:11.5px; color:var(--t3); }
  .dev { height:66px; padding:10px 12px; font-size:12px; }
  .dev .a ha-icon { --mdc-icon-size:17px; } .dev .b { margin-top:6px; padding-left:23px; gap:12px; }
  .wxfc .fr { height:32px; } .wxfc .fr ha-icon { --mdc-icon-size:20px; margin-right:18px; } .wxfc .fr .tt { width:90px; }
</style>
<div class="wrap"><div class="stage">
  <div class="abs hdr-icon" style="left:8px;top:22px"><ha-icon icon="${vrmEsc(c.icon || "mdi:home-lightning-bolt-outline")}"></ha-icon></div>
  <div class="abs hdr-title" style="left:88px;top:30px" id="title"></div>
  <div class="abs" style="left:770px;top:40px"><div class="meta-k">${L_("Zuletzt aktualisiert:")}</div><div class="meta-v"><svg class="rt" id="rt" viewBox="0 0 24 14" width="22" height="13"><path d="M-12 7 q3 -8 6 0 t6 0 t6 0 t6 0 t6 0 t6 0 t6 0"/></svg><span id="upd">${L_("Echtzeit")}</span></div></div>
  <div class="abs" style="left:910px;top:40px"><div class="meta-k">${L_("Status:")}</div><div class="meta-v"><span id="stat">OK</span></div></div>
  <div class="abs" style="left:975px;top:40px"><div class="meta-k">${L_("Ortszeit:")}</div><div class="meta-v"><span id="clock"></span></div></div>
  ${this._svg(L)}
  ${has.grid ? `<div class="box" id="b_grid" style="${this._boxStyle(B.grid)}">
    <div class="top"><div class="ttl"><ha-icon icon="mdi:transmission-tower" style="color:#e2554f"></ha-icon><span>${vrmEsc(c.grid.name || L_("Netz"))}</span></div>
      <div class="big"><span id="grid_p"></span> <span class="u">W</span></div></div>
    ${B.grid[3] > 118 ? `<div class="lower" style="height:${B.grid[3] - 118}px">
      ${ph3(c.grid.phases, (p, i) => `<div class="row"><span class="l">L${i + 1}</span><span class="c">${p.voltage ? `<b id="gv${i}"></b> V` : ""}</span><span class="c">${p.current ? `<b id="ga${i}"></b> A` : ""}</span><span class="c">${p.power ? `<b id="gw${i}"></b> W` : ""}</span></div>`)}
    </div>` : ""}</div>` : ""}
  ${has.load ? `<div class="box" id="b_load" style="${this._boxStyle(B.load)}">
    <div class="top"><div class="ttl"><ha-icon icon="mdi:sine-wave" style="color:#4caf50"></ha-icon><span>${vrmEsc(c.loads.name || L_("AC-Lasten"))}</span></div>
      <div class="big"><span id="load_p"></span> <span class="u">W</span></div></div>
    ${B.load[3] > 118 ? `<div class="lower" style="height:${B.load[3] - 118}px">
      ${ph3(c.loads.phases, (p, i) => `<div class="row"><span class="l">L${i + 1}</span><span class="c"><b id="lw${i}"></b> W</span></div>`)}
    </div>` : ""}</div>` : ""}
  <div class="inv" id="b_inv"><div class="blue"><ha-icon icon="mdi:current-ac"></ha-icon></div><div class="lbl" id="sys"></div></div>
  ${has.pvinv ? `<div class="box" id="b_pvinv" style="${this._boxStyle(B.pvinv)}">
    <div class="top"><div class="ttl"><ha-icon icon="mdi:white-balance-sunny" style="color:#f0a030"></ha-icon><span>${vrmEsc(c.pvInverters.length === 1 && c.pvInverters[0].title ? c.pvInverters[0].title : L_("PV-Wechselrichter"))}</span></div>
      <div class="badge"><ha-icon icon="mdi:flash"></ha-icon></div>
      <div class="big"><span id="pvinv_p"></span> <span class="u">W</span></div></div>
    <div class="lower" style="height:${B.pvinv[3] - 118}px">
      ${pvRows.map((r, i) => `<div class="row"><span class="l${r.wide ? " wide" : ""}">${vrmEsc(r.l)}</span><span class="c"><b id="pw${i}"></b> W</span></div>`).join("")}
    </div></div>` : ""}
  ${has.bat ? `<div class="box" id="b_bat" style="${this._boxStyle(B.bat)}">
    <div class="top"><div class="ttl"><ha-icon icon="mdi:battery-charging-outline" style="color:#3c87d6"></ha-icon><span id="bat_st"></span></div>
      <div class="topright"><span id="bat_p"></span> W</div>
      <div class="big"><span id="bat_soc"></span> <span class="u">%</span></div>
      ${bat.ess_state ? `<div class="ess">${vrmEsc(bat.ess_name || "ESS #1")} <ha-icon icon="mdi:chevron-up"></ha-icon></div>` : ""}</div>
    ${B.bat[3] > 118 ? `<div class="lower" style="height:${B.bat[3] - 118}px">
      ${this._batRows().map((r) => `<div class="row"><span class="k">${L_(r[0])}</span><b id="${r[1]}"></b>&nbsp;${r[2]}</div>`).join("")}
      ${bat.ess_state ? `<div class="row"><span class="k">${vrmEsc(bat.ess_name || "ESS #1")}</span><b id="ess"></b></div>` : ""}
    </div>` : ""}</div>` : ""}
  ${has.mppt ? `<div class="box" id="b_mppt" style="${this._boxStyle(B.mppt)}">
    <div class="top"><div class="ttl"><ha-icon icon="mdi:white-balance-sunny" style="color:#f0a030"></ha-icon><span>${L_("PV-Ladegerät")}</span></div>
      <div class="big"><span id="mppt_p"></span> <span class="u">W</span></div></div>
    <div class="lower" style="height:${B.mppt[3] - 118}px">
      ${c.chargers.map((m, i) => `<div class="mrow"><div class="n">${vrmEsc(m.name || `MPPT ${i + 1}`)}</div><div class="v"><span>${m.voltage ? `<b id="c${i}v"></b> V` : ""}</span><span>${m.current ? `<b id="c${i}a"></b> A` : ""}</span><span><b id="c${i}w"></b> W</span></div></div>`).join("")}
    </div></div>` : ""}
  ${has.devs ? this._devHtml(L) : ""}
  ${has.sol ? `<div class="box sol" id="b_sol" style="${this._boxStyle(L.solBox)}">
    <div class="top" style="height:118px"><div class="ttl"><ha-icon icon="mdi:white-balance-sunny" style="color:#f0a030"></ha-icon>${L_("Gesamt Solar")}</div>
      <div class="kwh" style="right:16px;top:15px;font-size:12px"><span id="sol_kwh">–</span> kWh</div>
      <div class="big"><span id="sol_p"></span> <span class="u">W</span></div></div>
    <svg class="spark" id="sol_sp" width="330" height="36" viewBox="0 0 330 36" preserveAspectRatio="none"></svg></div>` : ""}
  ${has.wx ? `<div class="box wx" id="b_wx" style="${this._boxStyle(L.wxBox)}">
    <div class="top" style="height:98px"><div class="ttl"><ha-icon icon="mdi:map-marker-outline" style="color:#3c87d6"></ha-icon>${L_("Wetter")}</div>
      <div class="cond" style="right:16px;top:15px;font-size:12px" id="wx_c"></div>
      <div class="big"><span id="wx_t"></span> <span class="u" id="wx_u">°C</span></div>
      <ha-icon class="wxi" id="wx_i" style="right:16px;top:44px;--mdc-icon-size:42px"></ha-icon></div>
    <div class="tog" id="wx_tog" style="height:33px"><ha-icon id="wx_ch" icon="mdi:chevron-down" style="--mdc-icon-size:22px"></ha-icon></div></div>
  <div class="wxfc" id="wx_fc" style="left:${L.wxBox[0]}px;top:${L.wxBox[1] + L.wxBox[3] - 1}px;width:${L.wxBox[2]}px;padding:0 16px;font-size:12px"></div>` : ""}
</div></div>`;
  }

  _mobHtml(L) {
    const c = this._c, has = L.has, B = L.boxes, bat = c.battery;
    const pvRows = this._pvRows();
    const ph3 = (arr, f) => arr.slice(0, 3).map(f).join("");
    const half = (b) => b && b[2] < 300;
    return `<style>${this._commonCss()}
  .stage { width:${L.W}px; height:${L.H}px; }
  .box .top { padding:9px 9px 0 9px; }
  .box .lower { padding:0 9px; }
  .ttl { font-size:12.5px; gap:5px; } .ttl ha-icon { --mdc-icon-size:16px; flex:none; }
  .big { font-size:21px; margin-top:6px; }
  .row { display:flex; align-items:center; height:28px; font-size:12px; border-bottom:1px solid var(--sep); color:var(--t2); }
  .row:last-child { border-bottom:none; }
  .row .l { color:var(--t2); width:45px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; } .row .l.wide { flex:1; width:auto; margin-right:4px; }
  .ph { height:40px; border-bottom:1px solid var(--sep); font-size:12px; color:var(--t2); display:flex; flex-direction:column; justify-content:center; gap:2px; }
  .ph:last-child { border-bottom:none; }
  .ph div { display:flex; } .ph div span:first-child { width:52px; }
  .mrow { padding:6px 0; border-bottom:1px solid var(--sep); font-size:12px; color:var(--t2); line-height:17px; height:65px; box-sizing:border-box; }
  .mrow:last-child { border-bottom:none; }
  .mrow .n { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .mrow .v { display:flex; } .mrow .v span:first-child { width:55px; }
  .kv { border-bottom:1px solid var(--sep); font-size:12px; color:var(--t2); padding:5px 0; line-height:16px; height:44px; box-sizing:border-box; }
  .kv:last-child { border-bottom:none; }
  .kv.one { display:flex; } .kv.one span:first-child { width:60px; }
  .meta-k { font-size:12.5px; } .meta-v { font-size:14px; margin-top:4px; } .meta-v ha-icon { --mdc-icon-size:17px; }
  .inv { left:160px; top:262px; width:94px; height:120px; }
  .inv .blue { height:88px; } .inv .blue:after { top:52px; } .inv .blue ha-icon { --mdc-icon-size:34px; margin-top:-22px; }
  .inv .lbl { height:30px; font-size:12.5px; }
  .badge { right:8px; top:50px; }
  .ess { font-size:14px; margin-top:6px; } .ess ha-icon { --mdc-icon-size:18px; margin-left:auto; }
  .sub { font-size:12.5px; color:var(--t2); margin-left:21px; margin-top:1px; }
  .dev { height:62px; padding:9px 12px; font-size:13px; }
  .dev .a ha-icon { --mdc-icon-size:17px; } .dev .b { margin-top:5px; padding-left:23px; gap:12px; }
  .wxfc .fr { height:34px; } .wxfc .fr ha-icon { --mdc-icon-size:20px; margin-right:18px; } .wxfc .fr .tt { width:100px; }
</style>
<div class="wrap"><div class="stage">
  <div class="abs" style="left:10px;top:8px"><div class="meta-k">${L_("Zuletzt aktualisiert:")}</div><div class="meta-v"><svg class="rt" id="rt" viewBox="0 0 24 14" width="22" height="13"><path d="M-12 7 q3 -8 6 0 t6 0 t6 0 t6 0 t6 0 t6 0 t6 0"/></svg><span id="upd">${L_("Echtzeit")}</span></div></div>
  <div class="abs" style="left:135px;top:8px"><div class="meta-k">${L_("Status:")}</div><div class="meta-v"><span id="stat">OK</span></div></div>
  <div class="abs" style="left:190px;top:8px"><div class="meta-k">${L_("Ortszeit:")}</div><div class="meta-v"><span id="clock"></span></div></div>
  <div class="abs" id="title" style="display:none"></div>
  ${this._svg(L)}
  ${has.grid ? `<div class="box" id="b_grid" style="${this._boxStyle(B.grid)}">
    <div class="top" style="height:62px"><div class="ttl"><ha-icon icon="mdi:transmission-tower" style="color:#e2554f"></ha-icon><span>${vrmEsc(c.grid.name || L_("Netz"))}</span></div>
      <div class="big"><span id="grid_p"></span> <span class="u">W</span></div></div>
    <div class="lower" style="height:${B.grid[3] - 62}px">
      ${ph3(c.grid.phases, (p, i) => `<div class="ph"><div><span>L${i + 1}</span><span>${p.voltage ? `<b id="gv${i}"></b> V` : ""}</span></div><div><span>${p.current ? `<b id="ga${i}"></b> A` : ""}</span><span>${p.power ? `<b id="gw${i}"></b> W` : ""}</span></div></div>`)}
    </div></div>` : ""}
  ${has.load ? `<div class="box" id="b_load" style="${this._boxStyle(B.load)}">
    <div class="top" style="height:62px"><div class="ttl"><ha-icon icon="mdi:sine-wave" style="color:#4caf50"></ha-icon><span>${vrmEsc(c.loads.name || L_("AC-Lasten"))}</span></div>
      <div class="big"><span id="load_p"></span> <span class="u">W</span></div></div>
    <div class="lower" style="height:${B.load[3] - 62}px">
      ${ph3(c.loads.phases, (p, i) => `<div class="row"><span class="l">L${i + 1}</span><b id="lw${i}"></b>&nbsp;W</div>`)}
    </div></div>` : ""}
  <div class="inv" id="b_inv"><div class="blue"><ha-icon icon="mdi:current-ac"></ha-icon></div><div class="lbl" id="sys"></div></div>
  ${has.pvinv ? `<div class="box" id="b_pvinv" style="${this._boxStyle(B.pvinv)}">
    <div class="top" style="height:76px"><div class="ttl" style="align-items:flex-start"><ha-icon icon="mdi:white-balance-sunny" style="color:#f0a030"></ha-icon><span>${L_("PV‑Wechsel&shy;richter")}</span></div>
      <div class="badge"><ha-icon icon="mdi:flash"></ha-icon></div>
      <div class="big" style="margin-top:4px"><span id="pvinv_p"></span> <span class="u">W</span></div></div>
    <div class="lower" style="height:${B.pvinv[3] - 76}px">
      ${pvRows.map((r, i) => `<div class="row"><span class="l${r.wide ? " wide" : ""}" title="${vrmEsc(r.l)}">${vrmEsc(r.l)}</span><b id="pw${i}"></b>&nbsp;W</div>`).join("")}
    </div></div>` : ""}
  ${has.bat ? `<div class="box" id="b_bat" style="${this._boxStyle(B.bat)}">
    <div class="top" style="height:110px"><div class="ttl"><ha-icon icon="mdi:battery-charging-outline" style="color:#3c87d6"></ha-icon><span id="bat_st"></span></div>
      <div class="sub"><span id="bat_p"></span> W</div>
      <div class="big"><span id="bat_soc"></span> <span class="u">%</span></div>
      ${bat.ess_state ? `<div class="ess">${vrmEsc(bat.ess_name || "ESS #1")} <ha-icon icon="mdi:chevron-up"></ha-icon></div>` : ""}</div>
    <div class="lower" style="height:${B.bat[3] - 110}px">
      ${this._batRows().map((r) => `<div class="kv"><div>${L_(r[0] === "Temperatur" ? "Temp." : r[0])}</div><div><b id="${r[1]}"></b> ${r[2]}</div></div>`).join("")}
      ${bat.ess_state ? `<div class="kv" style="height:62px"><div>${vrmEsc(bat.ess_name || "ESS #1")}</div><div><b id="ess"></b></div></div>` : ""}
    </div></div>` : ""}
  ${has.mppt ? `<div class="box" id="b_mppt" style="${this._boxStyle(B.mppt)}">
    <div class="top" style="height:78px"><div class="ttl" style="align-items:flex-start"><ha-icon icon="mdi:white-balance-sunny" style="color:#f0a030"></ha-icon><span>${L_("PV‑Lade&shy;gerät")}</span></div>
      <div class="big"><span id="mppt_p"></span> <span class="u">W</span></div></div>
    <div class="lower" style="height:${B.mppt[3] - 78}px">
      ${c.chargers.map((m, i) => `<div class="mrow"><div class="n">${vrmEsc(m.name || `MPPT ${i + 1}`)}</div><div class="v"><span>${m.voltage ? `<b id="c${i}v"></b> V` : ""}</span><span>${m.current ? `<b id="c${i}a"></b> A` : ""}</span></div><div><b id="c${i}w"></b> W</div></div>`).join("")}
    </div></div>` : ""}
  ${has.devs ? this._devHtml(L) : ""}
  ${has.sol ? `<div class="box sol" id="b_sol" style="${this._boxStyle(L.solBox)}">
    <div class="top" style="height:112px"><div class="ttl"><ha-icon icon="mdi:white-balance-sunny" style="color:#f0a030"></ha-icon>${L_("Gesamt Solar")}</div>
      <div class="kwh" style="left:9px;top:58px;font-size:12px"><span id="sol_kwh">–</span> ${L_("kWh heute")}</div>
      <div class="big"><span id="sol_p"></span> <span class="u">W</span></div></div>
    <svg class="spark" id="sol_sp" width="${L.solBox[2]}" height="30" viewBox="0 0 ${L.solBox[2]} 30" preserveAspectRatio="none"></svg></div>` : ""}
  ${has.wx ? `<div class="box wx" id="b_wx" style="${this._boxStyle(L.wxBox)}">
    <div class="top" style="height:84px"><div class="ttl"><ha-icon icon="mdi:map-marker-outline" style="color:#3c87d6"></ha-icon>${L_("Wetter")}</div>
      <div class="big"><span id="wx_t"></span> <span class="u" id="wx_u">°C</span></div>
      <div class="cond" style="left:9px;top:62px;font-size:12px" id="wx_c"></div>
      <ha-icon class="wxi" id="wx_i" style="right:${half(L.wxBox) ? 9 : 20}px;top:30px;--mdc-icon-size:34px"></ha-icon></div>
    <div class="tog" id="wx_tog" style="height:28px"><ha-icon id="wx_ch" icon="mdi:chevron-down" style="--mdc-icon-size:20px"></ha-icon></div></div>
  <div class="wxfc" id="wx_fc" style="left:10px;top:${L.fcTop}px;width:373px;padding:0 12px;font-size:13px;border-top:1px solid var(--bd)"></div>` : ""}
</div></div>`;
  }

  _devHtml(L) {
    return L.devs.map(({ d, x, y, w }) => `
  <div class="dev" id="${d.id}" style="left:${x}px;top:${y}px;width:${w}px">
    <div class="a"><ha-icon icon="${d.inv ? "mdi:current-ac" : "mdi:battery-charging-outline"}"></ha-icon><span>${vrmEsc(d.inv ? this._c.inverter.name : d.mon.name || L_("Batteriewächter"))}</span><span class="act" id="${d.p}act"></span><span class="p"><span id="${d.p}soc"></span> %</span></div>
    <div class="b"><span><span id="${d.p}v"></span> V</span><span><span id="${d.p}a"></span> A</span><span><span id="${d.p}w"></span> W</span><span class="s" id="${d.p}s"></span></div>
  </div>`).join("");
  }

  _build(mode) {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    const L = this._layout(mode);
    this._lay = L;
    root.innerHTML = mode === "mob" ? this._mobHtml(L) : this._deskHtml(L);
    const hs = L.has;
    if (!hs.grid && !hs.load && !hs.bat && !hs.pvinv && !hs.mppt) {   // nothing configured yet
      L.H = 120; L.W = mode === "mob" ? 393 : 1046;
      root.querySelector(".stage").innerHTML = `<div class="cfgerr">${L_("Noch keine Geräte eingestellt – siehe Anleitung (grid, ac_loads, battery, pv_inverters, solar_chargers …).")}</div>`;
    }
    this._mode = mode;
    this._root = root;
    this._wrap = root.querySelector(".wrap");
    this._stage = root.querySelector(".stage");
    const c = this._c, e = this._e;
    const click = (id, ent) => {
      const el = root.getElementById(id);
      if (el && ent) el.addEventListener("click", () => this._moreInfo(ent));
    };
    click("b_grid", c.grid.power || (c.grid.phases[0] || {}).power);
    click("b_load", c.loads.power || (c.loads.phases[0] || {}).power);
    click("b_pvinv", (c.pvInverters[0] || {}).power);
    click("b_bat", c.battery.soc);
    click("b_mppt", (c.chargers[0] || {}).power);
    click("b_inv", c.inverter.state);
    for (const { d } of L.devs) click(d.id, d.inv ? c.inverter.dc_power : d.mon.soc || d.mon.power);
    click("b_sol", e.sol_total || (c.pvInverters[0] || {}).power || (c.chargers[0] || {}).power);
    const wt = root.querySelector("#b_wx .top");
    if (wt) wt.addEventListener("click", () => this._moreInfo(c.weather));
    const tg = root.getElementById("wx_tog");
    if (tg) tg.addEventListener("click", () => { this._wxOpen = !this._wxOpen; this._wxRender(); });
    this._solDraw();
    this._wxRender();
    this._scale();
  }

  // Total solar: today's yield (energy counters) + power curve today (5-minute statistics)
  async _solLoad() {
    const h = this._hass, c = this._c, e = this._e;
    if (!h || this._solBusy || !this._has().sol) return;
    this._solBusy = true; this._solT = Date.now();
    try {
      const d0 = new Date(); d0.setHours(0, 0, 0, 0);
      const pIds = e.sol_total && h.states[e.sol_total] ? [e.sol_total] : c.pvInverters.map((p) => p.power).concat(c.chargers.map((m) => m.power)).filter(Boolean);
      const parts = e.e_solar_parts || [];
      const [st, dy] = await Promise.all([
        pIds.length ? vrmWS(h, { type: "recorder/statistics_during_period", start_time: d0.toISOString(), statistic_ids: pIds, period: "5minute", types: ["mean"], end_time: new Date(vrmNowQ()).toISOString() }) : Promise.resolve({}),
        parts.length ? vrmWS(h, { type: "recorder/statistics_during_period", start_time: d0.toISOString(), statistic_ids: parts, period: "day", types: ["change"], units: { energy: "kWh" } }) : Promise.resolve({}),
      ]);
      const vals = new Array(288).fill(null);
      for (const id of pIds) for (const x of st[id] || []) {
        const t = typeof x.start === "number" ? x.start : Date.parse(x.start);
        const i = Math.floor((t - d0.getTime()) / 300000);
        if (i >= 0 && i < 288 && x.mean != null) vals[i] = (vals[i] || 0) + Math.max(0, x.mean);
      }
      let kwh = NaN;
      if (parts.length && parts.every((id) => (dy[id] || []).length)) kwh = parts.reduce((a, id) => a + dy[id].reduce((b, x) => b + (x.change || 0), 0), 0);
      if (isNaN(kwh) && c.solarToday) kwh = vrmKwh(h, c.solarToday);
      if (isNaN(kwh)) kwh = vals.some((v) => v != null) ? vals.reduce((a, x) => a + (x || 0), 0) / 12000 : NaN;   // integrate 5-minute power
      this._sol = { vals, kwh };
    } catch (err) { /* no statistics */ }
    this._solBusy = false;
    this._solDraw();
  }

  _solDraw() {
    if (!this._root || !this._sol) return;
    this._t("sol_kwh", isNaN(this._sol.kwh) ? "–" : this._sol.kwh.toFixed(1));
    const sp = this._root.getElementById("sol_sp");
    if (sp) { const w = Number(sp.getAttribute("width")), hh = Number(sp.getAttribute("height")); sp.innerHTML = vrmSpark(this._sol.vals, w, hh); }
  }

  // Weather: current condition + expandable daily forecast (5 days)
  async _wxRender() {
    if (!this._root) return;
    const fc = this._root.getElementById("wx_fc"), ch = this._root.getElementById("wx_ch");
    if (ch) ch.setAttribute("icon", this._wxOpen ? "mdi:chevron-up" : "mdi:chevron-down");
    if (!fc) return;
    fc.classList.toggle("open", !!this._wxOpen);
    if (!this._wxOpen) { this._scale(); return; }
    const h = this._hass, wx = this._c.weather;
    const none = `<div class="fr"><span class="d">${L_("Keine Vorhersage verfügbar")}</span></div>`;
    try {
      const r = await vrmWS(h, { type: "call_service", domain: "weather", service: "get_forecasts", service_data: { type: "daily" }, target: { entity_id: wx }, return_response: true });
      const list = ((r && r.response && r.response[wx] && r.response[wx].forecast) || []).slice(0, 5);
      const day = (iso, k) => (k === 0 ? L_("Heute") : k === 1 ? L_("Morgen") : new Date(iso).toLocaleDateString(vrmLoc(), { weekday: "long" }));
      const r0 = (v) => (typeof v === "number" ? Math.round(v) : "–");
      fc.innerHTML = list.length ? list.map((f, k) => {
        const w = VRM_WX[f.condition] || [f.condition || "", "mdi:weather-cloudy"];
        const rain = typeof f.precipitation === "number" && f.precipitation > 0 ? ` · ${f.precipitation.toFixed(1)} mm` : "";
        return `<div class="fr" title="${vrmEsc(L_(w[0]))}${rain}"><span class="d">${day(f.datetime, k)}</span><ha-icon icon="${w[1]}"></ha-icon><span class="tt">${r0(f.temperature)}° <span>/ ${r0(f.templow)}°</span></span></div>`;
      }).join("") : none;
    } catch (err) { fc.innerHTML = none; }
    this._wxH = fc.offsetHeight || 170;
    this._scale();
  }

  _moreInfo(entityId) {
    const ev = new Event("hass-more-info", { bubbles: true, composed: true });
    ev.detail = { entityId };
    this.dispatchEvent(ev);
  }

  _t(id, txt) { const el = this._root.getElementById(id); if (el && el.textContent !== txt) el.textContent = txt; }

  _flow(id, value, forwardWhenPositive = true, threshold = 10) {
    const el = this._root.getElementById(id);
    if (!el) return;
    const on = !isNaN(value) && Math.abs(value) >= threshold;
    el.classList.toggle("off", !on);
    el.classList.toggle("rev", on && ((value > 0) !== forwardWhenPositive));
  }

  set hass(hass) {
    this._hass = hass;
    vrmSetLang(hass, this._config);
    const mode = vrmIsMobile(this) ? "mob" : "desk";
    const rebuilt = mode !== this._mode;
    if (rebuilt) this._build(mode);
    const dark = vrmDark(hass, this._config);
    // Only redraw when one of the displayed values changed (HA reports every state change)
    const ids = this._ids || (this._ids = vrmCollectIds(this._c));
    const tn = Date.now();
    if (!rebuilt && this._prev && dark === this._pd && tn - this._pt < 30000 && ids.every((id) => hass.states[id] === this._prev.states[id])) return;
    this._prev = hass; this._pd = dark; this._pt = tn;
    this._wrap.classList.toggle("dark", dark);
    const c = this._c, e = this._e, h = hass;
    const n = (id) => vrmNum(h, id);
    const inv = (v) => (c.invert_grid ? -v : v);

    this._t("title", c.title);
    this._t("clock", new Date().toLocaleTimeString(vrmLoc(), { hour: "2-digit", minute: "2-digit" }));

    // grid
    const gPh = c.grid.phases.map((p) => n(p.power));
    let gp = c.grid.power ? n(c.grid.power) : sum(gPh);
    gp = inv(gp);
    this._t("grid_p", fW(gp));
    c.grid.phases.forEach((p, i) => {
      this._t(`gv${i}`, fV(n(p.voltage), 0));
      this._t(`ga${i}`, fA(n(p.current)));
      this._t(`gw${i}`, fW(inv(n(p.power))));
    });
    // AC loads
    const lw = c.loads.phases.map((p) => n(p.power));
    const lp = c.loads.power ? n(c.loads.power) : sum(lw);
    this._t("load_p", fW(lp));
    lw.forEach((v, i) => this._t(`lw${i}`, fW(v)));
    // PV inverters (AC-coupled)
    const pvP = c.pvInverters.map((p) => (p.power ? n(p.power) : sum(p.phases.map((q) => n(q.power)))));
    const pp = sum(pvP);
    this._t("pvinv_p", fW(pp));
    this._pvRows().forEach((r, i) => this._t(`pw${i}`, fW(r.wide ? pvP[i] : n(r.w))));
    // battery
    const bat = c.battery;
    const bp = n(bat.power);
    this._t("bat_st", bat.state ? mapState(BAT_STATE, vrmStr(h, bat.state)) : (isNaN(bp) ? L_("Batterie") : bp > 5 ? L_("Laden") : bp < -5 ? L_("Entladen") : L_("Leerlauf")));
    this._t("bat_p", fW(bp));
    this._t("bat_soc", fP(n(bat.soc)));
    this._t("bat_v", fV(n(bat.voltage), 2));
    this._t("bat_a", fA(n(bat.current)));
    const bt = n(bat.temperature);
    this._t("bat_t", isNaN(bt) ? "–" : `${Math.round(bt)}`);
    this._t("ess", mapState(ESS_STATE, vrmStr(h, bat.ess_state)));
    this._t("sys", c.inverter.state ? mapState(SYS_STATE, vrmStr(h, c.inverter.state)) : (c.inverter.label || ""));
    // solar chargers (DC-coupled)
    const mP = c.chargers.map((m) => n(m.power));
    const mp = sum(mP);
    this._t("mppt_p", fW(mp));
    c.chargers.forEach((m, i) => {
      this._t(`c${i}v`, fV(n(m.voltage), 2));
      this._t(`c${i}a`, fA(n(m.current)));
      this._t(`c${i}w`, fW(mP[i]));
    });

    // Battery monitors: active monitor = voltage + current (+ SoC) closest to the system battery values
    const gV = n(bat.voltage), gA = n(bat.current), gS = n(bat.soc);
    const devs = this._devList().filter((d) => !d.inv).map((d) => ({ d, soc: n(d.mon.soc), v: n(d.mon.voltage), a: n(d.mon.current), w: n(d.mon.power), ttg: n(d.mon.time_to_go) }));
    const score = (x) => (isNaN(x.v) || isNaN(gV) ? 99 : Math.abs(x.v - gV) * 10 + Math.abs((x.a || 0) - (gA || 0)) + (isNaN(x.soc) || isNaN(gS) ? 0 : Math.abs(x.soc - gS)));
    const best = devs.length ? devs.reduce((a, x) => (score(x) < score(a) ? x : a), devs[0]) : null;
    for (const x of devs) {
      const p = x.d.p;
      this._t(`${p}soc`, fP(x.soc));
      this._t(`${p}v`, fV(x.v, 2));
      this._t(`${p}a`, fA(x.a));
      this._t(`${p}w`, fW(x.w));
      let st = L_("Idle");
      if (!isNaN(x.w) && x.w < -5) st = `${L_("Discharging")}${isNaN(x.ttg) ? "" : ` (${vrmTtg(h, x.d.mon.time_to_go)})`}`;
      else if (!isNaN(x.w) && x.w > 5) st = L_("Charging");
      this._t(`${p}s`, st);
      const isAct = devs.length > 1 && x === best && score(x) < 1.5;
      this._t(`${p}act`, isAct ? `● ${L_("aktiv")}` : "");
      const box = this._root.getElementById(x.d.id);
      if (box) box.classList.toggle("active", isAct);
    }
    if (c.inverter.name) {
      this._t("mu_soc", fP(n(bat.soc)));
      this._t("mu_v", fV(n(c.inverter.dc_voltage), 2));
      this._t("mu_a", fA(n(c.inverter.dc_current)));
      this._t("mu_w", fW(n(c.inverter.dc_power)));
      const bs = vrmStr(h, bat.state);
      this._t("mu_s", bs ? mapState(BAT_STATE_EN, bs) : "");
    }

    // total solar + weather
    const stot = e.sol_total ? n(e.sol_total) : NaN;
    this._t("sol_p", fW(isNaN(stot) ? sum([pp, mp]) : stot));
    if (!this._solT || Date.now() - this._solT > 280000) this._solLoad();
    const wx = c.weather ? h.states[c.weather] : null;
    if (wx) {
      const w = VRM_WX[wx.state] || [wx.state === "unavailable" ? "–" : wx.state, "mdi:weather-cloudy"];
      const tt = wx.attributes.temperature;
      this._t("wx_t", typeof tt === "number" ? (Math.abs(tt) < 10 ? tt.toFixed(1) : `${Math.round(tt)}`) : "–");
      if (wx.attributes.temperature_unit) this._t("wx_u", wx.attributes.temperature_unit);
      this._t("wx_c", L_(w[0]));
      const wi = this._root.getElementById("wx_i");
      if (wi && wi.getAttribute("icon") !== w[1]) wi.setAttribute("icon", w[1]);
    }

    const stEnt = c.inverter.state || c.battery.soc;
    const gx = stEnt ? h.states[stEnt] : null;
    const ok = !stEnt || (gx && gx.state !== "unavailable");
    this._t("stat", ok ? "OK" : L_("Offline"));
    this._t("upd", ok ? L_("Echtzeit") : "–");
    const rt = this._root.getElementById("rt");
    if (rt) rt.classList.toggle("off", !ok);

    this._flow("f_grid", gp, true);
    this._flow("f_pvinv", pp, true);
    this._flow("f_bus", sum([gp, pp]), true);
    this._flow("f_load", lp, true);
    const mw = n(c.inverter.dc_power);
    this._flow("f_inv", isNaN(mw) ? bp : mw, true);   // inverter: + = AC→DC (charging), − = DC→AC
    this._flow("f_bat", bp, true);
    this._flow("f_mppt", mp, true);
  }
}

// ---------------------------------------------------------------- Tagesdiagramm
const CH_DESK = { W: 1380, H: 720, svgW: 1366, svgH: 440, L: 80, R: 1300, T: 78, B: 393, fs: 11, every: 1, rot: false };
const CH_MOB = { W: 393, H: 808, svgW: 373, svgH: 330, L: 34, R: 340, T: 50, B: 262, fs: 10.5, every: 2, rot: true };

class VrmChartCard extends HTMLElement {
  setConfig(config) {
    this._config = config || {};
    this._c = vrmNormalize(this._config);
    this._e = this._c.e;
    this._data = null;
    this._loading = false;
    this._last = 0;
    this._mode = null;
  }
  static getStubConfig() { return vrmStubConfig(); }
  static getConfigElement() { return document.createElement("vrm-card-editor"); }
  getCardSize() { return 10; }
  getGridOptions() { return { columns: "full", rows: "auto" }; }

  connectedCallback() {
    if (!this._ro) this._ro = new ResizeObserver(() => this._onResize());
    this._ro.observe(this);
    if (!this._timer) this._timer = setInterval(() => { if (this._range().end.getTime() > Date.now() - 3600000) this._load(true); }, 5 * 60 * 1000);
  }
  disconnectedCallback() {
    if (this._ro) this._ro.disconnect();
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }
  _geo() { return this._mode === "mob" ? CH_MOB : CH_DESK; }
  _onResize() {
    if (!this._hass) return;
    const mode = vrmIsMobile(this) ? "mob" : "desk";
    if (mode !== this._mode) { this._buildShell(mode); this._renderChart(); this._renderTiles(); }
    else this._scale();
  }
  _scale() {
    if (!this._stage) return;
    const G = this._geo();
    const w = this.clientWidth || G.W;
    const s = this._mode === "mob" ? w / G.W : Math.min(1, w / G.W);
    this._stage.style.transform = `scale(${s})`;
    this._stage.style.left = `${Math.max(0, (w - G.W * s) / 2)}px`;
    this._wrap.style.height = `${Math.ceil(G.H * s)}px`;
  }

  set hass(hass) {
    this._hass = hass;
    vrmSetLang(hass, this._config);
    const mode = vrmIsMobile(this) ? "mob" : "desk";
    if (!this._stage || mode !== this._mode) { this._buildShell(mode); if (this._data) this._renderChart(); }
    this._wrap.classList.toggle("dark", vrmDark(hass, this._config));
    const tn = Date.now(), live = this._range().end.getTime() > tn - 3600000;
    if (!this._data || (live && tn - this._last > 5 * 60 * 1000)) this._load(false);
    if (tn - (this._tt || 0) > 15000) { this._tt = tn; this._renderTiles(); }
  }

  _legendHtml(items) {
    return items.map(([lbl, bg]) => `<span><em style="background:${bg}"></em>${lbl}</span>`).join("");
  }

  _buildShell(mode) {
    this._mode = mode;
    const G = this._geo();
    const mob = mode === "mob";
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    const hatch = (c) => `repeating-linear-gradient(135deg,${c} 0 2px,var(--hatch) 2px 4px);border:1px solid ${c};box-sizing:border-box`;
    const legend = this._legendHtml([
      [L_("Verbrauch"), "#f2716b"], [L_("Solar"), "#f4a83a"], [L_("Batterie"), "#3c87d6"],
      [L_("Solarprognose"), hatch("#f4a83a")], [L_("Verbrauchsprognose"), hatch("#f2716b")],
      [L_("Grundlastprognose"), "repeating-linear-gradient(135deg,#f2716b 0 2px,#fbd5d2 2px 4px);border:1px solid #f2716b;box-sizing:border-box"],
    ]);
    const tile = (style, inner) => `<div class="tile" style="${style}">${inner}</div>`;
    const tOut = `<div class="h"><ha-icon icon="mdi:transmission-tower-export" style="color:#4caf50"></ha-icon>${L_("Zum Netz")}</div><div class="v"><span id="t_out">–</span> <span class="u">kWh</span></div>`;
    const tIn = `<div class="h"><ha-icon icon="mdi:transmission-tower-import" style="color:#e2554f"></ha-icon>${L_("Aus dem Netz")}</div><div class="v"><span id="t_in">–</span> <span class="u">kWh</span></div>`;
    const tCons = `<div class="h"><ha-icon icon="mdi:power-socket-de" style="color:#e2554f"></ha-icon>${L_("Gesamtverbrauch")}</div>
      <div class="bl"><span>${L_("Gesamt")}</span><b><span id="t_cons">–</span> kWh</b></div><div class="bar"><i id="t_cons_bar" style="background:#f2716b;width:0"></i></div>
      <div class="bl"><span>${L_("Gesamtprognose")}</span><b><span id="t_consfc">–</span> kWh</b></div><div class="bar"><i style="background:#f2716b;width:100%"></i></div>`;
    const tSol = `<div class="h"><ha-icon icon="mdi:white-balance-sunny" style="color:#f0a030"></ha-icon>Solar</div>
      <div class="bl"><span>${L_("Gesamt")}</span><b><span id="t_sol">–</span> kWh</b></div><div class="bar"><i id="t_sol_bar" style="background:#f4a83a;width:0"></i></div>
      <div class="bl"><span>${L_("Gesamtprognose")}</span><b><span id="t_solfc">–</span> kWh</b></div><div class="bar"><i style="background:#f4a83a;width:100%"></i></div>`;
    const tiles = mob
      ? tile("left:10px;top:498px;width:181px;height:140px", tOut) + tile("left:202px;top:498px;width:181px;height:140px", tIn)
        + tile("left:10px;top:648px;width:181px;height:156px", tCons) + tile("left:202px;top:648px;width:181px;height:156px", tSol)
      : tile("left:6px;top:563px;width:337px;height:153px", tOut) + tile("left:353px;top:563px;width:340px;height:153px", tIn)
        + tile("left:701px;top:563px;width:322px;height:153px", tCons) + tile("left:1033px;top:563px;width:341px;height:153px", tSol);
    root.innerHTML = `
<style>
  :host { display:block; }
  ${VRM_THEME_CSS}
  .stage { width:${G.W}px; height:${G.H}px; }
  .chartbox { position:absolute; left:${mob ? 10 : 6}px; top:${mob ? 56 : 8}px; width:${mob ? 373 : 1368}px; height:${mob ? 432 : 545}px; border:1px solid var(--bd); box-sizing:border-box; }
  ${this._navCss(mob)}
  .tile { position:absolute; border:1px solid var(--bd); box-sizing:border-box; padding:${mob ? "14px 14px" : "16px 18px"}; }
  .tile .h { display:flex; align-items:center; gap:6px; font-size:${mob ? 14 : 12.5}px; color:var(--t2); }
  .tile .h ha-icon { --mdc-icon-size:${mob ? 19 : 17}px; }
  .tile .v { font-size:${mob ? 30 : 34}px; margin-top:${mob ? 18 : 12}px; color:var(--t1); } .tile .v .u { color:var(--t3); }
  .bl { display:flex; flex-wrap:wrap; justify-content:space-between; gap:0 6px; font-size:${mob ? 12.5 : 11.5}px; margin-top:${mob ? 12 : 12}px; color:var(--t2); }
  .bl b { margin-left:auto; }
  .bl b { font-weight:600; color:var(--t1); }
  .bar { height:5px; background:var(--grid); margin-top:6px; position:relative; }
  .bar i { position:absolute; left:0; top:0; bottom:0; }
  .legend { position:absolute; left:${mob ? 14 : 30}px; top:${mob ? 340 : 458}px; ${mob ? "width:345px;" : ""} display:flex; flex-wrap:wrap; gap:${mob ? "8px 14px" : "14px"}; font-size:${mob ? 12 : 10.5}px; color:var(--t2); }
  .legend span { display:flex; align-items:center; gap:5px; }
  .legend em { display:inline-block; width:15px; height:10px; }
  .msg { position:absolute; left:0; right:0; top:${mob ? 140 : 200}px; text-align:center; color:var(--t3); font-size:13px; }
</style>
<div class="wrap"><div class="stage">
  ${this._navHtml()}
  <div class="chartbox"><svg id="svg" width="${G.svgW}" height="${G.svgH}"></svg>
    <div class="legend">${legend}</div>
    <div class="msg" id="msg">${L_("Lade Daten …")}</div>
  </div>
  ${tiles}
</div></div>`;
    this._root = root;
    this._wrap = root.querySelector(".wrap");
    this._stage = root.querySelector(".stage");
    if (this._hass) this._wrap.classList.toggle("dark", vrmDark(this._hass, this._config));
    this._bindNav();
    this._scale();
  }

  // ---- Zeitraum-Auswahl (wie VRM) ---------------------------------------------
  _navHtml() {
    return `<div class="nav"><button class="nb" id="nav_prev" title="${L_("Zurück")}">‹</button><button class="nl" id="nav_lbl">${L_("Heute")}</button><button class="nb" id="nav_next" title="${L_("Weiter")}">›</button></div>
  <div class="pick" id="pick" hidden></div>`;
  }
  _navCss(mob) {
    return `.nav { position:absolute; ${mob ? "left:10px; top:8px; width:373px; height:40px;" : "right:24px; top:12px; height:30px;"} display:flex; align-items:center; gap:8px; z-index:3; }
  .nav .nl { flex:${mob ? 1 : "none"}; min-width:${mob ? 0 : 170}px; height:100%; border:1px solid var(--bd); border-radius:4px; background:var(--bg); color:var(--t2); font-size:${mob ? 15 : 13}px; cursor:pointer; font-family:inherit; padding:0 10px; }
  .nav .nl:hover, .nav .nb:hover { border-color:#3c87d6; }
  .nav .nb { width:${mob ? 52 : 36}px; height:100%; border:1px solid var(--bd); border-radius:4px; background:var(--bg); color:var(--t2); font-size:${mob ? 22 : 18}px; cursor:pointer; padding:0; line-height:1; }
  .nav .nb:disabled { opacity:.35; cursor:default; }
  .pick { position:absolute; z-index:4; ${mob ? "left:6px; top:52px; width:381px; max-height:680px; overflow:auto;" : "right:20px; top:48px; width:900px;"} background:var(--bg); border:1px solid var(--bd); border-radius:6px; box-shadow:0 6px 24px rgba(0,0,0,.25); padding:${mob ? "14px" : "22px 26px"}; box-sizing:border-box; color:var(--t2); font-size:${mob ? 13.5 : 13}px; }
  .pick[hidden] { display:none; }
  .pick .cols { display:flex; gap:${mob ? 12 : 26}px; ${mob ? "flex-direction:column;" : ""} }
  .pick h3 { margin:0 0 12px 0; font-size:${mob ? 16 : 17}px; font-weight:600; color:var(--t1); }
  .pick h4 { margin:16px 0 8px 0; font-size:13px; font-weight:600; color:var(--t1); }
  .pick .grid { display:grid; grid-template-columns:repeat(${mob ? 2 : 4}, auto); gap:4px ${mob ? 8 : 18}px; }
  .pick .fut { display:flex; flex-wrap:wrap; gap:4px ${mob ? 8 : 18}px; }
  .pick .q { background:none; border:1px solid transparent; border-radius:4px; color:var(--t2); text-align:left; padding:6px 10px; cursor:pointer; font:inherit; }
  .pick .q:hover { border-color:var(--bd); }
  .pick .q.sel { border-color:#3c87d6; color:#3c87d6; }
  .pick .cust { ${mob ? "" : "border-left:1px solid var(--bd); padding-left:26px; min-width:250px;"} }
  .pick label { display:block; margin:10px 0 4px; color:var(--t3); }
  .pick .row2 { display:flex; gap:8px; }
  .pick input { background:var(--bg); color:var(--t1); border:1px solid var(--bd); border-radius:4px; padding:8px; font:inherit; color-scheme:light dark; }
  .pick input[type=date] { flex:1; } .pick input[type=time] { width:${mob ? 90 : 90}px; }
  .pick .ok { margin-top:14px; background:#3c87d6; color:#fff; border:none; border-radius:4px; padding:8px 18px; cursor:pointer; font:inherit; }
  .pick .x { position:absolute; right:12px; top:12px; width:34px; height:34px; border:1px solid var(--bd); border-radius:4px; background:var(--bg); color:var(--t2); font-size:18px; cursor:pointer; }`;
  }

  // Schnellauswahl-Definitionen
  _presets() {
    return {
      past: [["last2d", "Letzten 2 Tage"], ["last7d", "Letzten 7 Tage"], ["last30d", "Letzten 30 Tage"], ["last12w", "Letzte 12 Wochen"], ["last6m", "Letzten 6 Monate"], ["last12m", "Letzte 12 Monate"]],
      days: [["yesterday", "Gestern"], ["daybefore", "Tag davor"], ["weekago", "Heute vor einer Woche"], ["prevmonth", "Voriger Monat"], ["prevweek", "Vorige Woche"]],
      cur: [["today", "Heute"], ["thisweek", "Diese Woche"], ["thismonth", "Dieser Monat"], ["thisyear", "Dieses Jahr"], ["lastyear", "Letztes Jahr"]],
      hrs: [["last1h", "Letzte Stunde"], ["last3h", "Letzten 3 Stunden"], ["last6h", "Letzten 6 Stunden"], ["last12h", "Letzten 12 Stunden"], ["last24h", "Letzten 24 Stunden"], ["last48h", "Letzten 48 Stunden"]],
      fut: [["tomorrow", "Morgen"], ["dayafter", "Übermorgen"], ["next2d", "Nächsten 2 Tage"], ["next7d", "Nächsten 7 Tage"], ["recent", "Kürzlich und bevorstehend"]],
    };
  }
  _singleDayKeys() { return ["today", "yesterday", "daybefore", "weekago", "tomorrow", "dayafter"]; }

  _rangeFor(key) {
    const now = new Date(), D = 86400000, H = 3600000;
    const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const day = (o) => { const d = new Date(t0); d.setDate(d.getDate() + o); return d; };
    const mon = new Date(t0); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
    const monthStart = (o) => new Date(now.getFullYear(), now.getMonth() + o, 1);
    const hrs = (n) => ({ start: new Date(Math.floor((now.getTime() - n * H) / H) * H), end: new Date(Math.ceil(now.getTime() / H) * H + (now.getTime() % H === 0 ? H : 0)) });
    const R = {
      today: { start: day(0), end: day(1) }, yesterday: { start: day(-1), end: day(0) }, daybefore: { start: day(-2), end: day(-1) },
      weekago: { start: day(-7), end: day(-6) }, tomorrow: { start: day(1), end: day(2) }, dayafter: { start: day(2), end: day(3) },
      last2d: { start: day(-1), end: day(1) }, last7d: { start: day(-6), end: day(1) }, last30d: { start: day(-29), end: day(1) },
      last12w: { start: new Date(mon.getTime() - 11 * 7 * D), end: new Date(mon.getTime() + 7 * D), interval: "week" },
      last6m: { start: monthStart(-5), end: monthStart(1), interval: "month" }, last12m: { start: monthStart(-11), end: monthStart(1), interval: "month" },
      prevmonth: { start: monthStart(-1), end: monthStart(0) }, prevweek: { start: new Date(mon.getTime() - 7 * D), end: mon },
      thisweek: { start: mon, end: new Date(mon.getTime() + 7 * D) }, thismonth: { start: monthStart(0), end: monthStart(1) },
      thisyear: { start: new Date(now.getFullYear(), 0, 1), end: new Date(now.getFullYear() + 1, 0, 1), interval: "month" },
      lastyear: { start: new Date(now.getFullYear() - 1, 0, 1), end: new Date(now.getFullYear(), 0, 1), interval: "month" },
      last1h: hrs(1), last3h: hrs(3), last6h: hrs(6), last12h: hrs(12), last24h: hrs(24), last48h: hrs(48),
      next2d: { start: day(1), end: day(3) }, next7d: { start: day(1), end: day(8) }, recent: { start: day(-1), end: day(2) },
    };
    const r = R[key] || R.today;
    return this._normRange(r.start, r.end, r.interval, key);
  }
  _normRange(start, end, interval, key) {
    const span = end - start, H = 3600000;
    if (!interval) interval = span <= 72 * H ? "hour" : span <= 62 * 24 * H ? "day" : span <= 26 * 7 * 24 * H ? "week" : "month";
    return { start, end, interval, key: key || null };
  }
  _range() { if (!this._rng) this._rng = this._rangeFor("today"); return this._rng; }
  _isSingleDay(r) {
    const s = r.start;
    return r.interval === "hour" && s.getHours() === 0 && s.getMinutes() === 0 && Math.round((r.end - s) / 3600000) >= 23 && Math.round((r.end - s) / 3600000) <= 25;
  }
  _dayOffset(d) {
    const t0 = new Date(); t0.setHours(0, 0, 0, 0);
    return Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - t0) / 86400000);
  }
  _rangeLabel(r) {
    const all = this._presets();
    const names = Object.fromEntries([].concat(all.past, all.days, all.cur, all.hrs, all.fut));
    if (this._isSingleDay(r)) {
      const o = this._dayOffset(r.start);
      const dn = { "-2": "Vorgestern", "-1": "Gestern", "0": "Heute", "1": "Morgen", "2": "Übermorgen" };
      if (dn[String(o)]) return L_(dn[String(o)]);
      return r.start.toLocaleDateString(vrmLoc(), { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
    }
    if (r.key && names[r.key]) return L_(names[r.key]);
    const f = (d) => d.toLocaleDateString(vrmLoc(), { day: "2-digit", month: "2-digit", year: "2-digit" });
    const last = new Date(r.end.getTime() - 1);
    if (r.interval === "hour") return `${f(r.start)} ${r.start.toLocaleTimeString(vrmLoc(), { hour: "2-digit", minute: "2-digit" })} – ${f(last)} ${r.end.toLocaleTimeString(vrmLoc(), { hour: "2-digit", minute: "2-digit" })}`;
    return `${f(r.start)} – ${f(last)}`;
  }

  _bindNav() {
    const $ = (id) => this._root.getElementById(id);
    const p = $("nav_prev"), n = $("nav_next"), l = $("nav_lbl");
    if (p) p.addEventListener("click", () => this._shift(-1));
    if (n) n.addEventListener("click", () => this._shift(1));
    if (l) l.addEventListener("click", () => this._togglePick());
    this._navUpdate();
  }
  _navUpdate() {
    const lbl = this._root && this._root.getElementById("nav_lbl");
    if (!lbl) return;
    const r = this._range();
    lbl.textContent = this._rangeLabel(r);
    const t0 = new Date(); t0.setHours(0, 0, 0, 0);
    this._root.getElementById("nav_next").disabled = r.end.getTime() >= t0.getTime() + 10 * 86400000 || (this._singleOnly && this._dayOffset(r.start) >= 9);
  }
  _shift(dir) {
    const r = this._range();
    let s, e;
    if (r.interval === "month" || (r.interval === "day" && r.start.getDate() === 1 && r.end.getDate() === 1 && r.key && /month/.test(r.key))) {
      const m = (r.end.getFullYear() - r.start.getFullYear()) * 12 + r.end.getMonth() - r.start.getMonth();
      s = new Date(r.start.getFullYear(), r.start.getMonth() + dir * m, 1);
      e = new Date(r.end.getFullYear(), r.end.getMonth() + dir * m, 1);
    } else {
      const span = r.end - r.start;
      s = new Date(r.start.getTime() + dir * span); e = new Date(r.end.getTime() + dir * span);
      if (span % 86400000 === 0 || this._isSingleDay(r)) {   // Sommer-/Winterzeit: auf Mitternacht ausrichten
        const days = Math.round(span / 86400000);
        s = new Date(r.start); s.setDate(s.getDate() + dir * days);
        e = new Date(r.end); e.setDate(e.getDate() + dir * days);
      }
    }
    this._setRange(this._normRange(s, e, r.interval, null));
  }
  _setRange(r) {
    this._rng = r;
    this._data = null;
    const pk = this._root.getElementById("pick");
    if (pk) pk.hidden = true;
    this._navUpdate();
    const msg = this._root.getElementById("msg"), svg = this._root.getElementById("svg");
    if (msg) { msg.style.display = ""; msg.textContent = L_("Lade Daten …"); }
    if (svg) svg.innerHTML = "";
    this._load(true);
  }
  _togglePick() {
    const pk = this._root.getElementById("pick");
    if (!pk) return;
    if (!pk.hidden) { pk.hidden = true; return; }
    const P = this._presets(), only = this._singleOnly ? this._singleDayKeys() : null;
    const r = this._range();
    const btn = ([k, l]) => (only && !only.includes(k) ? "" : `<button class="q${r.key === k ? " sel" : ""}" data-k="${k}">${L_(l)}</button>`);
    const col = (arr) => arr.map(btn).join("");
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const hm = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const last = new Date(r.end.getTime() - 60000);
    const grid = only
      ? `<div class="grid">${col(P.days)}${col(P.cur)}${col(P.fut)}</div>`
      : this._mode === "mob"
        ? `<div class="grid">${col(P.days)}${col(P.cur)}</div><h4>${L_("Zeiträume")}</h4><div class="grid">${col(P.past)}${col(P.hrs)}</div>
         <h4>${L_("Zukunft")}</h4><div class="fut">${col(P.fut)}</div>`
        : `<div class="grid">${[0, 1, 2, 3, 4, 5].map((i) => [P.past[i], P.days[i], P.cur[i], P.hrs[i]].map((x) => (x ? btn(x) : "<span></span>")).join("")).join("")}</div>
         <h4>${L_("Zukunft")}</h4><div class="fut">${col(P.fut)}</div>`;
    pk.innerHTML = `<button class="x" id="pk_x">✕</button>
      <div class="cols"><div><h3>${L_("Schnellauswahl")}</h3>${grid}</div>
      <div class="cust"><h3>${L_(only ? "Tag wählen" : "Benutzerdefiniert")}</h3>
        <label>${L_(only ? "Datum" : "Von")}</label><div class="row2"><input type="date" id="pk_d1" value="${iso(r.start)}">${only ? "" : `<input type="time" id="pk_t1" value="${hm(r.start)}">`}</div>
        ${only ? "" : `<label>${L_("Bis")}</label><div class="row2"><input type="date" id="pk_d2" value="${iso(last)}"><input type="time" id="pk_t2" value="${hm(last)}"></div>`}
        <button class="ok" id="pk_ok">${L_("Übernehmen")}</button></div></div>`;
    pk.hidden = false;
    pk.querySelectorAll(".q").forEach((b) => b.addEventListener("click", () => this._setRange(this._rangeFor(b.dataset.k))));
    pk.querySelector("#pk_x").addEventListener("click", () => { pk.hidden = true; });
    pk.querySelector("#pk_ok").addEventListener("click", () => {
      const d1 = pk.querySelector("#pk_d1").value;
      if (!d1) return;
      if (only) {
        const s = new Date(`${d1}T00:00`); const e = new Date(s); e.setDate(e.getDate() + 1);
        this._setRange(this._normRange(s, e, "hour", null));
        return;
      }
      const s = new Date(`${d1}T${pk.querySelector("#pk_t1").value || "00:00"}`);
      const d2 = pk.querySelector("#pk_d2").value || d1;
      const t2 = pk.querySelector("#pk_t2").value || "23:59";
      let e = new Date(`${d2}T${t2}`);
      e = new Date(e.getTime() + 60000);                       // „bis 23:59“ = bis Tagesende
      if (!(e > s)) return;
      const H = 3600000;
      const sF = new Date(Math.floor(s.getTime() / H) * H), eC = new Date(Math.ceil(e.getTime() / H) * H);
      this._setRange(this._normRange(sF, eC, null, null));
    });
  }

  // ---- Daten laden ------------------------------------------------------------
  async _load(force) {
    if (!this._hass) return;
    if (this._loading) { this._pending = true; return; }
    if (!force && this._data && Date.now() - this._last < 5 * 60 * 1000) return;
    if (!force && !this._data && Date.now() - (this._errAt || 0) < 60 * 1000) return;   // after an error: retry at most once a minute
    this._loading = true;
    const r = this._range();
    try {
      let data;
      if (this._isSingleDay(r)) {
        const d = await this._dayData(this._dayOffset(r.start));
        data = Object.assign(d, { interval: "hour", single: true, start: r.start, end: r.end });
      } else if (r.interval === "hour") {
        const H = 3600000, first = this._dayOffset(r.start), lastO = this._dayOffset(new Date(r.end.getTime() - 1));
        let hours = [];
        for (let o = first; o <= lastO && o - first < 5; o++) hours = hours.concat((await this._dayData(o)).hours);
        hours = hours.filter((s) => s.t >= r.start.getTime() && s.t < r.end.getTime());
        data = { day0: r.start, hours, interval: "hour", single: false, start: r.start, end: r.end };
        void H;
      } else {
        data = await this._aggData(r);
      }
      if (r !== this._range()) return;                       // inzwischen anderer Zeitraum
      this._data = data;
      this._last = Date.now();
      this._errAt = 0;
      this._renderChart();
      this._renderTiles();
    } catch (err) {
      this._errAt = Date.now();
      const m = this._root && this._root.getElementById("msg");
      if (m) { m.style.display = ""; m.textContent = `${L_("Fehler beim Laden")}: ${err && err.message ? err.message : err}`; }
    } finally {
      this._loading = false;
      if (this._pending) { this._pending = false; this._load(true); }
    }
  }

  // Tage/Wochen/Monate: Ist-Werte aus der Langzeitstatistik, Prognose für heute/morgen aus VRM
  async _aggData(r) {
    const e = this._e, h = this._hass, H = 3600000;
    const now = new Date();
    const per = r.interval;
    const slots = [];
    for (let d = new Date(r.start); d < r.end && slots.length < 400;) {
      const n = new Date(d);
      if (per === "day") n.setDate(n.getDate() + 1);
      else if (per === "week") n.setDate(n.getDate() + 7);
      else n.setMonth(n.getMonth() + 1);
      slots.push({ t: d.getTime(), tEnd: n.getTime() });
      d = n;
    }
    const qEnd = new Date(Math.min(r.end.getTime(), vrmNowQ() + H));
    const pairs = this._pairs(), ids = pairs.map((p) => p[0]);
    const stats = qEnd > r.start ? await vrmWS(h, { type: "recorder/statistics_during_period", start_time: r.start.toISOString(), end_time: qEnd.toISOString(), statistic_ids: ids, period: per, types: ["change"], units: { energy: "kWh" } }) : {};
    const means = qEnd > r.start ? await vrmWS(h, { type: "recorder/statistics_during_period", start_time: r.start.toISOString(), end_time: qEnd.toISOString(), statistic_ids: [e.bat_soc], period: per, types: ["mean"] }) : {};
    const find = (t) => slots.findIndex((s) => t >= s.t - 2 * H && t < s.tEnd - 2 * H);   // Toleranz für Sommerzeit
    const add = (id, key) => {
      for (const x of stats[id] || []) {
        const t = typeof x.start === "number" ? x.start : Date.parse(x.start);
        const i = find(t);
        if (i < 0) continue;
        const c = x.change || 0, lim = 30 * (slots[i].tEnd - slots[i].t) / H;
        slots[i][key] = (slots[i][key] || 0) + (Math.abs(c) > lim ? 0 : c);
      }
    };
    for (const [id, key] of pairs) add(id, key);
    // AC-Lasten: feinere Unterperiode aufsummieren (Mittel × Stunden)
    const hourNow = Math.floor(now.getTime() / H) * H;
    if (e.load_power.length && qEnd > r.start) {
      const sub = per === "day" ? "hour" : "day";
      const lm = await vrmMeanSum(h, e.load_power, { start_time: r.start.toISOString(), end_time: qEnd.toISOString(), period: sub });
      for (const x of lm) {
        const t = typeof x.start === "number" ? x.start : Date.parse(x.start);
        const te = typeof x.end === "number" ? x.end : (x.end ? Date.parse(x.end) : t + (sub === "hour" ? H : 24 * H));
        const i = slots.findIndex((s) => t >= s.t && t < s.tEnd);
        if (i < 0 || x.mean == null) continue;
        const hrs = Math.max(0, (Math.min(te, hourNow) - t) / H);
        slots[i].loadE = (slots[i].loadE || 0) + x.mean / 1000 * hrs;
        slots[i].loadH = (slots[i].loadH || 0) + hrs;
      }
    }
    const cs = slots.find((s) => now.getTime() >= s.t && now.getTime() < s.tEnd);
    if (cs) {
      const ch = await this._curHour();
      for (const [k, v] of Object.entries(ch.v)) cs[k] = (cs[k] || 0) + v;
      if (ch.load != null && cs.loadE != null) cs.loadE += ch.load;
    }
    for (const s of slots) {
      this._solFin(s);
      const exp = (Math.min(s.tEnd, hourNow) - s.t) / H;
      if (s.loadE != null && exp > 0 && s.loadH >= exp - 1.5) s.load = s.loadE;
    }
    for (const x of means[e.bat_soc] || []) {
      const t = typeof x.start === "number" ? x.start : Date.parse(x.start);
      const i = find(t);
      if (i >= 0 && x.mean != null) slots[i].soc = x.mean;
    }
    const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    // Ø-Tagesverbrauch der letzten 7 Tage als Prognose für spätere Tage
    let avgDay = NaN;
    try {
      const w = await vrmWS(h, { type: "recorder/statistics_during_period", start_time: new Date(t0 - 7 * 86400000).toISOString(), end_time: new Date(t0).toISOString(), statistic_ids: ids, period: "day", types: ["change"], units: { energy: "kWh" } });
      const g = (id) => (w[id] || []).reduce((a, x) => a + (Math.abs(x.change || 0) > 720 ? 0 : x.change || 0), 0);
      const solT = e.e_solar_parts && e.e_solar_parts.length ? e.e_solar_parts.reduce((a, id) => a + g(id), 0) : g(e.e_solar);
      const tot = g(e.e_grid_in) - g(e.e_grid_out) + solT + g(e.e_bat_out) - g(e.e_bat_in);
      const nd = new Set((w[e.e_grid_in] || []).map((x) => new Date(typeof x.start === "number" ? x.start : Date.parse(x.start)).toDateString())).size;
      if (nd) avgDay = Math.max(0, tot / nd);
      if (e.load_power.length) {
        const rows = await vrmMeanSum(h, e.load_power, { start_time: new Date(t0 - 7 * 86400000).toISOString(), end_time: new Date(t0).toISOString(), period: "day" });
        if (rows.length >= 3) avgDay = rows.reduce((a, x) => a + x.mean, 0) / rows.length * 24 / 1000;
      }
    } catch (err) { /* ohne Durchschnitt */ }
    for (const s of slots) {
      const has = s.gin != null || s.sol != null || s.load != null;
      const past = s.t <= now.getTime();
      s.cons = has && past ? this._cons(s) : null;
      s.sol = has && past ? Math.max(0, s.sol || 0) : null;
      s.gin = s.gin || 0; s.gout = s.gout || 0;
      s.baseIst = s.cons == null ? null : Math.max(0, s.cons - this._excl(s));
      if (per === "day" && s.tEnd > now.getTime()) {
        const o = Math.round((s.t - t0) / 86400000);
        const cons = o === 0 ? vrmNum(h, e.fc_cons_today) : o === 1 ? vrmNum(h, e.fc_cons_tomorrow) : avgDay;
        const sol = o === 0 ? vrmNum(h, e.fc_solar_today) : o === 1 ? vrmNum(h, e.fc_solar_tomorrow) : NaN;
        s.consFc = isNaN(cons) ? null : cons;
        s.solFc = isNaN(sol) ? null : sol;
        if (s.solFc == null && o >= 2 && o <= 9) {             // eigene Prognose aus DWD-Einstrahlung
          try {
            const dd = await this._dayData(o);
            const v = dd.hours.reduce((a, x) => a + (x.solOwn || 0), 0);
            if (v > 0) { s.solFc = v; s.solShow = v; }
          } catch (err) { /* ohne */ }
        }
      }
    }
    return { day0: r.start, hours: slots, interval: per, single: false, start: r.start, end: r.end };
  }

  _pairs() {
    const e = this._e;
    return [[e.e_grid_in, "gin"], [e.e_grid_out, "gout"], [e.e_solar, "solV"], [e.e_bat_out, "bout"], [e.e_bat_in, "bin"]]
      .concat((e.e_solar_parts || []).map((id, k) => [id, "p" + k]))
      .concat((e.e_excl || []).map((id, k) => [id, "x" + k])).filter((p) => p[0]);
  }
  // Solar: Gerätezähler, wenn alle da sind und nicht deutlich unter dem VRM-Wert liegen (sonst Teilabdeckung → VRM-Zähler)
  _solFin(o) {
    const n = (this._e.e_solar_parts || []).length;
    let ok = n > 0, sum = 0;
    for (let k = 0; k < n; k++) { if (o["p" + k] == null) ok = false; else sum += Math.max(0, o["p" + k]); }
    o.sol = ok && (o.solV == null || sum >= o.solV * 0.9) ? sum : (o.solV != null ? o.solV : (ok ? sum : o.sol));
  }
  // Energy of the consumers excluded from the base load (EV charger, heat pump, ...)
  _excl(o) { let x = 0; (this._e.e_excl || []).forEach((id, k) => { x += Math.max(0, o["x" + k] || 0); }); return x; }
  // Verbrauch: Mittel der AC-Lasten (wie VRM), sonst Energiebilanz als Rückfall
  _cons(o) {
    if (o.load != null) return Math.max(0, o.load);
    return Math.max(0, (o.gin || 0) - (o.gout || 0) + (o.sol || 0) + (o.bout || 0) - (o.bin || 0));
  }
  // Laufende Stunde aus den 5-Minuten-Statistiken (Stundenwerte gibt es erst nach Ablauf der Stunde)
  async _curHour() {
    const H = 3600000, hs = Math.floor(Date.now() / H) * H, nq = vrmNowQ();
    const out = { t: hs, v: {}, load: null };
    if (nq <= hs) return out;
    const pairs = this._pairs(), q = { type: "recorder/statistics_during_period", start_time: new Date(hs).toISOString(), end_time: new Date(nq).toISOString(), period: "5minute" };
    try {
      const st = await vrmWS(this._hass, Object.assign({ statistic_ids: pairs.map((p) => p[0]), types: ["change"], units: { energy: "kWh" } }, q));
      for (const [id, key] of pairs) if (st[id] && st[id].length) out.v[key] = st[id].reduce((a, x) => a + (Math.abs(x.change || 0) > 5 ? 0 : x.change || 0), 0);
      const lp = this._e.load_power;
      if (lp.length) {
        const rows = await vrmMeanSum(this._hass, lp, { start_time: q.start_time, end_time: q.end_time, period: q.period });
        if (rows.length) out.load = rows.reduce((a, x) => a + x.mean, 0) * 5 / 60 / 1000;
      }
    } catch (err) { /* ohne laufende Stunde */ }
    return out;
  }

  // Ein Kalendertag in Stunden (Ist, VRM-Prognosen, eigene Prognosen)
  async _dayData(off) {
    {
      const e = this._e, h = this._hass;
      const H = 3600000;
      const now = new Date();
      const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const day0 = new Date(today0); day0.setDate(day0.getDate() + off);
      const dayEnd = new Date(day0); dayEnd.setDate(dayEnd.getDate() + 1);
      const ref = day0 < today0 ? day0 : today0;               // Historie endet vor dem gewählten Tag (bzw. heute)
      const hist21 = new Date(ref); hist21.setDate(hist21.getDate() - 21);
      const hist7 = new Date(ref); hist7.setDate(hist7.getDate() - 7);
      const qEnd = new Date(Math.min(dayEnd.getTime(), vrmNowQ() + H));
      const idx = (t) => Math.floor((t - day0.getTime()) / H);

      // 1) Langzeitstatistik (Energie: change, VRM-Stundensensoren/SoC: mean)
      const pairs = this._pairs(), ids = pairs.map((p) => p[0]);
      const meanIds = [e.bat_soc, e.fc_cons_cur, e.fc_sol_cur].filter(Boolean);
      const stats = qEnd > hist21 ? await vrmWS(h, {
        type: "recorder/statistics_during_period", start_time: hist21.toISOString(), end_time: qEnd.toISOString(),
        statistic_ids: ids, period: "hour", types: ["change"], units: { energy: "kWh" },
      }) : {};
      const means = qEnd > day0 ? await vrmWS(h, {
        type: "recorder/statistics_during_period", start_time: day0.toISOString(), end_time: qEnd.toISOString(),
        statistic_ids: meanIds, period: "hour", types: ["mean"],
      }) : {};
      const byHour = {};
      const add = (id, key) => {
        for (const r of stats[id] || []) {
          const t = typeof r.start === "number" ? r.start : Date.parse(r.start);
          const c = r.change || 0;
          (byHour[t] = byHour[t] || {})[key] = Math.abs(c) > 30 ? 0 : c;
        }
      };
      for (const [id, key] of pairs) add(id, key);
      if (e.load_power.length && qEnd > hist21) {
        const lm = await vrmMeanSum(h, e.load_power, { start_time: hist21.toISOString(), end_time: qEnd.toISOString(), period: "hour" });
        for (const x of lm) {
          const t = typeof x.start === "number" ? x.start : Date.parse(x.start);
          if (x.mean != null) (byHour[t] = byHour[t] || {}).load = x.mean / 1000;
        }
      }
      const hsNow = Math.floor(now.getTime() / H) * H;
      if (hsNow >= day0.getTime() && hsNow < dayEnd.getTime()) {
        const ch = await this._curHour();
        const o = byHour[ch.t] = byHour[ch.t] || {};
        Object.assign(o, ch.v);
        if (ch.load != null) o.load = ch.load; else delete o.load;
      }
      for (const o of Object.values(byHour)) this._solFin(o);
      const cons = (o) => this._cons(o);
      const base = (o) => Math.max(0, cons(o) - this._excl(o));
      const meanArr = (id) => {
        const a = new Array(24).fill(null);
        for (const r of means[id] || []) {
          const t = typeof r.start === "number" ? r.start : Date.parse(r.start);
          const i = Math.round((t - day0.getTime()) / H);
          if (i >= 0 && i < 24 && r.mean != null) a[i] = r.mean;
        }
        return a;
      };
      const socArr = meanArr(e.bat_soc), vrmConsHist = meanArr(e.fc_cons_cur), vrmSolHist = meanArr(e.fc_sol_cur);

      // 2) Eigene Verbrauchs-/Grundlastprognose: Mittel derselben Stunde der 7 Tage davor
      const avgC = new Array(24).fill(0), lstB = Array.from({ length: 24 }, () => []), cnt = new Array(24).fill(0);
      for (const [t, o] of Object.entries(byHour)) {
        const tt = Number(t);
        if (tt < hist7.getTime() || tt >= ref.getTime()) continue;
        const hr = new Date(tt).getHours();
        if (o.load == null && o.gin == null) continue;
        avgC[hr] += cons(o); lstB[hr].push(base(o)); cnt[hr]++;
      }
      let consFc = avgC.map((v, i) => (cnt[i] ? v / cnt[i] : 0));
      const baseOwnRaw = lstB.map((a) => vrmMedian(a));   // Median: einzelne Ausreißer (Sauna, Backofen) zählen nicht zur Grundlast
      let baseFc = baseOwnRaw.slice();
      const daySensor = (map) => { const id = map[String(off)]; return id ? vrmNum(h, id) : NaN; };
      let dayFcCons = daySensor({ "-1": e.fc_cons_yesterday, "0": e.fc_cons_today, "1": e.fc_cons_tomorrow });
      let dayFcSol = daySensor({ "-1": e.fc_solar_yesterday, "0": e.fc_solar_today, "1": e.fc_solar_tomorrow });
      if (isNaN(dayFcCons) && vrmConsHist.some((v) => v != null)) dayFcCons = vrmConsHist.reduce((a, v) => a + (v || 0), 0);
      const fcSum = consFc.reduce((a, b) => a + b, 0);
      if (!isNaN(dayFcCons) && fcSum > 0) {
        const k = dayFcCons / fcSum;
        consFc = consFc.map((v) => v * k);
        baseFc = baseFc.map((v) => v * k);
      }
      // VRM-Verbrauch je Stunde aus der Historie (vergangene Tage / abgelaufene Stunden)
      vrmConsHist.forEach((v, i) => { if (v != null) consFc[i] = v; });

      // 3) VRM-Solarprognose: Energie-Dashboard (aktuell) bzw. Historie des Stundensensors
      const solFc = vrmSolHist.map((v) => (v == null ? 0 : v));
      try {
        const prefs = this._c.useEnergyForecast ? await vrmWS(h, { type: "energy/get_prefs" }) : {};
        const entries = [];
        for (const s of prefs.energy_sources || []) if (s.type === "solar" && s.config_entry_solar_forecast) entries.push(...s.config_entry_solar_forecast);
        if (entries.length && off >= 0 && this._c.useEnergyForecast) {
          const fc = await vrmWS(h, { type: "energy/solar_forecast" });
          const tmp = new Array(24).fill(null);
          for (const id of entries) {
            const wh = (fc[id] && fc[id].wh_hours) || {};
            for (const [iso, v] of Object.entries(wh)) {
              const i = idx(new Date(iso).getTime());
              if (i >= 0 && i < 24) tmp[i] = (tmp[i] || 0) + v / 1000;
            }
          }
          tmp.forEach((v, i) => { if (v != null) solFc[i] = v; });
        }
      } catch (err) { /* keine Solarprognose */ }

      // 4) VRM-Stundenreihe aus Node-RED (heute/morgen): Verbrauch, Grundlast, Solar
      const baseVrm = new Array(24).fill(null);
      const fcEnt = h.states[e.fc_hours];
      const fcA = (fcEnt && fcEnt.attributes) || {};
      const fcRows = Array.isArray(fcA.hours) ? fcA.hours : Array.isArray(fcA.stunden) ? fcA.stunden : [];
      let haveNR = false;
      for (const r of fcRows) {
        const i = idx(Number(r.t));
        if (i < 0 || i > 23) continue;
        haveNR = true;
        const rc = r.consumption != null ? r.consumption : r.verbrauch, rb = r.baseload != null ? r.baseload : r.grundlast;
        if (rc != null) consFc[i] = Number(rc);
        if (rb != null) { baseFc[i] = Number(rb); baseVrm[i] = Number(rb); }
        if (r.solar != null) solFc[i] = Number(r.solar);
      }
      if (!haveNR && off === 0) {
        const ci = now.getHours();
        const cc = vrmNum(h, e.fc_cons_cur), cn = vrmNum(h, e.fc_cons_next);
        if (!isNaN(cc)) consFc[ci] = cc;
        if (!isNaN(cn) && ci + 1 < 24) consFc[ci + 1] = cn;
      }
      // 4b) Prognose-Archiv: für abgelaufene Stunden gilt die Prognose, wie sie am Tagesanfang gespeichert wurde
      const arEnt = e.fc_archive ? h.states[e.fc_archive] : null;
      const arA = (arEnt && arEnt.attributes) || {};
      const arTage = arA.days && typeof arA.days === "object" ? arA.days : arA.tage && typeof arA.tage === "object" ? arA.tage : {};
      const p2 = (n) => String(n).padStart(2, "0");
      const arch = arTage[`${day0.getFullYear()}-${p2(day0.getMonth() + 1)}-${p2(day0.getDate())}`] || null;
      let archVrm = 0;
      if (arch && Array.isArray(arch.vrm) && off <= 0) {
        arch.vrm.forEach((v, j) => {
          const t = Number(arch.t0) + j * H, i = idx(t);
          if (typeof v !== "number" || i < 0 || i > 23 || t + H > now.getTime()) return;
          solFc[i] = v; archVrm++;
        });
        const aDay = typeof arch.vrm_day === "number" ? arch.vrm_day : arch.vrm_tag;
        if (off < 0 && archVrm) dayFcSol = typeof aDay === "number" ? aDay : solFc.reduce((a, v) => a + (v || 0), 0);
      }
      if (isNaN(dayFcSol)) dayFcSol = solFc.reduce((a, v) => a + (v || 0), 0);

      // 5) Eigene Solarprognose: Klarhimmel-Ertrag je Stunde × Bewölkungsfaktor (Kasten-Czeplak)
      const solOwn = await this._ownSolar(byHour, hist21, ref, day0, dayEnd, now, arch);
      solOwn.info.archVrm = archVrm; solOwn.info.archZeit = arch ? arch.time || arch.zeit || null : null;

      const vrmSolHas = solFc.some((v) => (v || 0) > 0.001);
      if (!vrmSolHas && off >= 1) dayFcSol = solOwn.val.reduce((a, v) => a + (v || 0), 0);
      const hours = [];
      for (let i = 0; i < 24; i++) {
        const t = day0.getTime() + i * H;
        const o = t < now.getTime() ? byHour[t] : undefined;
        hours.push({
          t, tEnd: t + H, cons: o ? cons(o) : null, sol: o ? Math.max(0, o.sol || 0) : null,
          gin: o ? o.gin || 0 : 0, gout: o ? o.gout || 0 : 0,
          consFc: consFc[i], baseFc: baseFc[i], baseOwn: baseOwnRaw[i], baseVrm: baseVrm[i], baseIst: o ? base(o) : null,
          solFc: solFc[i], solOwn: solOwn.val[i], solShow: vrmSolHas ? solFc[i] : solOwn.val[i], cloud: solOwn.cloud[i], soc: socArr[i],
        });
      }
      return { day0, hours, off, dayFcCons, dayFcSol, solOwnInfo: solOwn.info };
    }
  }

  // Bewölkung (0–100 %) je Stunde: Vergangenheit aus der Wetter-Historie, Zukunft aus der Stundenvorhersage
  async _clouds(start, end, now) {
    const H = 3600000, e = this._e, h = this._hass;
    const out = {};
    if (start < now) {
      try {
        const res = await vrmWS(h, {
          type: "history/history_during_period", start_time: start.toISOString(), end_time: new Date(Math.min(end.getTime(), vrmNowQ())).toISOString(),
          entity_ids: [e.weather], minimal_response: false, no_attributes: false, significant_changes_only: false,
        });
        const rows = (res && res[e.weather]) || [];
        const sum = {}, n = {};
        let last = null, lastT = start.getTime();
        const put = (t, v) => { const k = Math.floor(t / H) * H; sum[k] = (sum[k] || 0) + v; n[k] = (n[k] || 0) + 1; };
        for (const r of rows) {
          const t = (r.lu || r.lc || 0) * 1000;
          const v = r.a && r.a.cloud_coverage;
          if (last != null) for (let x = Math.floor(lastT / H) * H + H; x < t; x += H) put(x, last);   // Lücken füllen
          if (typeof v === "number") { put(t, v); last = v; lastT = t; }
        }
        if (last != null) for (let x = Math.floor(lastT / H) * H + H; x < Math.min(end.getTime(), now.getTime()); x += H) put(x, last);
        for (const k of Object.keys(sum)) out[k] = sum[k] / n[k];
      } catch (err) { /* keine Historie */ }
    }
    if (end > now) {
      try {
        const r = await vrmWS(h, { type: "call_service", domain: "weather", service: "get_forecasts", service_data: { type: "hourly" }, target: { entity_id: e.weather }, return_response: true });
        const fc = (r && r.response && r.response[e.weather] && r.response[e.weather].forecast) || [];
        for (const f of fc) {
          const t = Date.parse(f.datetime);
          if (typeof f.cloud_coverage === "number" && t + H > now.getTime()) out[Math.floor(t / H) * H] = f.cloud_coverage;
        }
      } catch (err) { /* keine Vorhersage */ }
    }
    return out;
  }

  async _ownSolar(byHour, hist21, ref, day0, dayEnd, now, arch) {
    const H = 3600000;
    const kc = (c) => 1 - 0.75 * Math.pow(Math.max(0, Math.min(100, c)) / 100, 3.4);   // Kasten-Czeplak
    const clouds = await this._clouds(hist21, dayEnd, now);
    // Klarhimmel-Ertrag je Tagesstunde: Median aus (Ertrag / Bewölkungsfaktor) der 21 Tage davor, gedeckelt auf 1,3 × Bestwert
    const est = Array.from({ length: 24 }, () => []), best = new Array(24).fill(0);
    for (const [t, o] of Object.entries(byHour)) {
      const tt = Number(t);
      if (tt < hist21.getTime() || tt >= ref.getTime()) continue;
      const s = Math.max(0, o.sol || 0), hr = new Date(tt).getHours();
      best[hr] = Math.max(best[hr], s);
      if (s > 0.01 && clouds[tt] != null) est[hr].push(s / Math.max(0.3, kc(clouds[tt])));
    }
    const clear = est.map((a, i) => {
      if (a.length < 3) return best[i];
      a.sort((x, y) => x - y);
      const med = a[Math.floor(a.length / 2)];
      return Math.min(med, best[i] * 1.3 || med);
    });
    // DWD-Globalstrahlung: Vorhersage aus Attribut data (Wert zum Zeitpunkt T = Mittel der Stunde davor),
    // Vergangenheit aus der Langzeitstatistik des Sensors (sobald vorhanden)
    const h = this._hass, e = this._e;
    const lat = (h.config && h.config.latitude) || 51.15, lon = (h.config && h.config.longitude) || 8.0;
    const irr = {};
    let irrHist = {};
    const ent = e.irr ? h.states[e.irr] : null;
    if (ent) {
      for (const x of (ent.attributes && Array.isArray(ent.attributes.data) ? ent.attributes.data : [])) {
        const T = Date.parse(x.datetime);
        if (!isNaN(T) && typeof x.value === "number") irr[T - H] = x.value;
      }
      try {
        const st = await vrmWS(h, { type: "recorder/statistics_during_period", start_time: hist21.toISOString(), end_time: new Date(Math.min(dayEnd.getTime(), vrmNowQ())).toISOString(), statistic_ids: [e.irr], period: "hour", types: ["mean"] });
        for (const x of st[e.irr] || []) {
          const t = typeof x.start === "number" ? x.start : Date.parse(x.start);
          if (x.mean != null) irrHist[t - H] = x.mean;   // Sensorwert der Stunde gehört zur Strahlung der Stunde davor
        }
      } catch (err) { irrHist = {}; }
    }
    // Direkte Kalibrierung kWh je kW/m² pro Tagesstunde, sobald genug DWD-Historie da ist
    const kd = Array.from({ length: 24 }, () => []);
    for (const [t, o] of Object.entries(byHour)) {
      const tt = Number(t);
      if (tt < hist21.getTime() || tt >= ref.getTime()) continue;
      const g = irrHist[tt];
      if (g != null && g > 30) kd[new Date(tt).getHours()].push(Math.max(0, o.sol || 0) / (g / 1000));
    }
    const kDirect = kd.map((a) => { if (a.length < 5) return null; a.sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; });
    const val = new Array(24).fill(null), cloud = new Array(24).fill(null);
    // Archivierte DWD-Vorhersage des Tages (Stand Tagesanfang) – für abgelaufene Stunden statt der Messwerte
    const irrArch = {};
    const aIrr = arch ? arch.irradiance || arch.dwd : null;
    if (Array.isArray(aIrr)) aIrr.forEach((v, j) => { if (typeof v === "number") irrArch[Number(arch.t0) + j * H] = v; });
    let usedClouds = 0, usedIrr = 0, usedDirect = 0, archHours = 0, hindHours = 0;
    for (let i = 0; i < 24; i++) {
      const t = day0.getTime() + i * H;
      const c = clouds[t];
      cloud[i] = c == null ? null : c;
      const past = t + H <= now.getTime(), ga = irrArch[t];
      const g = past && ga != null ? ga : (irr[t] != null ? irr[t] : (ga != null ? ga : irrHist[t]));
      if (past && ga != null) archHours++; else if (past) hindHours++;
      if (g != null && kDirect[i] != null) { val[i] = kDirect[i] * g / 1000; usedDirect++; continue; }
      if (clear[i] <= 0.001) { val[i] = 0; continue; }
      if (g != null) {
        const gc = vrmGhiClear(t + H / 2, lat, lon);
        const kt = gc > 15 ? Math.min(1.2, g / gc) : (g > 0 ? 1 : 0);   // Klarheitsgrad der Stunde aus DWD
        val[i] = clear[i] * kt;
        usedIrr++;
        continue;
      }
      if (c == null) { val[i] = null; continue; }
      val[i] = clear[i] * kc(c);
      usedClouds++;
    }
    const days = new Set(Object.keys(byHour).map(Number).filter((t) => t >= hist21.getTime() && t < ref.getTime()).map((t) => new Date(t).toDateString())).size;
    const irrDays = new Set(Object.keys(irrHist).map((t) => new Date(Number(t)).toDateString())).size;
    return { val, cloud, info: { days, hours: usedClouds, irrHours: usedIrr, directHours: usedDirect, irrDays, archHours, hindHours, clearSum: clear.reduce((a, b) => a + b, 0) } };
  }

  _axisLabels(out, G, hours, slot, interval) {
    const N = hours.length;
    const every = interval === "hour" ? Math.max(G.every, Math.ceil(N / (G.rot ? 12 : 24)) * (N > 24 ? (G.rot ? 1 : 2) : 1)) : Math.max(1, Math.ceil(N / (G.rot ? 8 : 16)));
    const mon = (d) => d.toLocaleString(vrmLoc(), { month: "short" }).replace(".", "");
    const kw = (d) => { const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const dn = x.getUTCDay() || 7; x.setUTCDate(x.getUTCDate() + 4 - dn); const y0 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1)); return Math.ceil(((x - y0) / 86400000 + 1) / 7); };
    hours.forEach((s, i) => {
      const cx = G.L + i * slot + slot / 2;
      out.push(`<line x1="${cx}" y1="${G.B}" x2="${cx}" y2="${G.B + 5}" class="ax"/>`);
      if (i % every) return;
      const d = new Date(s.t);
      let lab;
      if (interval === "hour") lab = (i === 0 || d.getHours() === 0) ? `${d.getDate()}. ${mon(d)}` : `${String(d.getHours()).padStart(2, "0")}:00`;
      else if (interval === "day") lab = `${d.getDate()}. ${mon(d)}`;
      else if (interval === "week") lab = `${L_("KW")} ${kw(d)}`;
      else lab = `${mon(d)} ${String(d.getFullYear()).slice(2)}`;
      if (G.rot) out.push(`<text x="${cx + 4}" y="${G.B + 12}" text-anchor="end" font-size="${G.fs}" class="tx2" transform="rotate(-45 ${cx + 4} ${G.B + 12})">${lab}</text>`);
      else out.push(`<text x="${cx}" y="${G.B + 22}" text-anchor="middle" font-size="${G.fs}" class="tx2">${lab}</text>`);
    });
  }
  _curIdx(hours) {
    const n = Date.now(), H = 3600000;
    const i = hours.findIndex((s) => n >= s.t && n < (s.tEnd || s.t + H));
    if (i >= 0) return i;
    return hours.length && n >= (hours[hours.length - 1].tEnd || hours[hours.length - 1].t + H) ? hours.length : -1;
  }

  _yScale(maxV) {
    const raw = Math.max(0.5, maxV);
    const steps = [0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find((st) => raw / st <= 6) || Math.ceil(raw / 6);
    return { steps, yMax: Math.ceil(raw / steps) * steps };
  }

  _renderChart() {
    if (!this._root || !this._data) return;
    const svg = this._root.getElementById("svg");
    const msg = this._root.getElementById("msg");
    msg.style.display = "none";
    const G = this._geo();
    const { hours, interval } = this._data;
    const N = Math.max(1, hours.length);
    const curIdx = this._curIdx(hours);
    const { L, R, T, B } = G;
    let maxV = 0;
    const sF = (hh) => (hh.solShow != null ? hh.solShow : hh.solFc);
    for (const hh of hours) maxV = Math.max(maxV, hh.cons || 0, hh.sol || 0, hh.consFc || 0, sF(hh) || 0);
    const { steps, yMax } = this._yScale(maxV);
    const y = (v) => B - (v / yMax) * (B - T);
    const ySoc = (p) => B - (p / 100) * (B - T);
    const slot = (R - L) / N;
    const bw = slot * 0.36;
    const out = [];
    const pat = (id, c, bg) => `<pattern id="${id}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" ${bg ? `fill="${bg}"` : 'class="hbg"'}/><line x1="0" y1="0" x2="0" y2="5" stroke="${c}" stroke-width="2.2"/></pattern>`;
    out.push(`<defs>${pat("hr", "#f2716b")}${pat("ho", "#f4a83a")}${pat("hb", "#f2716b", "#fbd5d2")}</defs>`);
    if (curIdx >= 0 && curIdx < N) {
      const x0 = L + curIdx * slot;
      out.push(`<rect x="${x0}" y="${T}" width="${slot}" height="${B - T}" class="hl"/>`);
      const lw = G.fs * 3.6;
      out.push(`<rect x="${x0 + slot / 2 - lw / 2}" y="${T - 32}" width="${lw}" height="${G.fs * 2}" rx="2" class="hlt"/><text x="${x0 + slot / 2}" y="${T - 32 + G.fs * 1.4}" text-anchor="middle" font-size="${G.fs + 1}" font-weight="600" class="tx1">${L_("Jetzt")}</text>`);
    }
    out.push(`<text x="${L - 6}" y="${T - 22}" text-anchor="end" font-size="${G.fs}" class="tx3">kWh</text>`);
    out.push(`<text x="${R + 10}" y="${T - 22}" font-size="${G.fs}" class="tx3">%</text>`);
    for (let v = 0; v <= yMax + 1e-9; v += steps) out.push(`<text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" font-size="${G.fs}" class="txy">${+v.toFixed(2)}</text>`);
    for (let p = 0; p <= 100; p += (G.rot ? 20 : 10)) out.push(`<text x="${R + 8}" y="${ySoc(p) + 4}" font-size="${G.fs}" class="tx3">${p}</text>`);
    out.push(`<line x1="${L}" y1="${T}" x2="${L}" y2="${B}" class="ax"/><line x1="${R}" y1="${T}" x2="${R}" y2="${B}" class="ax"/><line x1="${L}" y1="${B}" x2="${R}" y2="${B}" class="ax"/>`);
    hours.forEach((hh, i) => {
      const cx = L + i * slot + slot / 2;
      const xC = cx - bw - 0.5, xS = cx + 0.5;
      const future = i > curIdx, cur = i === curIdx;
      const dl = new Date(hh.t);
      const when = interval === "hour" ? `${dl.toLocaleDateString(vrmLoc(), { day: "2-digit", month: "2-digit" })} ${String(dl.getHours()).padStart(2, "0")}:00` : dl.toLocaleDateString(vrmLoc(), interval === "month" ? { month: "long", year: "numeric" } : { day: "2-digit", month: "2-digit", year: "numeric" });
      const tip = (lbl, v) => `<title>${when} – ${lbl}: ${v.toFixed(2)} kWh</title>`;
      if (future || cur) {
        if (hh.consFc > 0.005) out.push(`<rect x="${xC}" y="${y(hh.consFc)}" width="${bw}" height="${B - y(hh.consFc)}" fill="url(#hr)" stroke="#f2716b" stroke-width="1">${tip(L_("Verbrauchsprognose"), hh.consFc)}</rect>`);
        const bF = hh.baseFc != null ? Math.min(hh.baseFc, hh.consFc || hh.baseFc) : null;
        if (bF != null && bF > 0.005) out.push(`<rect x="${xC}" y="${y(bF)}" width="${bw}" height="${B - y(bF)}" fill="url(#hb)" stroke="#f2716b" stroke-width="1">${tip(L_("Grundlastprognose"), bF)}</rect>`);
      }
      if (!future && hh.cons != null && hh.cons > 0.005) out.push(`<rect x="${xC}" y="${y(hh.cons)}" width="${bw}" height="${B - y(hh.cons)}" fill="#f2716b">${tip(L_("Verbrauch"), hh.cons)}</rect>`);
      const sv = sF(hh);
      if ((future || cur) && sv > 0.005) out.push(`<rect x="${xS}" y="${y(sv)}" width="${bw}" height="${B - y(sv)}" fill="url(#ho)" stroke="#f4a83a" stroke-width="1">${tip(L_(hh.solShow != null && hh.solShow !== hh.solFc ? "Solarprognose (eigene)" : "Solarprognose"), sv)}</rect>`);
      if (!future && hh.sol != null && hh.sol > 0.005) out.push(`<rect x="${xS}" y="${y(hh.sol)}" width="${bw}" height="${B - y(hh.sol)}" fill="#f4a83a">${tip(L_("Solar"), hh.sol)}</rect>`);
    });
    this._axisLabels(out, G, hours, slot, interval);
    const pts = [];
    hours.forEach((hh, i) => { if (hh.soc != null && i <= curIdx) pts.push([L + i * slot + slot / 2, ySoc(hh.soc), hh.soc, i]); });
    const liveSoc = vrmNum(this._hass, this._e.bat_soc);
    if (!isNaN(liveSoc) && curIdx >= 0 && curIdx < N) {
      const xNow = L + curIdx * slot + slot / 2;
      if (pts.length && pts[pts.length - 1][3] === curIdx) pts[pts.length - 1] = [xNow, ySoc(liveSoc), liveSoc, curIdx];
      else pts.push([xNow, ySoc(liveSoc), liveSoc, curIdx]);
    }
    if (pts.length) {
      out.push(`<polyline points="${pts.map((p) => `${p[0]},${p[1]}`).join(" ")}" fill="none" stroke="#3c87d6" stroke-width="1.5"/>`);
      const r = N > 31 ? 0 : 3;
      pts.forEach((p, k) => out.push(`<circle cx="${p[0]}" cy="${p[1]}" r="${r}" fill="${k === pts.length - 1 && curIdx < N ? "#7ac36a" : "#3c87d6"}"><title>${new Date(hours[p[3]].t).toLocaleString(vrmLoc(), { day: "2-digit", month: "2-digit", hour: interval === "hour" ? "2-digit" : undefined, minute: interval === "hour" ? "2-digit" : undefined })} – ${L_("Batterie")}: ${p[2].toFixed(1)} %</title></circle>`));
    }
    svg.innerHTML = out.join("");
  }

  _renderTiles() {
    if (!this._root || !this._data) return;
    const e = this._e, h = this._hass;
    const { hours } = this._data;
    const curIdx = this._curIdx(hours);
    let gin = 0, gout = 0, cons = 0, sol = 0, solFcSum = 0, consRest = 0, solRest = 0, anyFc = false;
    hours.forEach((hh, i) => {
      if (i <= curIdx) { gin += hh.gin || 0; gout += hh.gout || 0; cons += hh.cons || 0; sol += hh.sol || 0; }
      const sv = hh.solShow != null ? hh.solShow : hh.solFc;
      solFcSum += sv || 0;
      if (i > curIdx) { consRest += hh.consFc || 0; solRest += sv || 0; if (hh.consFc != null || sv != null) anyFc = true; }
      else if (i === curIdx) { consRest += Math.max(0, (hh.consFc || 0) - (hh.cons || 0)); solRest += Math.max(0, (sv || 0) - (hh.sol || 0)); if (hh.consFc != null) anyFc = true; }
    });
    const t = (id, v) => { const el = this._root.getElementById(id); if (el) el.textContent = v; };
    t("t_out", (+gout.toFixed(1)).toString());
    t("t_in", (+gin.toFixed(1)).toString());
    t("t_cons", cons.toFixed(1));
    t("t_sol", sol.toFixed(1));
    let cFcTotal, sFc;
    if (this._data.single) {
      const cFcN = this._data.off === 0 ? vrmNum(h, e.fc_hours) : NaN;
      const cFc = !isNaN(cFcN) && cFcN > 0 ? cFcN : this._data.dayFcCons;
      sFc = !isNaN(this._data.dayFcSol) && this._data.dayFcSol > 0 ? this._data.dayFcSol : solFcSum;
      cFcTotal = !isNaN(cFc) ? cFc : hours.reduce((a, b) => a + (b.consFc || 0), 0);
    } else {
      cFcTotal = anyFc ? cons + consRest : 0;
      sFc = anyFc ? sol + solRest : 0;
    }
    t("t_consfc", cFcTotal ? cFcTotal.toFixed(1) : "–");
    t("t_solfc", sFc ? sFc.toFixed(1) : "–");
    const cb = this._root.getElementById("t_cons_bar"), sb = this._root.getElementById("t_sol_bar");
    if (cb) cb.style.width = `${cFcTotal ? Math.min(100, (cons / cFcTotal) * 100) : 0}%`;
    if (sb) sb.style.width = `${sFc ? Math.min(100, (sol / sFc) * 100) : 0}%`;
  }
}


// ---------------------------------------------------------------- Vergleich Grundlastprognose
const CMP_DESK = { W: 1380, H: 640, svgW: 1366, svgH: 430, L: 80, R: 1300, T: 70, B: 385, fs: 11, every: 1, rot: false };
const CMP_MOB = { W: 393, H: 960, svgW: 373, svgH: 330, L: 34, R: 362, T: 96, B: 262, fs: 10.5, every: 2, rot: true };

const CMP_METRICS = {
  grundlast: { title: "Grundlastprognose – Vergleich", sub: "Eigene Berechnung (Verbrauch ohne ausgenommene Verbraucher, Median der 7 Tage davor) gegen {fc}",
    c: "#f2716b", ist: "Grundlast Ist", actT: "Grundlast – tatsächlich (Tag)", own: "baseOwn", vrm: "baseVrm", act: "baseIst", noVrm: "Keine Grundlast von {fc} für diesen Tag (stündliche Prognose nur für heute/morgen)" },
  solar: { title: "Solarprognose – Vergleich", sub: "Eigene Prognose (Klarhimmel-Ertrag aus 21 Tagen × Globalstrahlungs-Prognose, sonst Bewölkung) gegen {fc}",
    c: "#f4a83a", ist: "Solar Ist", actT: "Solar – tatsächlich (Tag)", own: "solOwn", vrm: "solFc", act: "sol", noVrm: "Keine Solarprognose von {fc} für diesen Tag" },
};
CMP_METRICS.baseload = CMP_METRICS.grundlast;
class VrmBaseCompareCard extends VrmChartCard {
  getCardSize() { return 9; }
  _geo() { return this._mode === "mob" ? CMP_MOB : CMP_DESK; }
  get _singleOnly() { return true; }
  _metric() { return CMP_METRICS[(this._config && this._config.metric) || "baseload"] || CMP_METRICS.baseload; }
  _buildShell(mode) {
    this._mode = mode;
    const M = this._metric();
    const G = this._geo();
    const mob = mode === "mob";
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    const tile = (style, h, vid, nid, small) => `<div class="tile" style="${style}"><div class="h">${h}</div><div class="v"${small ? ' style="font-size:' + (mob ? 17 : 19) + 'px;margin-top:' + (mob ? 16 : 16) + 'px"' : ""}><span id="${vid}">–</span>${small ? "" : ' <span class="u">kWh</span>'}</div><div class="n" id="${nid}"></div></div>`;
    const ts = mob
      ? ["left:10px;top:618px;width:181px;height:160px", "left:202px;top:618px;width:181px;height:160px", "left:10px;top:788px;width:181px;height:166px", "left:202px;top:788px;width:181px;height:166px", "left:10px;top:496px;width:373px;height:112px"]
      : ["left:281px;top:488px;width:265px;height:146px", "left:556px;top:488px;width:265px;height:146px", "left:831px;top:488px;width:265px;height:146px", "left:1106px;top:488px;width:268px;height:146px", "left:6px;top:488px;width:265px;height:146px"];
    root.innerHTML = `
<style>
  :host { display:block; }
  ${VRM_THEME_CSS}
  .stage { width:${G.W}px; height:${G.H}px; }
  .chartbox { position:absolute; left:${mob ? 10 : 6}px; top:${mob ? 56 : 8}px; width:${mob ? 373 : 1368}px; height:${mob ? 430 : 470}px; border:1px solid var(--bd); box-sizing:border-box; }
  ${this._navCss(mob)}
  .head { position:absolute; left:${mob ? 12 : 22}px; top:12px; font-size:${mob ? 15 : 14}px; font-weight:600; color:var(--t2); }
  .sub { position:absolute; left:${mob ? 12 : 22}px; top:${mob ? 34 : 34}px; ${mob ? "width:350px;" : ""} font-size:${mob ? 11 : 11.5}px; color:var(--t3); line-height:14px; }
  .legend { position:absolute; left:${mob ? 14 : 30}px; top:${mob ? 342 : 438}px; display:flex; flex-wrap:wrap; gap:${mob ? "8px 14px" : "16px"}; font-size:${mob ? 12 : 10.5}px; color:var(--t2); }
  .legend span { display:flex; align-items:center; gap:5px; }
  .legend em { display:inline-block; width:15px; height:10px; }
  .tile { position:absolute; border:1px solid var(--bd); box-sizing:border-box; padding:${mob ? "12px 14px" : "16px 18px"}; }
  .tile .h { font-size:${mob ? 13 : 12.5}px; color:var(--t2); line-height:16px; }
  .tile .v { font-size:${mob ? 28 : 32}px; margin-top:${mob ? 12 : 12}px; color:var(--t1); } .tile .v .u { color:var(--t3); font-size:${mob ? 20 : 24}px; }
  .tile .n { font-size:${mob ? 11.5 : 11.5}px; color:var(--t3); margin-top:8px; line-height:15px; }
  .msg { position:absolute; left:0; right:0; top:${mob ? 150 : 200}px; text-align:center; color:var(--t3); font-size:13px; }
  .note { position:absolute; left:${mob ? 40 : 90}px; right:${mob ? 12 : 70}px; top:${mob ? 66 : 56}px; text-align:center; color:#3c87d6; font-size:${mob ? 11 : 12}px; line-height:14px; }
</style>
<div class="wrap"><div class="stage">
  ${this._navHtml()}
  <div class="chartbox"><div class="head">${L_(M.title)}</div>
    <div class="sub">${L_(M.sub, { fc: this._c.fcName })}</div>
    <svg id="svg" width="${G.svgW}" height="${G.svgH}"></svg>
    <div class="legend">${this._legendHtml([[L_("Eigene Berechnung"), M.c], [this._c.fcName, "#3c87d6"], [L_(M.ist), "var(--t3);height:3px"]])}</div>
    <div class="msg" id="msg">${L_("Lade Daten …")}</div>
    <div class="note" id="note"></div>
  </div>
  ${tile(ts[4], L_(M.actT), "c_act", "c_act_n")}
  ${tile(ts[0], L_("Eigene Prognose (Tag)"), "c_own", "c_own_n")}
  ${tile(ts[1], L_("{fc} (Tag)", { fc: this._c.fcName }), "c_vrm", "c_vrm_n")}
  ${tile(ts[2], L_("Abweichung eigen − {fc}", { fc: this._c.fcName }), "c_diff", "c_diff_n")}
  ${tile(ts[3], L_("Mittl. Fehler je Stunde"), "c_mae", "c_mae_n", true)}
</div></div>`;
    this._root = root;
    this._wrap = root.querySelector(".wrap");
    this._stage = root.querySelector(".stage");
    if (this._hass) this._wrap.classList.toggle("dark", vrmDark(this._hass, this._config));
    this._bindNav();
    this._scale();
  }
  _renderChart() {
    if (!this._root || !this._data) return;
    const svg = this._root.getElementById("svg");
    this._root.getElementById("msg").style.display = "none";
    const G = this._geo();
    const { day0, hours } = this._data;
    const curIdx = Math.floor((Date.now() - day0.getTime()) / 3600000);
    const { L, R, T, B } = G;
    let maxV = 0;
    const M = this._metric();
    const gv = (hh, k) => (hh[M[k]] == null ? null : hh[M[k]]);
    const vrmOk = (hh) => gv(hh, "vrm") != null && (M.vrm !== "solFc" || hours.some((x) => (x.solFc || 0) > 0));
    for (const hh of hours) maxV = Math.max(maxV, gv(hh, "own") || 0, vrmOk(hh) ? gv(hh, "vrm") : 0, gv(hh, "act") || 0);
    const { steps, yMax } = this._yScale(maxV);
    const y = (v) => B - (v / yMax) * (B - T);
    const slot = (R - L) / 24, bw = slot * 0.36;
    const out = [];
    if (curIdx >= 0 && curIdx < 24) out.push(`<rect x="${L + curIdx * slot}" y="${T}" width="${slot}" height="${B - T}" class="hl"/>`);
    out.push(`<text x="${L - 6}" y="${T - 10}" text-anchor="end" font-size="${G.fs}" class="tx3">kWh</text>`);
    for (let v = 0; v <= yMax + 1e-9; v += steps) out.push(`<text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" font-size="${G.fs}" class="txy">${+v.toFixed(2)}</text><line x1="${L}" y1="${y(v)}" x2="${R}" y2="${y(v)}" class="gl"/>`);
    out.push(`<line x1="${L}" y1="${T}" x2="${L}" y2="${B}" class="ax"/><line x1="${L}" y1="${B}" x2="${R}" y2="${B}" class="ax"/>`);
    const pts = [];
    hours.forEach((hh, i) => {
      const cx = L + i * slot + slot / 2;
      const hl = `${String(i).padStart(2, "0")}:00`;
      const vo = gv(hh, "own"), vv = vrmOk(hh) ? gv(hh, "vrm") : null, va = gv(hh, "act");
      const cl = hh.cloud != null && M.own === "solOwn" ? ` (${L_("Bewölkung")} ${Math.round(hh.cloud)} %)` : "";
      if (vo != null && vo > 0.002) out.push(`<rect x="${cx - bw - 0.5}" y="${y(vo)}" width="${bw}" height="${B - y(vo)}" fill="${M.c}"><title>${hl} – ${L_("eigene Prognose")}: ${vo.toFixed(2)} kWh${cl}</title></rect>`);
      if (vv != null && vv > 0.002) out.push(`<rect x="${cx + 0.5}" y="${y(vv)}" width="${bw}" height="${B - y(vv)}" fill="#3c87d6"><title>${hl} – ${this._c.fcName}: ${vv.toFixed(2)} kWh</title></rect>`);
      if (i < curIdx && va != null) pts.push([cx, y(va), va, hl]);
    });
    this._axisLabels(out, G, hours, slot, "hour");
    if (pts.length) {
      out.push(`<polyline points="${pts.map((p) => `${p[0]},${p[1]}`).join(" ")}" fill="none" style="stroke:var(--t3)" stroke-width="2"/>`);
      pts.forEach((p) => out.push(`<circle cx="${p[0]}" cy="${p[1]}" r="3" style="fill:var(--t3)"><title>${p[3]} – ${L_(M.ist)}: ${p[2].toFixed(2)} kWh</title></circle>`));
    }
    const note = this._root.getElementById("note");
    if (note) note.textContent = hours.some((hh) => vrmOk(hh)) ? "" : L_(M.noVrm, { fc: this._c.fcName });
    svg.innerHTML = out.join("");
  }
  _renderTiles() {
    if (!this._root || !this._data) return;
    const { day0, hours } = this._data;
    const curIdx = Math.floor((Date.now() - day0.getTime()) / 3600000);
    const t = (id, v) => { const el = this._root.getElementById(id); if (el) el.textContent = v; };
    const M = this._metric();
    const gv = (hh, k) => (hh[M[k]] == null ? null : hh[M[k]]);
    const own = hours.reduce((a, hh) => a + (gv(hh, "own") || 0), 0);
    const hasVrm = hours.some((hh) => gv(hh, "vrm") != null) && (M.vrm !== "solFc" || hours.some((x) => (x.solFc || 0) > 0));
    const vrm = hasVrm ? hours.reduce((a, hh) => a + (gv(hh, "vrm") || 0), 0) : 0;
    t("c_own", own.toFixed(1)); t("c_own_n", `Ø ${(own / 24 * 1000).toFixed(0)} W`);
    t("c_vrm", hasVrm ? vrm.toFixed(1) : "–"); t("c_vrm_n", hasVrm ? `Ø ${(vrm / 24 * 1000).toFixed(0)} W` : L_("für diesen Tag nicht verfügbar"));
    if (M.own === "solOwn" && this._data.solOwnInfo) {
      const I = this._data.solOwnInfo;
      const src = I.directHours ? L_("Einstrahlung direkt kalibriert ({n} Tage)", { n: I.irrDays }) : I.irrHours ? L_("Einstrahlung × Klarhimmel") : I.hours ? L_("Bewölkung (keine Einstrahlung)") : L_("zu wenig Daten");
      t("c_own_n", `${src} · ${L_("Klarhimmel")} ${I.clearSum.toFixed(1)} kWh`);
      if (this._data.off < 0) {
        const z = I.archZeit ? new Date(I.archZeit) : null;
        const zs = z && !isNaN(z) ? ` ${L_("vom")} ${z.toLocaleString(vrmLoc(), { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : "";
        t("c_own_n", I.archHours ? `${src} · ${L_("gespeicherte Prognose")}${zs}` : `${src} · ${L_("Nachrechnung mit gemessenem Wetter (kein Archiv)")}`);
        if (hasVrm) t("c_vrm_n", I.archVrm ? `${L_("gespeicherte Prognose")}${zs}` : L_("aus Verlauf des Stundensensors"));
      }
    }
    if (hasVrm) {
      const d = own - vrm;
      t("c_diff", `${d >= 0 ? "+" : ""}${d.toFixed(1)}`);
      t("c_diff_n", vrm > 0 ? `${d >= 0 ? "+" : ""}${(d / vrm * 100).toFixed(0)} % ${L_("gegenüber")} ${this._c.fcName}` : "");
    } else { t("c_diff", "–"); t("c_diff_n", ""); }
    let eo = 0, ev = 0, n = 0, nv = 0;
    hours.forEach((hh, i) => {
      const va = gv(hh, "act");
      if (i >= curIdx || va == null) return;
      if (M.own === "solOwn" && va < 0.005 && !(gv(hh, "own") > 0.005) && !((hh.solFc || 0) > 0.005)) return;   // Nachtstunden nicht mitzählen
      eo += Math.abs((gv(hh, "own") || 0) - va);
      if (hasVrm && gv(hh, "vrm") != null) { ev += Math.abs(gv(hh, "vrm") - va); nv++; }
      n++;
    });
    // Tatsächlicher Wert des Tages (bis zur laufenden Stunde)
    let act = 0, nA = 0, ownTo = 0, vrmTo = 0;
    hours.forEach((hh, i) => {
      const va = gv(hh, "act");
      if (i > curIdx || va == null) return;
      act += va; nA++; ownTo += gv(hh, "own") || 0; vrmTo += gv(hh, "vrm") || 0;
    });
    if (!nA) { t("c_act", "–"); t("c_act_n", L_("noch keine Ist-Werte für diesen Tag")); }
    else {
      t("c_act", act.toFixed(1));
      const pc = (x) => { if (!(x > 0.05)) return "–"; const p = (act / x - 1) * 100; return `${p >= 0 ? "+" : "−"}${Math.abs(p).toFixed(0)} %`; };
      const full = curIdx >= 24;
      const fcN = this._c.fcName;
      const nn = full ? `${L_("ganzer Tag · Ist gegenüber Prognose")}: ${L_("eigen")} ${pc(ownTo)} · ${fcN} ${hasVrm ? pc(vrmTo) : "–"}`
        : `${L_("bis")} ${new Date().toLocaleTimeString(vrmLoc(), { hour: "2-digit", minute: "2-digit" })} · ${L_("Prognose bis dahin")}: ${L_("eigen")} ${ownTo.toFixed(1)}${hasVrm ? ` · ${fcN} ${vrmTo.toFixed(1)}` : ""} kWh`;
      t("c_act_n", nn);
    }
    if (n) {
      t("c_mae", `${L_("eigen")} ${(eo / n).toFixed(2)} · ${this._c.fcName} ${nv ? (ev / nv).toFixed(2) : "–"} kWh`);
      t("c_mae_n", L_(n === 1 ? "über {n} Stunde mit Ist-Werten – kleiner ist besser" : "über {n} Stunden mit Ist-Werten – kleiner ist besser", { n }));
    } else { t("c_mae", "–"); t("c_mae_n", L_("noch keine Ist-Werte für diesen Tag")); }
  }
}

// ---------------------------------------------------------------- Visual editor
// Form for the dashboard editor: all settings without YAML, lists with add / remove,
// automatic detection of the Victron GX integration and the VRM Forecast integration.

const VRM_ENT = (domain) => ({ entity: domain ? { domain } : {} });
const VRM_ENTS = (domain) => ({ entity: Object.assign({ multiple: true }, domain ? { domain } : {}) });
const VRM_F = (name, sel, label) => ({ name, selector: typeof sel === "string" ? VRM_ENT(sel) : sel, label });

// Section definitions. key = config key of the section (null = top level), list = list of devices
function vrmEditorSections() {
  const S = "sensor";
  return [
    { id: "general", title: "Allgemein", key: null, schema: [
      VRM_F("title", { text: {} }, "Titel"), VRM_F("icon", { icon: {} }, "Symbol"),
      VRM_F("language", { select: { mode: "dropdown", options: [{ value: "", label: "Automatisch" }, { value: "de", label: "Deutsch" }, { value: "en", label: "English" }] } }, "Sprache"),
      VRM_F("theme", { select: { mode: "dropdown", options: [{ value: "", label: "Automatisch" }, { value: "light", label: "Hell" }, { value: "dark", label: "Dunkel" }] } }, "Design"),
      VRM_F("weather", "weather", "Wetter"), VRM_F("total_solar", S, "Gesamt-Solarleistung (optional)"),
    ] },
    { id: "grid", title: "Netz", key: "grid", schema: [VRM_F("name", { text: {} }, "Name"), VRM_F("power", S, "Leistung"), VRM_F("invert", { boolean: {} }, "Bezug ist negativ (umkehren)")],
      sub: { key: "phases", title: "Phasen", max: 3, item: "Phase", schema: [VRM_F("voltage", S, "Spannung"), VRM_F("current", S, "Strom"), VRM_F("power", S, "Leistung")] } },
    { id: "ac_loads", title: "AC-Lasten", key: "ac_loads", schema: [VRM_F("name", { text: {} }, "Name"), VRM_F("power", S, "Leistung (optional, sonst Summe der Phasen)")],
      sub: { key: "phases", title: "Phasen", max: 3, item: "Phase", schema: [VRM_F("power", S, "Leistung")] } },
    { id: "inverter", title: "Wechselrichter / Lader", key: "inverter", schema: [
      VRM_F("name", { text: {} }, "Name"), VRM_F("state", S, "Systemzustand"),
      VRM_F("dc_voltage", S, "DC-Spannung"), VRM_F("dc_current", S, "DC-Strom"), VRM_F("dc_power", S, "DC-Leistung (+ = Laden)")] },
    { id: "battery", title: "Batterie", key: "battery", schema: [
      VRM_F("soc", S, "Ladestand"), VRM_F("power", S, "Leistung"), VRM_F("voltage", S, "Spannung"), VRM_F("current", S, "Strom"),
      VRM_F("temperature", S, "Temperatur"), VRM_F("state", S, "Zustand"), VRM_F("ess_state", S, "ESS-Zustand"), VRM_F("ess_name", { text: {} }, "ESS-Bezeichnung")] },
    { id: "pv_inverters", title: "PV-Wechselrichter (AC)", list: "pv_inverters", item: "PV-Wechselrichter", schema: [
      VRM_F("name", { text: {} }, "Name"), VRM_F("power", S, "Leistung"), VRM_F("phases", VRM_ENTS(S), "Leistung je Phase (optional)")] },
    { id: "solar_chargers", title: "PV-Laderegler (MPPT)", list: "solar_chargers", item: "Laderegler", schema: [
      VRM_F("name", { text: {} }, "Name"), VRM_F("power", S, "Leistung"), VRM_F("voltage", S, "PV-Spannung"), VRM_F("current", S, "PV-Strom")] },
    { id: "battery_monitors", title: "Batteriewächter", list: "battery_monitors", item: "Batteriewächter", schema: [
      VRM_F("name", { text: {} }, "Name"), VRM_F("soc", S, "Ladestand"), VRM_F("voltage", S, "Spannung"), VRM_F("current", S, "Strom"),
      VRM_F("power", S, "Leistung"), VRM_F("time_to_go", S, "Restlaufzeit")] },
    { id: "energy", title: "Energiezähler (Diagramm)", key: "energy", schema: [
      VRM_F("grid_import", S, "Netzbezug"), VRM_F("grid_export", S, "Einspeisung"), VRM_F("solar", VRM_ENTS(S), "Solarzähler (werden addiert)"),
      VRM_F("battery_charge", S, "Batterie geladen"), VRM_F("battery_discharge", S, "Batterie entladen"),
      VRM_F("consumption_power", VRM_ENTS(S), "Verbrauchsleistung (W, werden addiert)"),
      VRM_F("exclude_from_baseload", VRM_ENTS(S), "Nicht zur Grundlast (z. B. Wallbox, Wärmepumpe)"),
      VRM_F("solar_reference", S, "Solar-Ersatzzähler (optional)"), VRM_F("solar_today", S, "Solar heute (optional)")] },
    { id: "forecast", title: "Prognosen", key: "forecast", schema: [
      VRM_F("name", { text: {} }, "Name der Prognose (z. B. VRM)"),
      { type: "expandable", name: "consumption", title: "Verbrauchsprognose (kWh)", schema: [
        VRM_F("yesterday", S, "Gestern"), VRM_F("today", S, "Heute"), VRM_F("tomorrow", S, "Morgen"), VRM_F("current_hour", S, "Aktuelle Stunde"), VRM_F("next_hour", S, "Nächste Stunde")] },
      { type: "expandable", name: "solar", title: "Solarprognose (kWh)", schema: [
        VRM_F("yesterday", S, "Gestern"), VRM_F("today", S, "Heute"), VRM_F("tomorrow", S, "Morgen"), VRM_F("current_hour", S, "Aktuelle Stunde")] },
      VRM_F("hourly", S, "Stundenprognose (Attribut hours)"), VRM_F("archive", S, "Prognose-Archiv"),
      VRM_F("irradiance", S, "Einstrahlungsprognose (DWD)"), VRM_F("use_energy_dashboard", { boolean: {} }, "Solarprognose des Energie-Dashboards nutzen")] },
  ];
}

// Remove empty values so the YAML stays short
function vrmClean(v) {
  if (Array.isArray(v)) {   // list items that are objects stay (a freshly added device is still empty)
    const a = v.map((x) => { const c = vrmClean(x); return c === undefined && x && typeof x === "object" ? {} : c; }).filter((x) => x !== undefined);
    return a.length ? a : undefined;
  }
  if (v && typeof v === "object") {
    const o = {};
    for (const [k, x] of Object.entries(v)) { const c = vrmClean(x); if (c !== undefined) o[k] = c; }
    return Object.keys(o).length ? o : undefined;
  }
  return v === "" || v == null ? undefined : v;
}

// ---- Victron GX integration: unique id = <portal id>_<service>_<instance>_<value>
async function vrmDetectVictronGx(hass) {
  const reg = await hass.callWS({ type: "config/entity_registry/list" });
  const re = /^(.+?)_(system|grid|pvinverter|solarcharger|vebus|battery)_(\d+)_(.+)$/;
  const groups = {};
  for (const r of reg) {
    if (r.platform !== "victron_gx" || r.disabled_by || !r.unique_id) continue;
    const m = String(r.unique_id).match(re);
    if (!m) continue;
    const g = groups[`${m[2]}_${m[3]}`] = groups[`${m[2]}_${m[3]}`] || { svc: m[2], inst: Number(m[3]), dev: r.device_id, k: {} };
    g.k[m[4]] = r.entity_id;
  }
  const list = (svc) => Object.values(groups).filter((g) => g.svc === svc).sort((a, b) => a.inst - b.inst);
  const devName = (g, def) => {
    const d = hass.devices && g.dev ? hass.devices[g.dev] : null;
    return ((d && (d.name_by_user || d.name)) || def).replace(/\s*\(ID: \d+\)\s*$/, "");
  };
  const sys = (list("system")[0] || { k: {} }).k;
  const cfg = {};
  const L3 = [1, 2, 3];
  // grid: energy meter, otherwise system values
  const gm = list("grid")[0];
  if (gm) {
    cfg.grid = { power: gm.k.grid_power, phases: L3.filter((n) => gm.k[`grid_power_l${n}`]).map((n) => ({ voltage: gm.k[`grid_voltage_l${n}`], current: gm.k[`grid_current_l${n}`], power: gm.k[`grid_power_l${n}`] })) };
  }
  const s = (k) => sys[`system_${k}`] || sys[k];
  if (!gm && s("grid_power_l1")) cfg.grid = { phases: L3.filter((n) => s(`grid_power_l${n}`)).map((n) => ({ power: s(`grid_power_l${n}`) })) };
  const loadPh = L3.map((n) => s(`ac_loads_l${n}`)).filter(Boolean);
  if (loadPh.length) cfg.ac_loads = { phases: loadPh.map((p) => ({ power: p })) };
  const vb = list("vebus")[0];
  if (vb || s("state")) {
    cfg.inverter = { name: vb ? devName(vb, "MultiPlus") : undefined, state: s("state"),
      dc_voltage: vb && vb.k.vebus_inverter_dc_voltage, dc_current: vb && vb.k.vebus_inverter_dc_current, dc_power: vb && vb.k.vebus_inverter_dc_power };
  }
  if (s("dc_battery_soc")) {
    cfg.battery = { soc: s("dc_battery_soc"), power: s("dc_battery_power"), voltage: s("dc_battery_voltage"), current: s("dc_battery_current"),
      state: s("dc_battery_state"), temperature: (vb && vb.k.vebus_inverter_dc_temperature) || s("dc_battery_temperature"),
      ess_state: s("ess_batterylife_state_sensor") };
  }
  const pv = list("pvinverter").map((g) => ({ name: devName(g, "PV-Wechselrichter"), power: g.k.pvinverter_power_total,
    phases: L3.map((n) => g.k[`pvinverter_power_l${n}`]).filter(Boolean) }));
  if (pv.length) cfg.pv_inverters = pv;
  const mp = list("solarcharger").map((g) => ({ name: devName(g, "MPPT"), power: g.k.solarcharger_yield_power, voltage: g.k.solarcharger_voltage, current: g.k.solarcharger_pv_current }));
  if (mp.length) cfg.solar_chargers = mp;
  const bm = list("battery").map((g) => ({ name: devName(g, "Batterie"), soc: g.k.battery_soc, voltage: g.k.battery_voltage, current: g.k.battery_current,
    power: g.k.battery_power, time_to_go: g.k.battery_time_to_go }));
  if (bm.length) cfg.battery_monitors = bm;
  cfg.energy = {
    grid_import: gm && gm.k.grid_energy_forward, grid_export: gm && gm.k.grid_energy_reverse,
    solar: list("pvinverter").map((g) => g.k.pvinverter_yield_total).concat(list("solarcharger").map((g) => g.k.solarcharger_yield_total)).filter(Boolean),
    battery_charge: s("dc_battery_charge_energy"), battery_discharge: s("dc_battery_discharge_energy"),
    consumption_power: loadPh.length ? loadPh : undefined,
  };
  const found = Object.keys(groups).length;
  return { cfg: vrmClean(cfg) || {}, found };
}

// ---- VRM Forecast integration (custom component vrm_forecast): unique id = <site id>_<key>
async function vrmDetectVrmForecast(hass) {
  const reg = await hass.callWS({ type: "config/entity_registry/list" });
  const k = {};
  for (const r of reg) {
    if (r.platform !== "vrm_forecast" || r.disabled_by || !r.unique_id) continue;
    k[String(r.unique_id).replace(/^\d+_/, "")] = r.entity_id;
  }
  if (!Object.keys(k).length) return null;
  return vrmClean({ name: "VRM",
    consumption: { today: k.consumption_today, tomorrow: k.consumption_tomorrow, current_hour: k.consumption_current_hour, next_hour: k.consumption_next_hour },
    solar: { today: k.solar_today, tomorrow: k.solar_tomorrow, current_hour: k.solar_current_hour },
    hourly: k.hourly });
}

class VrmCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = JSON.parse(JSON.stringify(config || {}));
    if (!this._built) this._render(); else this._update();
  }
  set hass(hass) {
    this._hass = hass;
    vrmSetLang(hass, this._config);
    if (!this._loaded) { this._loaded = true; this._loadHaElements(); }
    if (!this._built) this._render(); else this._update();
  }
  // HA loads its form elements lazily: let a built-in card editor load them
  async _loadHaElements() {
    try {
      if (!customElements.get("ha-form") && window.loadCardHelpers) {
        const helpers = await window.loadCardHelpers();
        const c = await helpers.createCardElement({ type: "entities", entities: [] });
        if (c && c.constructor && c.constructor.getConfigElement) await c.constructor.getConfigElement();
      }
    } catch (err) { /* form elements stay unavailable */ }
    this._built = false; this._render();
  }

  _changed() {
    const cfg = vrmClean(this._config) || {};
    if (this._config.type) cfg.type = this._config.type;
    const ev = new Event("config-changed", { bubbles: true, composed: true });
    ev.detail = { config: cfg };
    this.dispatchEvent(ev);
  }

  _css() {
    return `<style>
      :host { display:block; }
      .tools { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px; align-items:center; }
      .tools .msg { font-size:13px; color:var(--secondary-text-color); }
      button.b { font:inherit; font-size:13px; padding:7px 12px; border-radius:6px; border:1px solid var(--primary-color); background:var(--primary-color); color:var(--text-primary-color, #fff); cursor:pointer; }
      button.b.flat { background:transparent; color:var(--primary-color); }
      button.x { font:inherit; font-size:12px; padding:3px 8px; border-radius:6px; border:1px solid var(--divider-color); background:transparent; color:var(--secondary-text-color); cursor:pointer; }
      details { border:1px solid var(--divider-color); border-radius:8px; margin-bottom:8px; background:var(--card-background-color); }
      summary { padding:10px 12px; cursor:pointer; font-weight:500; list-style:none; display:flex; align-items:center; gap:8px; }
      summary::-webkit-details-marker { display:none; }
      summary .n { margin-left:auto; font-weight:400; font-size:12px; color:var(--secondary-text-color); }
      .body { padding:4px 12px 12px; }
      .item { border:1px dashed var(--divider-color); border-radius:8px; padding:8px 10px; margin:8px 0; }
      .item .h { display:flex; align-items:center; margin-bottom:4px; font-size:13px; color:var(--secondary-text-color); }
      .item .h button { margin-left:auto; }
      .sub { margin-top:8px; font-size:13px; font-weight:500; }
      .fb input, .fb select { width:100%; box-sizing:border-box; margin:2px 0 8px; padding:6px; }
      .fb label { font-size:12px; color:var(--secondary-text-color); }
    </style>`;
  }

  _render() {
    if (!this._config) return;
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    const isDash = this._config.type === "custom:vrm-dashboard-card";
    const isCmp = this._config.type === "custom:vrm-compare-card";
    root.innerHTML = `${this._css()}
      <div class="tools">
        <button class="b" id="gx">${L_("Victron GX automatisch erkennen")}</button>
        <button class="b flat" id="fc">${L_("VRM-Prognose-Integration erkennen")}</button>
        <span class="msg" id="msg">${vrmEsc(this._msg || "")}</span>
      </div>
      ${isDash ? `<details open><summary>${L_("Karten")}</summary><div class="body" data-form="cards"></div></details>` : ""}
      ${isCmp ? `<details open><summary>${L_("Vergleich")}</summary><div class="body" data-form="metric"></div></details>` : ""}
      ${vrmEditorSections().map((s) => `<details data-sec="${s.id}"${s.id === "general" ? " open" : ""}><summary>${L_(s.title)}<span class="n" data-n="${s.id}"></span></summary><div class="body" data-body="${s.id}"></div></details>`).join("")}`;
    root.getElementById("gx").addEventListener("click", () => this._autoGx());
    root.getElementById("fc").addEventListener("click", () => this._autoFc());
    this._built = true;
    this._update(true);
  }

  // one form (ha-form if available, otherwise simple inputs)
  _form(host, schema, data, onChange) {
    let f = host.__form;
    const ha = !!customElements.get("ha-form");
    if (!f || f.__ha !== ha) {
      host.innerHTML = "";
      f = ha ? document.createElement("ha-form") : document.createElement("div");
      f.__ha = ha;
      host.appendChild(f);
      host.__form = f;
      if (ha) {
        f.computeLabel = (s) => L_(s.label || s.title || s.name);
        f.addEventListener("value-changed", (ev) => { ev.stopPropagation(); f.__cb(ev.detail.value); });
      }
    }
    f.__cb = onChange;
    if (ha) {
      f.hass = this._hass; f.schema = schema; f.data = data || {};
    } else {
      // fallback without HA elements (should not happen inside Home Assistant)
      f.className = "fb";
      f.innerHTML = schema.filter((s) => !s.type).map((s) => {
        const v = (data || {})[s.name];
        const val = Array.isArray(v) ? v.join(", ") : v == null ? "" : v;
        return `<label>${L_(s.label || s.name)}</label><input data-k="${s.name}" value="${vrmEsc(val)}">`;
      }).join("");
      f.querySelectorAll("input").forEach((inp) => inp.addEventListener("change", () => {
        const d = Object.assign({}, data || {});
        const s = schema.find((x) => x.name === inp.dataset.k);
        d[inp.dataset.k] = s && s.selector && s.selector.entity && s.selector.entity.multiple ? inp.value.split(",").map((x) => x.trim()).filter(Boolean) : inp.value;
        f.__cb(d);
      }));
    }
  }

  _update() {
    const root = this.shadowRoot;
    if (!root || !this._config) return;
    const c = this._config;
    const cardsHost = root.querySelector('[data-form="cards"]');
    if (cardsHost) {
      const opts = [["overview", "Übersicht"], ["chart", "Diagramm"], ["solar_compare", "Solarprognose-Vergleich"], ["baseload_compare", "Grundlast-Vergleich"]];
      this._form(cardsHost, [{ name: "cards", label: "Karten", selector: { select: { multiple: true, mode: "list", options: opts.map(([v, l]) => ({ value: v, label: L_(l) })) } } }],
        { cards: c.cards || ["overview", "chart", "solar_compare", "baseload_compare"] }, (v) => { c.cards = v.cards; this._changed(); });
    }
    const metricHost = root.querySelector('[data-form="metric"]');
    if (metricHost) {
      this._form(metricHost, [{ name: "metric", label: "Vergleich", selector: { select: { mode: "dropdown", options: [{ value: "solar", label: L_("Solarprognose") }, { value: "baseload", label: L_("Grundlastprognose") }] } } }],
        { metric: c.metric || "baseload" }, (v) => { c.metric = v.metric; this._changed(); });
    }
    for (const s of vrmEditorSections()) {
      const body = root.querySelector(`[data-body="${s.id}"]`);
      if (!body) continue;
      const cnt = root.querySelector(`[data-n="${s.id}"]`);
      if (s.list) {
        const items = Array.isArray(c[s.list]) ? c[s.list] : (c[s.list] ? [c[s.list]] : []);
        if (cnt) cnt.textContent = items.length ? String(items.length) : "";
        this._listUi(body, items, s.schema, s.item, (arr) => { c[s.list] = arr; this._changed(); });
        continue;
      }
      const data = s.key ? Object.assign({}, c[s.key] || {}) : c;
      if (s.sub) delete data[s.sub.key];
      if (cnt) cnt.textContent = s.key && c[s.key] && Object.keys(c[s.key]).length ? "✓" : "";
      let fh = body.querySelector(":scope > .f");
      if (!fh) { fh = document.createElement("div"); fh.className = "f"; body.appendChild(fh); }
      this._form(fh, s.schema, data, (v) => {
        if (s.key) {
          const keep = s.sub && c[s.key] ? c[s.key][s.sub.key] : undefined;
          c[s.key] = Object.assign({}, v);
          if (keep !== undefined) c[s.key][s.sub.key] = keep;
        } else {
          for (const f of s.schema) if (f.name) c[f.name] = v[f.name];
        }
        this._changed();
      });
      if (s.sub) {
        let sh = body.querySelector(":scope > .sublist");
        if (!sh) { sh = document.createElement("div"); sh.className = "sublist"; body.appendChild(sh); }
        const raw = c[s.key] && c[s.key][s.sub.key];
        const items = (Array.isArray(raw) ? raw : raw ? [raw] : []).map((p) => (typeof p === "string" ? { power: p } : p));
        this._listUi(sh, items, s.sub.schema, s.sub.item, (arr) => { c[s.key] = Object.assign({}, c[s.key] || {}, { [s.sub.key]: arr }); this._changed(); }, s.sub.max, s.sub.title);
      }
    }
  }

  _listUi(host, items, schema, itemName, onChange, max, title) {
    const sig = `${items.length}`;
    if (host.__sig !== sig) {
      host.innerHTML = `${title ? `<div class="sub">${L_(title)}</div>` : ""}${items.map((_, i) => `<div class="item" data-i="${i}"><div class="h">${L_(itemName)} ${i + 1}<button class="x" data-rm="${i}">${L_("Entfernen")}</button></div><div class="f"></div></div>`).join("")}
        ${!max || items.length < max ? `<button class="b flat" data-add="1">+ ${L_(itemName)}</button>` : ""}`;
      host.__sig = sig;
      host.querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", () => { const a = host.__items.slice(); a.splice(Number(b.dataset.rm), 1); host.__cb(a); this._update(); }));
      const add = host.querySelector("[data-add]");
      if (add) add.addEventListener("click", () => { host.__cb(host.__items.concat([{}])); this._update(); });
    }
    host.__items = items; host.__cb = onChange;
    items.forEach((it, i) => {
      const fh = host.querySelector(`.item[data-i="${i}"] .f`);
      this._form(fh, schema, it, (v) => { const a = host.__items.slice(); a[i] = v; host.__cb(a); });
    });
  }

  async _autoGx() {
    const msg = this.shadowRoot.getElementById("msg");
    msg.textContent = L_("Suche …");
    try {
      const { cfg, found } = await vrmDetectVictronGx(this._hass);
      if (!found) { msg.textContent = L_("Keine Geräte der Victron-GX-Integration gefunden."); return; }
      const c = this._config;
      for (const k of ["grid", "ac_loads", "inverter", "battery", "pv_inverters", "solar_chargers", "battery_monitors"]) if (cfg[k]) c[k] = cfg[k];
      if (cfg.energy) c.energy = Object.assign({}, c.energy || {}, cfg.energy);
      if (!c.weather) { const w = Object.keys(this._hass.states).find((id) => id.startsWith("weather.")); if (w) c.weather = w; }
      this._msg = L_("{n} Geräte übernommen – bitte prüfen.", { n: found });
      this._built = false; this._render(); this._changed();
    } catch (err) { msg.textContent = `${L_("Fehler")}: ${err && err.message ? err.message : err}`; }
  }

  async _autoFc() {
    const msg = this.shadowRoot.getElementById("msg");
    try {
      const fc = await vrmDetectVrmForecast(this._hass);
      if (!fc) { msg.textContent = L_("Integration „VRM goes HA“ nicht gefunden."); return; }
      this._config.forecast = Object.assign({}, this._config.forecast || {}, fc);
      this._msg = L_("Prognose-Sensoren übernommen.");
      this._built = false; this._render(); this._changed();
    } catch (err) { msg.textContent = `${L_("Fehler")}: ${err && err.message ? err.message : err}`; }
  }
}
customElements.get("vrm-card-editor") || customElements.define("vrm-card-editor", VrmCardEditor);

// ---------------------------------------------------------------- All-in-one card
// One configuration for all cards: overview, day chart and the two forecast comparisons.
class VrmDashboardCard extends HTMLElement {
  setConfig(config) {
    this._config = config || {};
    const c = vrmNormalize(this._config);
    const def = ["overview", "chart"];
    if (c.e.e_solar_parts.length || c.e.e_solar) def.push("solar_compare");
    if (c.e.fc_hours) def.push("baseload_compare");
    const list = Array.isArray(this._config.cards) && this._config.cards.length ? this._config.cards : def;
    const map = { overview: ["vrm-overview-card", {}], chart: ["vrm-chart-card", {}], solar_compare: ["vrm-compare-card", { metric: "solar" }], baseload_compare: ["vrm-compare-card", { metric: "baseload" }] };
    const base = Object.assign({}, this._config);
    delete base.cards; delete base.type;
    this.innerHTML = "";
    this.style.display = "flex";
    this.style.flexDirection = "column";
    this.style.gap = `${this._config.gap != null ? this._config.gap : 8}px`;
    this._kids = list.filter((k) => map[k]).map((k) => {
      const el = document.createElement(map[k][0]);
      el.setConfig(Object.assign({}, base, map[k][1]));
      this.appendChild(el);
      return el;
    });
    if (this._hass) this._kids.forEach((k) => { k.hass = this._hass; });
  }
  set hass(hass) { this._hass = hass; (this._kids || []).forEach((k) => { k.hass = hass; }); }
  static getStubConfig() { return vrmStubConfig(); }
  static getConfigElement() { return document.createElement("vrm-card-editor"); }
  getCardSize() { return 40; }
  getGridOptions() { return { columns: "full", rows: "auto" }; }
}

class VrmCompareCard extends VrmBaseCompareCard {}

const vrmDefine = (name, cls) => { if (!customElements.get(name)) customElements.define(name, cls); };
vrmDefine("vrm-overview-card", VrmOverviewCard);
vrmDefine("vrm-chart-card", VrmChartCard);
vrmDefine("vrm-compare-card", VrmCompareCard);
vrmDefine("vrm-base-compare-card", VrmBaseCompareCard);   // old name, still works
vrmDefine("vrm-dashboard-card", VrmDashboardCard);

window.customCards = window.customCards || [];
// skip if the bundle is loaded twice (integration + manual resource), so the card picker shows no duplicates
if (!window.customCards.some((c) => c.type === "vrm-dashboard-card")) window.customCards.push(
  { type: "vrm-dashboard-card", name: "VRM Style – Dashboard", description: "All VRM style cards with one configuration", documentationURL: "https://github.com/Xander2980/vrm-goes-ha" },
  { type: "vrm-overview-card", name: "VRM Style – Overview", description: "Energy flow overview like the Victron VRM portal" },
  { type: "vrm-chart-card", name: "VRM Style – Chart", description: "Consumption / solar / battery chart with forecasts and time range picker" },
  { type: "vrm-compare-card", name: "VRM Style – Forecast comparison", description: "Own forecast vs. VRM forecast vs. actual (metric: solar | baseload)" },
);
console.info(`%c VRM-STYLE-CARDS %c ${VRM_VERSION} `, "color:#fff;background:#3b84cc;font-weight:600", "color:#3b84cc;background:#fff");
