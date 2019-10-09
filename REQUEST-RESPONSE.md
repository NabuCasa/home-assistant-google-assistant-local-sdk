# Requests and responses

These are the requests and responses we have received while integrating Home Assistant as a local hub device with Actions on Google.

For testing, do a zeroconf broadcast to start the IDENTIFY intent. Once you are able to reach REACHABLE_DEVICES interaction, you will need to restart the Google Assistant device between each try.

## SYNC response sent to Google

```json
{
  "payload": {
    "agentUserId": "6a04f0f7-6125-4356-a846-861df7e01497",
    "devices": [
      {
        "attributes": {
          "colorModel": "hsv",
          "colorTemperatureRange": {
            "temperatureMaxK": 6535,
            "temperatureMinK": 2000
          }
        },
        "customData": {
          "httpPort": 8123,
          "httpSSL": false,
          "proxyDeviceId": "6a04f0f7-6125-4356-a846-861df7e01497",
          "webhookId": "dde3b9800a905e886cc4d38e226a6e7e3f2a6993d2b9b9f63d13e42ee7de3219"
        },
        "id": "light.ceiling_lights",
        "name": { "name": "Ceiling Lights" },
        "otherDeviceIds": [{ "deviceId": "light.ceiling_lights" }],
        "traits": [
          "action.devices.traits.Brightness",
          "action.devices.traits.OnOff",
          "action.devices.traits.ColorSetting"
        ],
        "type": "action.devices.types.LIGHT",
        "willReportState": true
      }
    ]
  },
  "requestId": "5429789129851561898"
}
```

- For our implementation, `customData` contains info to reach Home Assistant and it contains the device ID of the hub.
- `otherDeviceIds` is set to the device ID of the Home Assistant instance as [per the docs](https://developers.google.com/assistant/smarthome/reference/rest/v1/devices/sync#Device.FIELDS.other_device_ids). This device is not part of the normal SYNC response but will be identified during the IDENTIFY intent.

## IDENTIFY intent received from Google

```json
{
  "requestId": "85205A56584454F8507E07639014A008",
  "inputs": [
    {
      "intent": "action.devices.IDENTIFY",
      "payload": {
        "device": {
          "mdnsScanData": {
            "additionals": [
              {
                "type": "TXT",
                "class": "IN",
                "name": "devhome._home-assistant._tcp.local",
                "ttl": 4500,
                "data": [
                  "version=0.101.0.dev0",
                  "base_url=http://192.168.1.101:8123",
                  "requires_api_password=true"
                ]
              }
            ]
          }
        },
        "structureData": {}
      }
    }
  ],
  "devices": [
    {
      "id": "light.ceiling_lights",
      "customData": {
        "httpPort": 8123,
        "httpSSL": false,
        "proxyDeviceId": "6a04f0f7-6125-4356-a846-861df7e01497",
        "webhookId": "dde3b9800a905e886cc4d38e226a6e7e3f2a6993d2b9b9f63d13e42ee7de3219"
      }
    }
  ]
}
```

- `additionals` contains our broadcasted data. We don't need it as we store all data as custom data on our synchronized devices.
- `devices` contains our synchronized devices.

> Note: According to [the docs](https://developers.google.com/assistant/smarthome/reference/local/interfaces/smarthome.intentflow.mdnsscandata) `additionals` is typed as `Record[]`. Each record contains a `data` property with the type `string` per [the docs](https://developers.google.com/assistant/smarthome/reference/local/interfaces/smarthome.intentflow.record.html). We see that the local SDK provides us a data with type `string[]`.

## IDENTIFY response sent to Google

```json
{
  "requestId": "85205A56584454F8507E07639014A008",
  "payload": {
    "device": {
      "id": "6a04f0f7-6125-4356-a846-861df7e01497",
      "isLocalOnly": true,
      "isProxy": true,
      "deviceInfo": {
        "hwVersion": "UNKNOWN_HW_VERSION",
        "manufacturer": "Home Assistant",
        "model": "Home Assistant",
        "swVersion": "0.101.0.dev0"
      }
    }
  },
  "intent": "action.devices.IDENTIFY"
}
```

- `isLocalOnly` is set to `true` to indicate that this device does not appear in the `SYNC` response as per [the docs](https://developers.google.com/assistant/smarthome/reference/local/interfaces/smarthome.intentflow.identifyresponsepayload#optional-is-local-only-:-undefined-%7C-false-%7C-true).
- `isProxy` is set to `true` to indicate that this is a hub device that will proxy commands for other devices as per [the docs](https://developers.google.com/assistant/smarthome/reference/local/interfaces/smarthome.intentflow.identifyresponsepayload).
- `type` is not set because we were unable to find a matching type for hubs.

## REACHABLE_DEVICES intent received from Google

```json
{
  "requestId": "1AE52BEDD4C8CB4CB88D595216906541",
  "inputs": [
    {
      "intent": "action.devices.REACHABLE_DEVICES",
      "payload": {
        "device": {
          "proxyDevice": {
            "id": "6a04f0f7-6125-4356-a846-861df7e01497",
            "customData": "{}",
            "proxyData": "{}"
          }
        },
        "structureData": {}
      }
    }
  ],
  "devices": [
    {
      "id": "light.ceiling_lights",
      "customData": {
        "httpPort": 8123,
        "httpSSL": false,
        "proxyDeviceId": "6a04f0f7-6125-4356-a846-861df7e01497",
        "webhookId": "dde3b9800a905e886cc4d38e226a6e7e3f2a6993d2b9b9f63d13e42ee7de3219"
      }
    },
    {
      "id": "6a04f0f7-6125-4356-a846-861df7e01497",
      "customData": {}
    }
  ]
}
```

- You will receive this intent every minute.
- `proxyDevice` has `customData` and `proxyData` both set to the string `"{}"`. Probably a bug?
  - According to [the docs](https://developers.google.com/assistant/smarthome/reference/local/interfaces/smarthome.intentflow.proxydevice.html), `customData` is set to the data provided in the `SYNC` response. Since Home Assistant is a proxy device, it is not part of the `SYNC` response and so unable to set custom data. I tried setting custom data in the identify response but that did not persist.
  - `proxyData` is not documented in [the `ProxyDevice` docs](https://developers.google.com/assistant/smarthome/reference/local/interfaces/smarthome.intentflow.proxydevice.html).
  - We don't need either as we store all the data we need in each device.

## REACHABLE_DEVICES response sent to Google

```json
{
  "requestId": "DDC84B7A50BD8A11C3503E100E107BCA",
  "payload": {
    "devices": [
      {
        "verificationId": "light.ceiling_lights"
      }
    ]
  },
  "intent": "action.devices.REACHABLE_DEVICES"
}
```

- Reference docs for `devices` is missing in [the docs](https://developers.google.com/assistant/smarthome/reference/local/interfaces/smarthome.intentflow.reachabledevicespayload) for Reachable devices response payload.
- Payload based on [the tutorial](https://developers.google.com/assistant/smarthome/develop/local#support_devices_behind_a_hub)

> Note: If you return verificationIDs that are not yet synchronized to Google, you get the error `Failed to match device [object Object] with cloud synced devices`.

## PROXY_SELECTED intent received from Google

```json
{
  "requestId": "C26A964BE6650D9B853D538141ED4966",
  "inputs": [
    {
      "intent": "action.devices.PROXY_SELECTED",
      "payload": {
        "device": {
          "id": "6a04f0f7-6125-4356-a846-861df7e01497",
          "customData": {}
        },
        "structureData": {}
      }
    }
  ],
  "devices": [
    {
      "id": "light.ceiling_lights",
      "customData": {
        "httpPort": 8123,
        "httpSSL": false,
        "proxyDeviceId": "6a04f0f7-6125-4356-a846-861df7e01497",
        "webhookId": "dde3b9800a905e886cc4d38e226a6e7e3f2a6993d2b9b9f63d13e42ee7de3219"
      }
    },
    {
      "id": "6a04f0f7-6125-4356-a846-861df7e01497",
      "customData": {}
    }
  ]
}
```

> Receiving this intent is undocumented behavior.

The following error is raised, regardless if `REACHABLE_DEVICES` is implemented.

> [smarthome.DeviceManager] Handler for PROXY_SELECTED not implemented

This is also [issue #1](https://github.com/actions-on-google/smart-home-local/issues/1) for smart-home-local on GitHub.

I've been able to work around it by following [advice from Googler @proppy](https://github.com/actions-on-google/smart-home-local/issues/1#issuecomment-515706997) to stub it out and return an empty response:

```js
app.onProxySelected(req => {
  return {};
});
```

## EXECUTE intent received from Google

To trigger this intent, tell Google "force local" before saying a command.

```json
{
  "inputs": [
    {
      "context": {
        "locale_country": "US",
        "locale_language": "en"
      },
      "intent": "action.devices.EXECUTE",
      "payload": {
        "commands": [
          {
            "devices": [
              {
                "customData": {
                  "httpPort": 8123,
                  "httpSSL": false,
                  "proxyDeviceId": "6a04f0f7-6125-4356-a846-861df7e01497",
                  "webhookId": "dde3b9800a905e886cc4d38e226a6e7e3f2a6993d2b9b9f63d13e42ee7de3219"
                },
                "id": "light.ceiling_lights"
              }
            ],
            "execution": [
              {
                "command": "action.devices.commands.OnOff",
                "params": {
                  "on": true
                }
              }
            ]
          }
        ],
        "structureData": {}
      }
    }
  ],
  "requestId": "3166128787024955651"
}
```

- The execute intent does not include our synchronized devices or our proxy device info. This is not a problem as we store all the necessary information in each device custom data.
- This intent needs to be targeted at a device that is needs to execute the intent, not at the proxy device id. In this case `light.ceiling_lights`. It will still be sent to the proxy device.

## EXECUTE response sent to Google

```json
{
  "requestId": "3166128787024955651",
  "payload": {
    "commands": [
      {
        "ids": ["light.ceiling_lights"],
        "status": "SUCCESS",
        "states": {
          "online": true,
          "brightness": 70,
          "on": true,
          "color": {
            "spectrumHsv": {
              "hue": 56,
              "saturation": 0.86,
              "value": 0.7058823529411765
            },
            "temperatureK": 2631
          }
        }
      }
    ]
  },
  "intent": "action.devices.EXECUTE"
}
```

- This message sometimes fails with `COMMAND_FAILED` - "HTTP device missing IP address."
- We are continueing to receive `REACHABLE_DEVICES` intent and it keeps working.
