import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import callback

from .const import CONF_Z2M_BASE_TOPIC, CONF_Z2M_ENABLED, DEFAULT_Z2M_BASE_TOPIC, DOMAIN, NAME


def _schema(defaults: dict) -> vol.Schema:
    return vol.Schema(
        {
            vol.Required(CONF_Z2M_ENABLED, default=defaults.get(CONF_Z2M_ENABLED, True)): bool,
            vol.Required(
                CONF_Z2M_BASE_TOPIC,
                default=defaults.get(CONF_Z2M_BASE_TOPIC, DEFAULT_Z2M_BASE_TOPIC),
            ): str,
        }
    )


class RoomScenesConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input=None):
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")
        if user_input is not None:
            return self.async_create_entry(title=NAME, data=user_input)
        return self.async_show_form(step_id="user", data_schema=_schema({}))

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        return RoomScenesOptionsFlow()


class RoomScenesOptionsFlow(config_entries.OptionsFlow):
    async def async_step_init(self, user_input=None):
        if user_input is not None:
            return self.async_create_entry(data=user_input)
        defaults = {**self.config_entry.data, **self.config_entry.options}
        return self.async_show_form(step_id="init", data_schema=_schema(defaults))
