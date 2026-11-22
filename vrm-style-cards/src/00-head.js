/*!
 * VRM Style Cards for Home Assistant
 * Energy flow overview, day chart with forecasts and forecast comparison in the style of the
 * Victron VRM portal. Every device (grid phases, PV inverters, solar chargers, battery monitors,
 * energy counters, forecast sources) is configured in YAML – see README.md.
 *
 * Not affiliated with or endorsed by Victron Energy. "Victron" and "VRM" are trademarks of Victron Energy B.V.
 * License: MIT
 */
const VRM_VERSION = "1.0.0";

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
