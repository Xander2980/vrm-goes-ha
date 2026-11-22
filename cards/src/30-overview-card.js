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
      const pvH = 92 + Math.max(1, pvRows.length) * 28;   // header: two-line title + value
      const mH = 92 + Math.max(1, nM) * 65;
      L.boxes = {
        grid: [10, 62, 114, gPh ? 62 + gPh * 40 : 62], load: [140, 62, 114, lPh ? 62 + lPh * 28 : 62], pvinv: [10, 400, 114, pvH],
        bat: [140, 450, 114, has.bat ? 128 + this._batRows().length * 44 + (this._c.battery.ess_state ? 62 : 0) : 0], mppt: [269, 400, 114, mH],
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
  .big { font-size:21px; margin-top:6px; line-height:26px; white-space:nowrap; }
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
    <div class="top" style="height:92px"><div class="ttl" style="align-items:flex-start"><ha-icon icon="mdi:white-balance-sunny" style="color:#f0a030"></ha-icon><span>${L_("PV‑Wechsel&shy;richter")}</span></div>
      <div class="badge"><ha-icon icon="mdi:flash"></ha-icon></div>
      <div class="big" style="margin-top:4px"><span id="pvinv_p"></span> <span class="u">W</span></div></div>
    <div class="lower" style="height:${B.pvinv[3] - 92}px">
      ${pvRows.map((r, i) => `<div class="row"><span class="l${r.wide ? " wide" : ""}" title="${vrmEsc(r.l)}">${vrmEsc(r.l)}</span><b id="pw${i}"></b>&nbsp;W</div>`).join("")}
    </div></div>` : ""}
  ${has.bat ? `<div class="box" id="b_bat" style="${this._boxStyle(B.bat)}">
    <div class="top" style="height:128px"><div class="ttl"><ha-icon icon="mdi:battery-charging-outline" style="color:#3c87d6"></ha-icon><span id="bat_st"></span></div>
      <div class="sub"><span id="bat_p"></span> W</div>
      <div class="big"><span id="bat_soc"></span> <span class="u">%</span></div>
      ${bat.ess_state ? `<div class="ess">${vrmEsc(bat.ess_name || "ESS #1")} <ha-icon icon="mdi:chevron-up"></ha-icon></div>` : ""}</div>
    <div class="lower" style="height:${B.bat[3] - 128}px">
      ${this._batRows().map((r) => `<div class="kv"><div>${L_(r[0] === "Temperatur" ? "Temp." : r[0])}</div><div><b id="${r[1]}"></b> ${r[2]}</div></div>`).join("")}
      ${bat.ess_state ? `<div class="kv" style="height:62px"><div>${vrmEsc(bat.ess_name || "ESS #1")}</div><div><b id="ess"></b></div></div>` : ""}
    </div></div>` : ""}
  ${has.mppt ? `<div class="box" id="b_mppt" style="${this._boxStyle(B.mppt)}">
    <div class="top" style="height:92px"><div class="ttl" style="align-items:flex-start"><ha-icon icon="mdi:white-balance-sunny" style="color:#f0a030"></ha-icon><span>${L_("PV‑Lade&shy;gerät")}</span></div>
      <div class="big"><span id="mppt_p"></span> <span class="u">W</span></div></div>
    <div class="lower" style="height:${B.mppt[3] - 92}px">
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
