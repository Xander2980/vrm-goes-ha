
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
