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

const findDeviceCustomDataByMdnsData = async (
  requestId: string,
  mdnsScanData: { [key: string]: string }
): Promise<HassCustomDeviceData> => {
  const deviceManager = await app.getDeviceManager();
  const device = deviceManager.getRegisteredDevices().find((dev) => {
    const customData = dev.customData as HassCustomDeviceData;
    return (
      customData &&
      "webhookId" in customData &&
      // UUID was introduced in Home Assistant 0.109
      (!mdnsScanData.uuid || customData.uuid === mdnsScanData.uuid)
    );
  });

  if (!device) {
    console.log(
      requestId,
      "Unable to find HASS connection info.",
      deviceManager.getRegisteredDevices()
    );
    throw new IntentFlow.HandlerError(
      requestId,
      ErrorCode.DEVICE_NOT_IDENTIFIED,
      "Unable to find HASS connection info."
    );
  }

  return device.customData as HassCustomDeviceData;
};

const getProxyDeviceDataForRequesting = async (
  requestId: string,
  proxyDeviceId: string
): Promise<DeviceDataForRequesting> => {
  const deviceManager = await app.getDeviceManager();
  const device = deviceManager.getRegisteredDevices().find((dev) => {
    const customData = dev.customData as HassCustomDeviceData;
    return (
      customData &&
      "webhookId" in customData &&
      customData.proxyDeviceId === proxyDeviceId
    );
  });

  if (!device) {
    console.log(
      requestId,
      "Unable to find HASS connection info.",
      deviceManager.getRegisteredDevices()
    );
    throw new IntentFlow.HandlerError(
      requestId,
      ErrorCode.DEVICE_VERIFICATION_FAILED,
      "Unable to find HASS connection info."
    );
  }

  return {
    customData: device.customData as HassCustomDeviceData,
    id: proxyDeviceId,
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
  let numbers: number[];
  try {
    numbers = [parseInt(parts[0]), parseInt(parts[1])];
  } catch (err) {
    return false;
  }
  return (
    parts.length > 2 &&
    // If major version is higher
    (numbers[0] > major ||
      // same major, higher or equal minor
      (numbers[0] == major && numbers[1] >= minor))
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
  extractDeviceData: (
    request: Requests[T]["request"]
  ) => Promise<DeviceDataForRequesting>,
  suppportedVersion?: [number, number]
): Promise<Requests[T]["response"]> => {
  // Return empty response if not supported.
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
        "Not supported. Returning empty response",
        createResponse(request, {} as any)
      );
      return createResponse(request, {} as any);
    }
  }

  const data = await extractDeviceData(request);

  const command = new DataFlow.HttpRequestData();
  command.method = Constants.HttpOperation.POST;
  command.requestId = request.requestId;
  command.deviceId = data.id;
  command.port = data.customData.httpPort;
  command.path = `/api/webhook/${data.customData.webhookId}`;
  command.data = JSON.stringify(request);
  command.dataType = "application/json";

  // console.log(request.requestId, "Sending", command);

  const deviceManager = await app.getDeviceManager();

  let resp: HttpResponseData;

  try {
    resp = (await deviceManager.send(command)) as HttpResponseData;
    // console.log(request.requestId, "Raw Response", resp);
  } catch (err) {
    console.error(request.requestId, "Error making request", err);
    throw new IntentFlow.HandlerError(
      request.requestId,
      ErrorCode.GENERIC_ERROR,
      (err as any).message || "uknown error"
    );
  }

  // Response if the webhook is not registered.
  if (resp.httpResponse.statusCode === 200 && !resp.httpResponse.body) {
    console.log("Webhook not registered");
    throw new IntentFlow.HandlerError(
      request.requestId,
      ErrorCode.DEVICE_NOT_IDENTIFIED,
      "Unknown Instance"
    );
  }

  try {
    const response = JSON.parse(resp.httpResponse.body as string);

    // Local SDK wants this.
    response.intent = request.inputs[0].intent;

    console.log(request.requestId, "Response", response);
    return response;
  } catch (err) {
    console.error(request.requestId, "Error parsing body", err);

    throw new IntentFlow.HandlerError(
      request.requestId,
      ErrorCode.GENERIC_ERROR,
      (err as any).message || "unknown error"
    );
  }
};

const app = new App("2.0.0");

app
  .onIdentify((request) =>
    forwardRequest<"identify">(request, async (request) => {
      const deviceToIdentify = request.inputs[0].payload.device;

      if (!deviceToIdentify.mdnsScanData) {
        console.error(request.requestId, "No usable mdns scan data");
        throw new IntentFlow.HandlerError(
          request.requestId,
          ErrorCode.DEVICE_NOT_IDENTIFIED,
          "Unknown Instance"
        );
      }

      if (
        !deviceToIdentify.mdnsScanData.serviceName.endsWith(
          "._home-assistant._tcp.local"
        )
      ) {
        console.error(request.requestId, "Not Home Assistant type");
        throw new IntentFlow.HandlerError(
          request.requestId,
          ErrorCode.DEVICE_NOT_IDENTIFIED,
          "Unknown Instance"
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
