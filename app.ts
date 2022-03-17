/// <reference types="@google/local-home-sdk" />

import App = smarthome.App;
import Constants = smarthome.Constants;
import DataFlow = smarthome.DataFlow;
import Execute = smarthome.Execute;
import Intents = smarthome.Intents;

import IntentFlow = smarthome.IntentFlow;
import HttpResponseData = smarthome.DataFlow.HttpResponseData;
import ErrorCode = IntentFlow.ErrorCode;

type Requests = {
  query: {
    request: IntentFlow.QueryRequest;
    response: IntentFlow.QueryResponse;
  };
  execute: {
    request: IntentFlow.ExecuteRequest;
    response: IntentFlow.ExecuteResponse;
  };
  identify: {
    request: IntentFlow.IdentifyRequest;
    response: IntentFlow.IdentifyResponse;
  };
  reachableDevices: {
    request: IntentFlow.ReachableDevicesRequest;
    response: IntentFlow.ReachableDevicesResponse;
  };
  indicate: {
    request: IntentFlow.IndicateRequest;
    response: IntentFlow.IndicateResponse;
  };
  proxySelected: {
    request: IntentFlow.ProxySelectedRequest;
    response: IntentFlow.ProxySelectedResponse;
  };
  parseNotification: {
    request: IntentFlow.ParseNotificationRequest;
    response: IntentFlow.ParseNotificationResponse;
  };
  Provision: {
    request: IntentFlow.ProvisionRequest;
    response: IntentFlow.ProvisionResponse;
  };
  register: {
    request: IntentFlow.RegisterRequest;
    response: IntentFlow.RegisterResponse;
  };
  unprovision: {
    request: IntentFlow.UnprovisionRequest;
    response: IntentFlow.UnprovisionResponse;
  };
  update: {
    request: IntentFlow.UpdateRequest;
    response: IntentFlow.UpdateResponse;
  };
};

interface HassCustomDeviceData {
  webhookId: string;
  httpPort: number;
  uuid?: string;
  proxyDeviceId: string;
}

interface DeviceDataForRequesting {
  customData: HassCustomDeviceData;
  id: string;
}

const VERSION = "2.1.1";

const createError = (
  requestId: string,
  errorCode: string,
  msg: string,
  ...extraLog: any[]
) => {
  console.error(requestId, errorCode, msg, ...extraLog);
  return new IntentFlow.HandlerError(requestId, errorCode, msg);
};

const getCustomDataByKey = async (
  requestId: string,
  dataKey: keyof HassCustomDeviceData,
  expectedValue?: string
) => {
  const deviceManager = await app.getDeviceManager();
  const KEY_NOT_DEFINED = "_no_key_";
  const grouped: Record<string, HassCustomDeviceData> = {};

  if (expectedValue === undefined) {
    expectedValue = KEY_NOT_DEFINED;
  }

  // Group valid scan data by key
  for (const device of deviceManager.getRegisteredDevices()) {
    const customData = device.customData as HassCustomDeviceData;
    if (!customData || !("webhookId" in customData)) {
      continue;
    }
    const value = customData[dataKey] || KEY_NOT_DEFINED;
    if (!(value in grouped)) {
      grouped[value] = customData;
    }
  }

  if (Object.keys(grouped).length === 0) {
    throw createError(
      requestId,
      ErrorCode.DEVICE_VERIFICATION_FAILED,
      "Unable to find HASS connection info.",
      deviceManager.getRegisteredDevices()
    );
  }

  if (!(expectedValue in grouped)) {
    throw createError(
      requestId,
      ErrorCode.DEVICE_VERIFICATION_FAILED,
      `Unable to find HA instance in sync-ed devices matching on ${dataKey}.`,
      deviceManager.getRegisteredDevices()
    );
  }

  return grouped[expectedValue];
};

const findDeviceCustomDataByMdnsData = async (
  requestId: string,
  mdnsScanData: { [key: string]: string }
): Promise<HassCustomDeviceData> => {
  return await getCustomDataByKey(requestId, "uuid", mdnsScanData.uuid);
};

const getProxyDeviceDataForRequesting = async (
  requestId: string,
  proxyDeviceId: string
): Promise<DeviceDataForRequesting> => {
  const customData = await getCustomDataByKey(
    requestId,
    "proxyDeviceId",
    proxyDeviceId
  );
  return {
    id: proxyDeviceId,
    customData,
  };
};

// The types are wrong. The registered proxy device (HA) includes unparsed mdns props.
interface RegisteredDeviceMdnsScanData extends IntentFlow.MdnsScanData {
  texts: string[];
}

const extractVersionFromMdnsRecords = (texts: string[]) => {
  for (const text of texts) {
    if (text.startsWith("version=")) {
      return text.split("=")[1];
    }
  }
};

const getHAVersion = async (): Promise<string | undefined> => {
  const deviceManager = await app.getDeviceManager();
  const proxyDevice = deviceManager
    .getRegisteredDevices()
    .find(
      (dev) =>
        (dev.scanData?.mdnsScanData as RegisteredDeviceMdnsScanData)?.texts
    );
  if (!proxyDevice) {
    return;
  }
  return extractVersionFromMdnsRecords(
    (proxyDevice.scanData!.mdnsScanData as RegisteredDeviceMdnsScanData).texts
  );
};

const atleastVersion = (haVersion: string, major: number, minor: number) => {
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

const createResponse = (
  request: smarthome.IntentRequest,
  payload: smarthome.IntentResponse["payload"]
): any => ({
  intent: request.inputs[0].intent,
  requestId: request.requestId,
  payload,
});

const forwardRequest = async <T extends keyof Requests>(
  request: Requests[T]["request"],
  extractProxyDeviceData: (
    request: Requests[T]["request"]
  ) => Promise<DeviceDataForRequesting>,
  suppportedVersion?: [number, number]
): Promise<Requests[T]["response"]> => {
  const intent = request.inputs[0].intent;
  const haVersion =
    intent == Intents.IDENTIFY
      ? extractVersionFromMdnsRecords(
          (request as IntentFlow.IdentifyRequest).inputs[0].payload.device
            .mdnsScanData?.data || []
        )
      : await getHAVersion();
  console.log(`Sending ${intent} to HA ${haVersion}`, request);

  if (suppportedVersion) {
    if (
      !haVersion ||
      !atleastVersion(haVersion, suppportedVersion[0], suppportedVersion[1])
    ) {
      console.log(
        "Intent not supported by HA version. Returning empty response"
      );
      return createResponse(request, {} as any);
    }
  }

  const proxyDeviceData = await extractProxyDeviceData(request);

  const command = new DataFlow.HttpRequestData();
  command.method = Constants.HttpOperation.POST;
  command.requestId = request.requestId;
  command.deviceId = proxyDeviceData.id;
  command.port = proxyDeviceData.customData.httpPort;
  command.path = `/api/webhook/${proxyDeviceData.customData.webhookId}`;
  command.data = JSON.stringify(request);
  command.dataType = "application/json";
  command.additionalHeaders = {
    "HA-Cloud-Version": VERSION,
  };

  // console.log(request.requestId, "Sending", command);

  const deviceManager = await app.getDeviceManager();

  let resp: HttpResponseData;

  try {
    resp = (await deviceManager.send(command)) as HttpResponseData;
  } catch (err) {
    throw createError(
      request.requestId,
      ErrorCode.GENERIC_ERROR,
      `Error making request: ${err}`,
      command
    );
  }

  // Response if the webhook is not registered.
  if (resp.httpResponse.statusCode === 200 && !resp.httpResponse.body) {
    throw createError(
      request.requestId,
      ErrorCode.DEVICE_NOT_IDENTIFIED,
      "Webhook not registered"
    );
  }

  let response: any;

  try {
    response = JSON.parse(resp.httpResponse.body as string);
  } catch (err) {
    throw createError(
      request.requestId,
      ErrorCode.GENERIC_ERROR,
      `Error parsing body: ${err}`,
      resp.httpResponse.body
    );
  }

  // Local SDK wants this.
  response.intent = request.inputs[0].intent;
  console.log(request.requestId, "Response", response);
  return response;
};

const app = new App(VERSION);

app
  .onIdentify((request) =>
    forwardRequest<"identify">(request, async (request) => {
      const deviceToIdentify = request.inputs[0].payload.device;

      if (!deviceToIdentify.mdnsScanData) {
        throw createError(
          request.requestId,
          ErrorCode.DEVICE_NOT_IDENTIFIED,
          "No usable mdns scan data"
        );
      }

      if (
        !deviceToIdentify.mdnsScanData.serviceName.endsWith(
          "._home-assistant._tcp.local"
        )
      ) {
        throw createError(
          request.requestId,
          ErrorCode.DEVICE_NOT_IDENTIFIED,
          `Not Home Assistant type: ${deviceToIdentify.mdnsScanData.serviceName}`
        );
      }

      return {
        customData: await findDeviceCustomDataByMdnsData(
          request.requestId,
          deviceToIdentify.mdnsScanData.txt
        ),
        id: "",
      };
    })
  )
  .onProxySelected((request) =>
    forwardRequest<"proxySelected">(
      request,
      (request) =>
        getProxyDeviceDataForRequesting(
          request.requestId,
          request.inputs[0].payload.device.id!
        ),
      [2022, 3]
    )
  )
  .onReachableDevices((request) =>
    forwardRequest<"reachableDevices">(request, async (request) =>
      getProxyDeviceDataForRequesting(
        request.requestId,
        request.inputs[0].payload.device.id!
      )
    )
  )
  .onQuery((request) =>
    forwardRequest<"query">(
      request,
      async (request) =>
        request.inputs[0].payload.devices[0] as DeviceDataForRequesting
    )
  )
  .onExecute((request) =>
    forwardRequest<"execute">(
      request,
      async (request) =>
        request.inputs[0].payload.commands[0]
          .devices[0] as DeviceDataForRequesting
    )
  )
  .listen()
  .then(() => {
    console.log("Ready!");
  })
  .catch((e: Error) => console.error(e));
