"""Fetches the VRM forecast regularly."""
from __future__ import annotations

from datetime import timedelta
import logging
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryAuthFailed
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
from homeassistant.util import dt as dt_util

from .api import VrmApi, VrmAuthError, VrmConnectionError
from .const import CONF_API_TOKEN, CONF_SCAN_INTERVAL, CONF_SITE_ID, DEFAULT_SCAN_INTERVAL, DOMAIN
from .parser import parse_forecast

_LOGGER = logging.getLogger(__name__)


class VrmForecastCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    """Hourly forecast for today and tomorrow."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        minutes = entry.options.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL)
        super().__init__(
            hass, _LOGGER, name=f"{DOMAIN}_{entry.data[CONF_SITE_ID]}",
            update_interval=timedelta(minutes=minutes), config_entry=entry,
        )
        self.site_id = int(entry.data[CONF_SITE_ID])
        self.api = VrmApi(async_get_clientsession(hass), entry.data[CONF_API_TOKEN])

    async def _async_update_data(self) -> dict[str, Any]:
        today = dt_util.start_of_local_day()
        start = int(today.timestamp())
        end = int((today + timedelta(days=2)).timestamp()) - 1   # end of tomorrow
        try:
            records = await self.api.async_get_dess_stats(self.site_id, start, end)
        except VrmAuthError as err:
            raise ConfigEntryAuthFailed("VRM token is not valid any more") from err
        except VrmConnectionError as err:
            raise UpdateFailed(f"VRM not reachable: {err}") from err
        data = parse_forecast(records)
        data["fields"] = sorted(records)
        data["today_ms"] = start * 1000
        return data
