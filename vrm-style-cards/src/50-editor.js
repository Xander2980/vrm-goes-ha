
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
      if (!fc) { msg.textContent = L_("Integration „VRM Forecast“ nicht gefunden."); return; }
      this._config.forecast = Object.assign({}, this._config.forecast || {}, fc);
      this._msg = L_("Prognose-Sensoren übernommen.");
      this._built = false; this._render(); this._changed();
    } catch (err) { msg.textContent = `${L_("Fehler")}: ${err && err.message ? err.message : err}`; }
  }
}
customElements.get("vrm-card-editor") || customElements.define("vrm-card-editor", VrmCardEditor);
