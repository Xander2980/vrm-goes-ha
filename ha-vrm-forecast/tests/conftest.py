"""Fixtures for Home Assistant tests (needs pytest-homeassistant-custom-component)."""
import pathlib

import pytest

try:
    import pytest_homeassistant_custom_component  # noqa: F401
except ImportError:  # parser tests only
    pass
else:
    import custom_components

    # the test plugin brings its own custom_components package – add ours to it
    _ours = str(pathlib.Path(__file__).resolve().parents[1] / "custom_components")
    if _ours not in list(custom_components.__path__):
        custom_components.__path__.append(_ours)

    @pytest.fixture(autouse=True)
    def auto_enable_custom_integrations(enable_custom_integrations):
        """Allow loading custom_components/vrm_forecast in the test Home Assistant."""
        yield
