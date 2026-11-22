"""Config flow and sensors against a mocked VRM API (needs pytest-homeassistant-custom-component)."""
import pytest

pytest.importorskip("pytest_homeassistant_custom_component")

from homeassistant import config_entries  # noqa: E402
from homeassistant.data_entry_flow import FlowResultType  # noqa: E402
from homeassistant.util import dt as dt_util  # noqa: E402
from pytest_homeassistant_custom_component.common import MockConfigEntry  # noqa: E402

DOMAIN = "vrm_forecast"
API = "https://vrmapi.victronenergy.com/v2"
H = 3_600_000


def _mock_api(aioclient_mock, status=200):
    aioclient_mock.get(f"{API}/users/me", status=status, json={"success": True, "user": {"id": 42, "name": "Test"}})
    aioclient_mock.get(f"{API}/users/42/installations", json={"success": True, "records": [{"idSite": 123456, "name": "My house"}]})
    t0 = int(dt_util.start_of_local_day().timestamp() * 1000)
    aioclient_mock.get(f"{API}/installations/123456/stats", json={"success": True, "records": {
        "vrm_consumption_fc": [[t0 + i * H, 500] for i in range(48)],
        "vrm_consum_evcs_fc": [[t0 + 2 * H, 200]],
        "solar_yield_forecast": [[t0 + i * H, 0.4 if 9 <= i % 24 <= 14 else 0] for i in range(48)],
    }})


async def test_config_flow(hass, aioclient_mock):
    _mock_api(aioclient_mock)
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    assert result["type"] is FlowResultType.FORM and result["step_id"] == "user"
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {"api_token": "Token abc"})
    assert result["type"] is FlowResultType.FORM and result["step_id"] == "site"
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {"site_id": "123456"})
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["title"] == "My house"
    assert result["data"] == {"api_token": "Token abc", "site_id": 123456, "site_name": "My house"}
    await hass.async_block_till_done()
    st = hass.states.get("sensor.vrm_my_house_hourly_forecast")
    assert st is not None, [s.entity_id for s in hass.states.async_all()]
    assert float(st.state) == 12.0                       # 24 × 0.5 kWh
    hours = st.attributes["hours"]
    assert len(hours) == 48 and hours[2]["baseload"] == 0.3
    assert float(hass.states.get("sensor.vrm_my_house_solar_tomorrow").state) == 2.4
    assert float(hass.states.get("sensor.vrm_my_house_base_load_today").state) == 11.8


async def test_invalid_token(hass, aioclient_mock):
    aioclient_mock.get(f"{API}/users/me", status=401)
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {"api_token": "wrong"})
    assert result["type"] is FlowResultType.FORM and result["errors"] == {"base": "invalid_auth"}


async def test_already_configured(hass, aioclient_mock):
    _mock_api(aioclient_mock)
    MockConfigEntry(domain=DOMAIN, unique_id="123456", data={"api_token": "x", "site_id": 123456}).add_to_hass(hass)
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {"api_token": "abc"})
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {"site_id": "123456"})
    assert result["type"] is FlowResultType.ABORT and result["reason"] == "already_configured"


async def test_options(hass, aioclient_mock):
    _mock_api(aioclient_mock)
    entry = MockConfigEntry(domain=DOMAIN, unique_id="123456", data={"api_token": "x", "site_id": 123456, "site_name": "My house"})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    result = await hass.config_entries.options.async_init(entry.entry_id)
    result = await hass.config_entries.options.async_configure(result["flow_id"], {"scan_interval": 30})
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert entry.options == {"scan_interval": 30}
