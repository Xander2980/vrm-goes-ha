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

