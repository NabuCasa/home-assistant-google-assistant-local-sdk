# Requests and responses

These are the requests and responses we have received while integrating Home Assistant as a local hub device with Actions on Google.

For testing, do a zeroconf broadcast to start the IDENTIFY intent. Once you are able to reach REACHABLE_DEVICES interaction, you will need to restart the Google Assistant device between each try.

**Updated for Google Home v1.44 (preview released on December 4).**

## SYNC response sent to Google

```json
{
  "msgid": "a0ec2919-a883-492e-a38d-93b068b9c08a",
  "payload": {
    "payload": {
      "agentUserId": "19199de777b74d9fa7bf91f9a287e147",
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
            "webhookId": "ff284724789c7789d9f784765475df545227902f6c81e67f0f9254efc7cca30e"
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
          "willReportState": false
        }
      ]
    },
    "requestId": "14145511951361306028"
  }
}
```

- For our implementation, `customData` contains info to reach Home Assistant and it contains the device ID of the hub.
- `otherDeviceIds` is set to the device ID of the Home Assistant instance as [per the docs](https://developers.google.com/assistant/smarthome/reference/rest/v1/devices/sync#Device.FIELDS.other_device_ids). This device is not part of the normal SYNC response but will be identified during the IDENTIFY intent.

## IDENTIFY intent received from Google

```json
{
  "requestId": "55EB909FBFAAE72114FE8928C2B87267",
  "inputs": [
    {
      "intent": "action.devices.IDENTIFY",
      "payload": {
        "device": {
          "mdnsScanData": {
            "serviceName": "devhome._home-assistant._tcp.local",
            "name": "devhome",
            "type": "home-assistant",
            "protocol": "tcp",
            "data": [
              "version=0.104.0.dev0",
              "base_url=http://192.168.1.234:8123",
              "requires_api_password=true"
            ],
            "txt": {
              "version": "0.104.0.dev0",
              "base_url": "http://192.168.1.234:8123",
              "requires_api_password": "true"
            }
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
        "webhookId": "ff284724789c7789d9f784765475df545227902f6c81e67f0f9254efc7cca30e"
      }
    }
  ]
}
```

- `mdnsScanData` contains our broadcasted data. We don't need it as we store all data as custom data on our synchronized devices.
- `devices` contains our synchronized devices.

## IDENTIFY response sent to Google

```json

  "requestId": "55EB909FBFAAE72114FE8928C2B87267",
  "payload": {
    "device": {
      "id": "19199de777b74d9fa7bf91f9a287e147",
      "isLocalOnly": true,
      "isProxy": true,
      "deviceInfo": {
        "hwVersion": "UNKNOWN_HW_VERSION",
        "manufacturer": "Home Assistant",
        "model": "Home Assistant",
        "swVersion": "0.104.0.dev0"
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
  "requestId": "D1B0B8955639E2A634A94E6DDED0A6D9",
  "inputs": [
    {
      "intent": "action.devices.REACHABLE_DEVICES",
      "payload": {
        "device": {
          "id": "19199de777b74d9fa7bf91f9a287e147",
          "customData": {},
          "proxyData": {}
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
        "webhookId": "ff284724789c7789d9f784765475df545227902f6c81e67f0f9254efc7cca30e"
      }
    },
    {
      "id": "19199de777b74d9fa7bf91f9a287e147",
      "customData": {}
    }
  ]
}
```

- You will receive this intent every minute.
- Our hub is now also part of devices.

## REACHABLE_DEVICES response sent to Google

```json
{
  "requestId": "D1B0B8955639E2A634A94E6DDED0A6D9",
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

- Payload based on [the tutorial](https://developers.google.com/assistant/smarthome/develop/local#support_devices_behind_a_hub)

## PROXY_SELECTED intent received from Google

```json
{
  "requestId": "063354DA47A8398DDFFC6028C754F611",
  "inputs": [
    {
      "intent": "action.devices.PROXY_SELECTED",
      "payload": {
        "device": {
          "id": "19199de777b74d9fa7bf91f9a287e147",
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
        "webhookId": "ff284724789c7789d9f784765475df545227902f6c81e67f0f9254efc7cca30e"
      }
    },
    {
      "id": "19199de777b74d9fa7bf91f9a287e147",
      "customData": {}
    }
  ]
}
```

> Receiving this intent is undocumented behavior.

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
                  "webhookId": "ff284724789c7789d9f784765475df545227902f6c81e67f0f9254efc7cca30e"
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
  "requestId": "3055233711694216560"
}
```

## EXECUTE response sent to Google

```json
{
  "requestId": "3055233711694216560",
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
