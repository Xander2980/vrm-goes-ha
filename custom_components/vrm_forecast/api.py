"""Small client for the Victron VRM API (only what this integration needs)."""
from __future__ import annotations

from typing import Any

import aiohttp

from .const import API_BASE


class VrmAuthError(Exception):
    """Token invalid or revoked."""


class VrmConnectionError(Exception):
    """VRM not reachable or unexpected answer."""


class VrmApi:
    """VRM API v2 with an access token (VRM → Preferences → Integrations → Access tokens)."""

    def __init__(self, session: aiohttp.ClientSession, token: str) -> None:
        self._session = session
        token = token.strip()
        if token.lower().startswith("token "):
            token = token[6:].strip()
        self._token = token

    async def _get(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        headers = {"X-Authorization": f"Token {self._token}", "Accept": "application/json"}
        try:
            async with self._session.get(
                f"{API_BASE}{path}", params=params, headers=headers, timeout=aiohttp.ClientTimeout(total=30)
            ) as resp:
                if resp.status in (401, 403):
                    raise VrmAuthError(f"HTTP {resp.status}")
                if resp.status != 200:
                    raise VrmConnectionError(f"HTTP {resp.status}")
                data = await resp.json(content_type=None)
        except (aiohttp.ClientError, TimeoutError) as err:
            raise VrmConnectionError(str(err)) from err
        if not isinstance(data, dict) or data.get("success") is False:
            raise VrmConnectionError("unexpected answer")
        return data

    async def async_get_user_id(self) -> int:
        """Id of the user the token belongs to."""
        data = await self._get("/users/me")
        user = data.get("user") or {}
        if "id" not in user:
            raise VrmConnectionError("no user in answer")
        return int(user["id"])

    async def async_get_installations(self, user_id: int) -> list[dict[str, Any]]:
        """All installations (sites) of the user: [{idSite, name, ...}]."""
        data = await self._get(f"/users/{user_id}/installations")
        return [r for r in data.get("records") or [] if "idSite" in r]

    async def async_get_dess_stats(self, site_id: int, start: int, end: int) -> dict[str, Any]:
        """Hourly Dynamic ESS stats incl. the forecasts (start/end = unix seconds)."""
        data = await self._get(
            f"/installations/{site_id}/stats",
            {"type": "dynamic_ess", "interval": "hours", "start": start, "end": end},
        )
        records = data.get("records")
        return records if isinstance(records, dict) else {}
