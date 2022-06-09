/// <reference types="@google/local-home-sdk" />

import App = smarthome.App;
import Constants = smarthome.Constants;
import DataFlow = smarthome.DataFlow;
import Execute = smarthome.Execute;
import Intents = smarthome.Intents;

import IntentFlow = smarthome.IntentFlow;
import HttpResponseData = smarthome.DataFlow.HttpResponseData;
import ErrorCode = IntentFlow.ErrorCode;

type ReqRes<S> = S extends IntentFlow.IntentHandler<infer REQ, infer RES>
  ? { request: REQ; response: RES }
  : never;

type Requests = {
  // [Intents.EVENT]: ReqRes<IntentFlow.EventHandler>;
  [Intents.EXECUTE]: ReqRes<IntentFlow.ExecuteHandler>;
  [Intents.IDENTIFY]: ReqRes<IntentFlow.IdentifyHandler>;
  // [Intents.INDICATE]: ReqRes<IntentFlow.IndicateHandler>;
  // [Intents.PARSE_NOTIFICATION]: ReqRes<IntentFlow.ParseNotificationHandler>;
  // [Intents.PROVISION]: ReqRes<IntentFlow.ProvisionHandler>;
  [Intents.PROXY_SELECTED]: ReqRes<IntentFlow.ProxySelectedHandler>;
  [Intents.QUERY]: ReqRes<IntentFlow.QueryHandler>;
  [Intents.REACHABLE_DEVICES]: ReqRes<IntentFlow.ReachableDevicesHandler>;
  // [Intents.REGISTER]: ReqRes<IntentFlow.RegisterHandler>;
  // [Intents.UNPROVISION]: ReqRes<IntentFlow.UnprovisionHandler>;
  // [Intents.UPDATE]: ReqRes<IntentFlow.UpdateHandler>;
};

interface HassCustomDeviceData {
  webhookId: string;
  httpPort: number;
  uuid?: string;
}

const VERSION = "2.1.5";

class RequestResponseHandler<T extends keyof Requests> {
  _deviceManager?: smarthome.DeviceManager;
  haVersion?: string;

  constructor(
    public intent: T,
    public request: Requests[T]["request"],
    public options: {
      supportedHAVersion?: [number, number];
      extractHAVersion?: (
        deviceManager: smarthome.DeviceManager
      ) => string | undefined;
    } = {}
  ) {
    this.logMessage("Processing", request);
  }

  async getDeviceManager() {
    if (this._deviceManager) {
      return this._deviceManager;
    }
    this._deviceManager = await app.getDeviceManager();
    this.haVersion = (
      this.options.extractHAVersion || getHAVersionFromProxyDevice
    )(this._deviceManager);
    return this._deviceManager;
  }

  createResponse(payload: smarthome.IntentResponse["payload"]): any {
    return {
      requestId: this.request.requestId,
      payload,
    };
  }

  /** Create and log the error. */
  createError(errorCode: ErrorCode, msg: string, ...extraLog: any[]) {
    this.logError(`Error ${errorCode}`, msg, ...extraLog);
    return new IntentFlow.HandlerError(this.request.requestId, errorCode, msg);
  }

  /** Get Home Assistant info stored in device custom data. */
  getHassCustomData(
    deviceManager: smarthome.DeviceManager
  ): HassCustomDeviceData {
    for (const device of deviceManager.getRegisteredDevices()) {
      const customData = device.customData as HassCustomDeviceData | undefined;
      if (customData && "webhookId" in customData && "httpPort" in customData) {
        return customData;
      }
    }

    throw this.createError(
      ErrorCode.DEVICE_VERIFICATION_FAILED,
      `Unable to find HASS connection info.`,
      deviceManager.getRegisteredDevices()
    );
  }

  get logPrefix() {
    let prefix = `${
      this.intent.startsWith("action.devices.")
        ? this.intent.substring("action.devices.".length)
        : this.intent
    }-${this.request.requestId.substring(0, 5)}`;
    if (this.haVersion) {
      prefix += ` @ HA/${this.haVersion}`;
    }
    return `[${prefix}]`;
  }

  logMessage(msg: string, ...extraLog: any[]) {
    console.log(this.logPrefix, msg, ...extraLog);
  }

  logError(msg: string, ...extraLog: any[]) {
    console.error(this.logPrefix, msg, ...extraLog);
  }

  async forwardRequest(
    targetDeviceId: string,
    isRetry = false
  ): Promise<Requests[T]["response"]> {
    const deviceManager = await this.getDeviceManager();
    this.logMessage(`Sending to HA`, this.request);
    const haVersion = this.haVersion;
    if (
      this.options.supportedHAVersion &&
      (!haVersion ||
        !atleastVersion(haVersion, ...this.options.supportedHAVersion))
    ) {
      this.logMessage(
        "Intent not supported by HA version. Returning empty response"
      );
      return this.createResponse({} as any);
    }

    const deviceData = this.getHassCustomData(deviceManager);

    const command = new DataFlow.HttpRequestData();
    command.method = Constants.HttpOperation.POST;
    command.requestId = this.request.requestId;
    command.deviceId = targetDeviceId;
    command.port = deviceData.httpPort;
    command.path = `/api/webhook/${deviceData.webhookId}`;
    command.data = JSON.stringify(this.request);
    command.dataType = "application/json";
    command.additionalHeaders = {
      "HA-Cloud-Version": VERSION,
    };

    // this.logMessage("Sending", command);

    let rawResponse: HttpResponseData;

    try {
      rawResponse = (await deviceManager.send(command)) as HttpResponseData;
    } catch (err) {
      this.logError("Error making request", err);
      // Errors coming out of `deviceManager.send` are already Google errors.
      throw err;
    }

    // Detect the response if the webhook is not registered.
    // This can happen if user logs out from cloud while Google still
    // has devices synced or if Home Assistant is restarting and Google Assistant
    // integration is not yet initialized.
    if (
      rawResponse.httpResponse.statusCode === 200 &&
      !rawResponse.httpResponse.body
    ) {
      // Retry in case it's because of initialization.
      if (!isRetry) {
        return await this.forwardRequest(targetDeviceId, true);
      }
      throw this.createError(ErrorCode.GENERIC_ERROR, "Webhook not registered");
    }

    let response: Requests[T]["response"];

    try {
      response = JSON.parse(rawResponse.httpResponse.body as string);
    } catch (err) {
      this.logError(
        "Invalid JSON in response",
        rawResponse.httpResponse.body,
        err
      );
      throw this.createError(
        ErrorCode.GENERIC_ERROR,
        `Error parsing body: ${rawResponse.httpResponse.body}`,
        rawResponse.httpResponse.body
      );
    }

    this.logMessage("Response", response);
    return response;
  }
}

// The types are wrong. The registered proxy device (HA) includes unparsed mdns props.
interface RegisteredDeviceMdnsScanData extends IntentFlow.MdnsScanData {
  texts: string[];
}

const stringToColor = (str: string) => {
  var hash = 0;
  for (var i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  var color = "#";
  for (var i = 0; i < 3; i++) {
    var value = (hash >> (i * 8)) & 0xff;
    color += ("00" + value.toString(16)).substr(-2);
  }
  return color;
};

const extractHAVersionFromMdnsRecords = (
  texts: string[]
): string | undefined => {
  for (const text of texts) {
    if (text.startsWith("version=")) {
      return text.split("=")[1];
    }
  }
  return undefined;
};

const getHAVersionFromProxyDevice = (
  deviceManager: smarthome.DeviceManager
): string | undefined => {
  const proxyDevice = deviceManager.getRegisteredDevices().find(
    (dev) =>
      // Only the proxy device has scanData
      (dev.scanData?.mdnsScanData as RegisteredDeviceMdnsScanData)?.texts
  );
  if (!proxyDevice) {
    return undefined;
  }
  return extractHAVersionFromMdnsRecords(
    (proxyDevice.scanData!.mdnsScanData as RegisteredDeviceMdnsScanData).texts
  );
};

const atleastVersion = (
  haVersion: string,
  major: number,
  minor: number
): boolean => {
  const parts = haVersion.split(".");
  if (parts.length < 2) {
    return false;
  }
  let numbers: [number, number];
  try {
    numbers = [parseInt(parts[0]), parseInt(parts[1])];
  } catch (err) {
    return false;
  }
  return (
    // If major version is higher
    numbers[0] > major ||
    // same major, higher or equal minor
    (numbers[0] == major && numbers[1] >= minor)
  );
};

const app = new App(VERSION);

app
  .onIdentify(async (request) => {
    const handler = new RequestResponseHandler(Intents.IDENTIFY, request, {
      extractHAVersion: () =>
        extractHAVersionFromMdnsRecords(
          request.inputs[0].payload.device.mdnsScanData?.data || []
        ),
    });
    const deviceManager = await handler.getDeviceManager();

    const deviceToIdentify = request.inputs[0].payload.device;

    if (
      !deviceToIdentify.mdnsScanData ||
      deviceToIdentify.mdnsScanData.data.length === 0
    ) {
      throw handler.createError(
        ErrorCode.DEVICE_NOT_IDENTIFIED,
        "No usable mdns scan data"
      );
    }

    if (
      !deviceToIdentify.mdnsScanData.serviceName.endsWith(
        "._home-assistant._tcp.local"
      )
    ) {
      throw handler.createError(
        ErrorCode.DEVICE_NOT_IDENTIFIED,
        `Not Home Assistant type: ${deviceToIdentify.mdnsScanData.serviceName}`
      );
    }

    const customData = handler.getHassCustomData(deviceManager);

    if (
      deviceToIdentify.mdnsScanData.txt.uuid &&
      customData.uuid &&
      deviceToIdentify.mdnsScanData.txt.uuid !== customData.uuid
    ) {
      throw handler.createError(
        ErrorCode.DEVICE_VERIFICATION_FAILED,
        `UUID does not match.`,
        deviceManager.getRegisteredDevices()
      );
    }

    return await handler.forwardRequest("");
  })
  // Intents targeting the proxy device
  .onProxySelected((request) =>
    new RequestResponseHandler(Intents.PROXY_SELECTED, request, {
      supportedHAVersion: [2022, 3],
    }).forwardRequest(request.inputs[0].payload.device.id!)
  )
  .onReachableDevices((request) =>
    new RequestResponseHandler(
      Intents.REACHABLE_DEVICES,
      request
    ).forwardRequest(request.inputs[0].payload.device.id!)
  )
  // Intents targeting a device in Home Assistant
  .onQuery((request) =>
    new RequestResponseHandler(Intents.QUERY, request).forwardRequest(
      request.inputs[0].payload.devices[0].id
    )
  )
  .onExecute((request) =>
    new RequestResponseHandler(Intents.EXECUTE, request).forwardRequest(
      request.inputs[0].payload.commands[0].devices[0].id
    )
  )
  .listen()
  .then(() => {
    console.log("Ready!");
  })
  .catch((e: Error) => console.error(e));
