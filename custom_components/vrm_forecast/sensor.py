"""Sensors of the VRM Forecast integration."""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from homeassistant.components.sensor import SensorEntity, SensorEntityDescription, SensorStateClass
from homeassistant.const import UnitOfEnergy
from homeassistant.core import HomeAssistant
from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.event import async_track_time_change
from homeassistant.helpers.update_coordinator import CoordinatorEntity
from homeassistant.util import dt as dt_util

from . import VrmForecastConfigEntry
from .const import CONF_SITE_NAME, DOMAIN
from .coordinator import VrmForecastCoordinator
from .parser import HOUR_MS, sum_between, value_at

DAY_MS = 24 * HOUR_MS


def _hour_now() -> int:
    now = dt_util.utcnow().timestamp() * 1000
    return int(now // HOUR_MS) * HOUR_MS


@dataclass(frozen=True, kw_only=True)
class VrmSensorDescription(SensorEntityDescription):
    value: Callable[[dict[str, Any]], float | None]


def _day(key: str, offset: int) -> Callable[[dict[str, Any]], float | None]:
    return lambda d: sum_between(d["hours"], key, d["today_ms"] + offset * DAY_MS, d["today_ms"] + (offset + 1) * DAY_MS)


def _hour(key: str, offset: int) -> Callable[[dict[str, Any]], float | None]:
    return lambda d: value_at(d["hours"], key, _hour_now() + offset * HOUR_MS)


SENSORS: tuple[VrmSensorDescription, ...] = (
    VrmSensorDescription(key="hourly", translation_key="hourly", icon="mdi:chart-bar", value=_day("consumption", 0)),
    VrmSensorDescription(key="consumption_today", translation_key="consumption_today", icon="mdi:home-lightning-bolt-outline", value=_day("consumption", 0)),
    VrmSensorDescription(key="consumption_tomorrow", translation_key="consumption_tomorrow", icon="mdi:home-lightning-bolt-outline", value=_day("consumption", 1)),
    VrmSensorDescription(key="baseload_today", translation_key="baseload_today", icon="mdi:home-clock-outline", value=_day("baseload", 0)),
    VrmSensorDescription(key="baseload_tomorrow", translation_key="baseload_tomorrow", icon="mdi:home-clock-outline", value=_day("baseload", 1)),
    VrmSensorDescription(key="solar_today", translation_key="solar_today", icon="mdi:solar-power", value=_day("solar", 0)),
    VrmSensorDescription(key="solar_tomorrow", translation_key="solar_tomorrow", icon="mdi:solar-power", value=_day("solar", 1)),
    VrmSensorDescription(key="consumption_current_hour", translation_key="consumption_current_hour", icon="mdi:clock-outline",
                         state_class=SensorStateClass.MEASUREMENT, value=_hour("consumption", 0)),
    VrmSensorDescription(key="consumption_next_hour", translation_key="consumption_next_hour", icon="mdi:clock-plus-outline",
                         state_class=SensorStateClass.MEASUREMENT, value=_hour("consumption", 1)),
    VrmSensorDescription(key="solar_current_hour", translation_key="solar_current_hour", icon="mdi:clock-outline",
                         state_class=SensorStateClass.MEASUREMENT, value=_hour("solar", 0)),
    VrmSensorDescription(key="solar_next_hour", translation_key="solar_next_hour", icon="mdi:clock-plus-outline",
                         state_class=SensorStateClass.MEASUREMENT, value=_hour("solar", 1)),
)


async def async_setup_entry(hass: HomeAssistant, entry: VrmForecastConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    coordinator = entry.runtime_data
    async_add_entities(VrmForecastSensor(coordinator, entry, d) for d in SENSORS)


class VrmForecastSensor(CoordinatorEntity[VrmForecastCoordinator], SensorEntity):
    """One forecast value."""

    _attr_has_entity_name = True
    _attr_native_unit_of_measurement = UnitOfEnergy.KILO_WATT_HOUR
    _attr_suggested_display_precision = 2
    _unrecorded_attributes = frozenset({"hours", "sources"})   # large list, only needed as current value
    entity_description: VrmSensorDescription

    def __init__(self, coordinator: VrmForecastCoordinator, entry: VrmForecastConfigEntry, description: VrmSensorDescription) -> None:
        super().__init__(coordinator)
        self.entity_description = description
        self._attr_unique_id = f"{coordinator.site_id}_{description.key}"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, str(coordinator.site_id))},
            name=f"VRM {entry.data.get(CONF_SITE_NAME, coordinator.site_id)}",
            manufacturer="Victron Energy (VRM portal)",
            model="Dynamic ESS forecast",
            entry_type=DeviceEntryType.SERVICE,
            configuration_url=f"https://vrm.victronenergy.com/installation/{coordinator.site_id}/dashboard",
        )

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        if "hour" in self.entity_description.key and self.entity_description.key != "hourly":
            # current / next hour changes at the full hour, not only when new data arrives
            self.async_on_remove(async_track_time_change(self.hass, self._hour_changed, minute=0, second=5))

    async def _hour_changed(self, _now) -> None:
        self.async_write_ha_state()

    @property
    def native_value(self) -> float | None:
        if not self.coordinator.data:
            return None
        return self.entity_description.value(self.coordinator.data)

    @property
    def extra_state_attributes(self) -> dict[str, Any] | None:
        if self.entity_description.key != "hourly" or not self.coordinator.data:
            return None
        d = self.coordinator.data
        return {"hours": d["hours"], "sources": d["sources"]}
