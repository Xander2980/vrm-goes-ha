"""VRM goes HA: VRM forecast sensors plus the VRM style dashboard cards."""
from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType
from homeassistant.loader import async_get_integration

from .const import DOMAIN, FRONTEND_URL
from .coordinator import VrmForecastCoordinator

_LOGGER = logging.getLogger(__name__)

PLATFORMS = [Platform.SENSOR]
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

type VrmForecastConfigEntry = ConfigEntry[VrmForecastCoordinator]


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Serve the card bundle and load it on every dashboard (no manual resource needed)."""
    if hass.http is None or "frontend" not in hass.config.components:
        _LOGGER.debug("frontend not loaded – VRM style cards are not registered")
        return True
    from homeassistant.components.frontend import add_extra_js_url
    from homeassistant.components.http import StaticPathConfig

    path = Path(__file__).parent / "frontend" / "vrm-style-cards.js"
    await hass.http.async_register_static_paths([StaticPathConfig(FRONTEND_URL, str(path), True)])
    version = (await async_get_integration(hass, DOMAIN)).version
    add_extra_js_url(hass, f"{FRONTEND_URL}?v={version}")
    return True


async def async_setup_entry(hass: HomeAssistant, entry: VrmForecastConfigEntry) -> bool:
    """Set up from a config entry."""
    coordinator = VrmForecastCoordinator(hass, entry)
    await coordinator.async_config_entry_first_refresh()
    entry.runtime_data = coordinator
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(_async_reload))
    return True


async def _async_reload(hass: HomeAssistant, entry: VrmForecastConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: VrmForecastConfigEntry) -> bool:
    """Unload a config entry."""
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
