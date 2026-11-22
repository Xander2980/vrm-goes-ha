"""Setup in the UI: access token → choose installation."""
from __future__ import annotations

from collections.abc import Mapping
from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.core import callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.selector import (
    NumberSelector, NumberSelectorConfig, NumberSelectorMode,
    SelectOptionDict, SelectSelector, SelectSelectorConfig, SelectSelectorMode,
    TextSelector, TextSelectorConfig, TextSelectorType,
)

from .api import VrmApi, VrmAuthError, VrmConnectionError
from .const import (
    CONF_API_TOKEN, CONF_SCAN_INTERVAL, CONF_SITE_ID, CONF_SITE_NAME,
    DEFAULT_SCAN_INTERVAL, DOMAIN, MAX_SCAN_INTERVAL, MIN_SCAN_INTERVAL, TOKENS_URL,
)

TOKEN_SCHEMA = vol.Schema({
    vol.Required(CONF_API_TOKEN): TextSelector(TextSelectorConfig(type=TextSelectorType.PASSWORD)),
})


class VrmForecastConfigFlow(ConfigFlow, domain=DOMAIN):
    """Config flow for VRM Forecast."""

    VERSION = 1

    def __init__(self) -> None:
        self._token: str | None = None
        self._sites: dict[str, str] = {}

    async def _check_token(self, token: str) -> tuple[dict[str, str], str | None]:
        api = VrmApi(async_get_clientsession(self.hass), token)
        try:
            user_id = await api.async_get_user_id()
            sites = await api.async_get_installations(user_id)
        except VrmAuthError:
            return {}, "invalid_auth"
        except VrmConnectionError:
            return {}, "cannot_connect"
        if not sites:
            return {}, "no_sites"
        return {str(s["idSite"]): str(s.get("name") or s["idSite"]) for s in sites}, None

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """Step 1: access token."""
        errors: dict[str, str] = {}
        if user_input is not None:
            sites, error = await self._check_token(user_input[CONF_API_TOKEN])
            if error:
                errors["base"] = error
            else:
                self._token = user_input[CONF_API_TOKEN].strip()
                self._sites = sites
                return await self.async_step_site()
        return self.async_show_form(
            step_id="user", data_schema=TOKEN_SCHEMA, errors=errors,
            description_placeholders={"tokens_url": TOKENS_URL},
        )

    async def async_step_site(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """Step 2: choose the installation."""
        if user_input is not None:
            site_id = user_input[CONF_SITE_ID]
            await self.async_set_unique_id(site_id)
            self._abort_if_unique_id_configured()
            name = self._sites.get(site_id, site_id)
            return self.async_create_entry(
                title=name, data={CONF_API_TOKEN: self._token, CONF_SITE_ID: int(site_id), CONF_SITE_NAME: name},
            )
        options = [SelectOptionDict(value=k, label=f"{v} ({k})") for k, v in self._sites.items()]
        return self.async_show_form(
            step_id="site",
            data_schema=vol.Schema({vol.Required(CONF_SITE_ID): SelectSelector(
                SelectSelectorConfig(options=options, mode=SelectSelectorMode.LIST))}),
        )

    async def async_step_reauth(self, entry_data: Mapping[str, Any]) -> ConfigFlowResult:
        """Token was revoked: ask for a new one."""
        return await self.async_step_reauth_confirm()

    async def async_step_reauth_confirm(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        entry = self._get_reauth_entry()
        if user_input is not None:
            sites, error = await self._check_token(user_input[CONF_API_TOKEN])
            if error:
                errors["base"] = error
            elif str(entry.data[CONF_SITE_ID]) not in sites:
                errors["base"] = "site_missing"
            else:
                return self.async_update_reload_and_abort(
                    entry, data_updates={CONF_API_TOKEN: user_input[CONF_API_TOKEN].strip()})
        return self.async_show_form(step_id="reauth_confirm", data_schema=TOKEN_SCHEMA, errors=errors)

    async def async_step_reconfigure(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """Change the access token (Settings → Devices & services → VRM goes HA → ⋮ → Reconfigure)."""
        errors: dict[str, str] = {}
        entry = self._get_reconfigure_entry()
        if user_input is not None:
            sites, error = await self._check_token(user_input[CONF_API_TOKEN])
            if error:
                errors["base"] = error
            elif str(entry.data[CONF_SITE_ID]) not in sites:
                errors["base"] = "site_missing"
            else:
                return self.async_update_reload_and_abort(
                    entry, data_updates={CONF_API_TOKEN: user_input[CONF_API_TOKEN].strip()})
        return self.async_show_form(
            step_id="reconfigure", data_schema=TOKEN_SCHEMA, errors=errors,
            description_placeholders={"tokens_url": TOKENS_URL},
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return VrmForecastOptionsFlow()


class VrmForecastOptionsFlow(OptionsFlow):
    """Options: update interval."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(data={CONF_SCAN_INTERVAL: int(user_input[CONF_SCAN_INTERVAL])})
        current = self.config_entry.options.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL)
        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema({vol.Required(CONF_SCAN_INTERVAL, default=current): NumberSelector(
                NumberSelectorConfig(min=MIN_SCAN_INTERVAL, max=MAX_SCAN_INTERVAL, step=1, unit_of_measurement="min", mode=NumberSelectorMode.BOX))}),
        )
