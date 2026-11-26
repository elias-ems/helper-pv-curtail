# Set up PV curtailment with HA-MCP

**Prerequisite** — [Community HA-MCP](https://homeassistant-ai.github.io/ha-mcp/tools/) is already connected to the Home Assistant installation running Elias-ems PV Curtailment.

If the app is new to your Home Assistant installation, use the [installation steps](../README.md#install) to add the repository, install the app, and start it.

In the app, keep **Enable PV curtailment** off until you've tested the inverter automation.

## Supported commands

| What you want to do | HA-MCP command | What it returns or changes |
| --- | --- | --- |
| Find the installed app slug | `ha_get_app` with `source: "installed"` | The installed apps and their slugs. |
| Read saved settings | `ha_manage_app` · `GET /api/v1/settings` | Saved settings without credentials, plus a revision. |
| Check PV setup | `ha_manage_app` · `GET /api/v1/onboarding/pv-curtailment` | Missing inputs, saved arrays, and each array's exact event name. |
| Preview an array | `ha_manage_app` · `POST /api/v1/onboarding/pv-curtailment/preview` | The proposed diff, automation, and preview token. Settings stay as they are. |
| Save the reviewed array | `ha_manage_app` · `POST /api/v1/onboarding/pv-curtailment/apply` | Saves the reviewed fields and returns the updated revision and array ID. New arrays start with curtailment off. |

## Stage an array

1. In the app's **Settings**, select a signed grid power sensor in watts, with positive values for import. Select **EPEX Predictor**, choose your bidding zone, and check that your export formula matches your tariff.
2. Gather your PV power sensor entity ID, the inverter's rated AC output in watts, and the entity or action that sets its generation limit. The example below uses a stepped inverter and a Home Assistant `number.*` entity that accepts 0–100%, with 100% releasing the limit. Choose a fixed percentage appropriate for your inverter in stepped mode. Omit `stepLimitPercent` in modulating mode.
3. Discover the app slug, read the current revision, then preview with your inverter values. Review the diff and automation before applying. For an existing array, include its `arrayId` in both requests and send only the fields you want to edit.

Replace `SLUG`, `REV`, and `TOKEN` with the values from app discovery, the settings read, and preview. Use the same inverter values for preview and apply.

```text
ha_get_app       {"source":"installed"}
ha_manage_app    {"slug":"SLUG","path":"/api/v1/settings","method":"GET"}
ha_manage_app    {"slug":"SLUG","path":"/api/v1/onboarding/pv-curtailment","method":"GET"}
ha_manage_app    {"slug":"SLUG","path":"/api/v1/onboarding/pv-curtailment/preview","method":"POST","body":{"revision":"REV","limitEntityId":"number.inverter_generation_limit","fields":{"title":"South roof","powerEntityId":"sensor.inverter_power","ratedPowerW":4000,"controlMode":"stepped","stepLimitPercent":25}}}
ha_manage_app    {"slug":"SLUG","path":"/api/v1/onboarding/pv-curtailment/apply","method":"POST","body":{"revision":"REV","previewToken":"TOKEN","limitEntityId":"number.inverter_generation_limit","fields":{"title":"South roof","powerEntityId":"sensor.inverter_power","ratedPowerW":4000,"controlMode":"stepped","stepLimitPercent":25}}}
ha_manage_app    {"slug":"SLUG","path":"/api/v1/onboarding/pv-curtailment","method":"GET"}
```

The final read confirms the saved array and its event name. If Apply returns HTTP 409 after a Settings change, read the latest revision and review a fresh preview. Apply saves the array in Elias-ems PV Curtailment. Create the Home Assistant automation in the next step.

## Connect the automation

1. In Home Assistant, open **Settings → Automations & scenes → Create automation → Create new automation**. Open the top-right menu and choose **Edit in YAML**. [Home Assistant automation editor](https://www.home-assistant.io/docs/automation/editor/)
2. Use the YAML below as a starting point. Replace the example `event_type` with the exact name from the app's onboarding response and replace the target with your inverter's limit entity. If the inverter needs a separate action to release its limit, handle `released: true` with that action. Save one automation per array.

```yaml
alias: South roof PV curtailment
initial_state: false
mode: queued
triggers:
  - trigger: event
    event_type: elias_ems_pv_curtail_south_roof_pv_limit
actions:
  - action: number.set_value
    target:
      entity_id: number.inverter_generation_limit
    data:
      value: "{{ 100 if trigger.event.data.released else trigger.event.data.limit_percent }}"
```

The event's `limit_percent` is the requested limit. `released: true` means the app is handing control back to the inverter. `initial_state: false` keeps the draft off at Home Assistant startup during setup.

## Verify and enable curtailment

1. Leave curtailment off in the app and enable the Home Assistant automation for a manual check. In **Settings → Tools → Events**, enter the same event name as in the automation. Choose a test limit your inverter supports, then fire a limit event. This sends a real inverter command. [Home Assistant automation testing](https://www.home-assistant.io/docs/automation/testing/)

   ```yaml
   released: false
   limit_percent: 25
   ```

2. Open the automation trace to confirm the event took the expected action. Check the applied limit on the inverter or its integration. Fire a release event using the same event name and confirm the inverter returns to unrestricted operation.

   ```yaml
   released: true
   limit_percent: 100
   ```

3. Remove `initial_state: false` from the finished automation, save it, and confirm it's enabled. Home Assistant will then restore its enabled state after restart. [Home Assistant automation initial state](https://www.home-assistant.io/docs/automation/yaml/#automation-initial-state)
4. In **Elias-ems PV Curtailment → Settings**, enable curtailment on the array and save it. Review the live readings and confirm the inverter checks in the **PV curtailment setup checklist**, then turn on **Enable PV curtailment** and save. When prices meet your strategy's conditions, check **Diagnostics** for the app's decision and event delivery, then confirm the corresponding Home Assistant trace and inverter limit.

## Verify the API on a test installation

Use a disposable Home Assistant OS instance with a mock PV power sensor and a mock 0–100% number entity such as `number.mock_inverter_limit`. Keep curtailment disabled. In Home Assistant's event listener, subscribe to `*` before running the calls above with your mock entity IDs. Check for zero `elias_ems_pv_curtail_*_pv_limit` events and zero `call_service` events targeting the mock inverter. Repeat the settings read between preview and apply to verify the revision and values stay the same. After apply, verify the array was saved with `curtailable: false`.

Use the returned array ID and the latest revision to test a partial update. After preview, save a distinct grid power entity in **Elias-ems PV Curtailment → Settings**, then apply the old request:

```text
ha_manage_app    {"slug":"SLUG","path":"/api/v1/onboarding/pv-curtailment/preview","method":"POST","body":{"arrayId":"ID","revision":"NEW_REV","limitEntityId":"number.mock_inverter_limit","fields":{"ratedPowerW":4200}}}
ha_manage_app    {"slug":"SLUG","path":"/api/v1/onboarding/pv-curtailment/apply","method":"POST","body":{"arrayId":"ID","revision":"NEW_REV","previewToken":"NEW_TOKEN","limitEntityId":"number.mock_inverter_limit","fields":{"ratedPowerW":4200}}}
ha_manage_app    {"slug":"SLUG","path":"/api/v1/settings","method":"GET"}
```

Expect HTTP 409 from apply, the new grid sensor, and the original 4000 W rating. Preview again after any Settings change or app restart. For local verification, run `npm run test:integration` from `addon/`. The onboarding test checks the mock Home Assistant event log for zero commands.
