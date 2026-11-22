
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
