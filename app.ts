/// <reference types="@google/local-home-sdk" />

import App = smarthome.App;
import Constants = smarthome.Constants;
import DataFlow = smarthome.DataFlow;
import Execute = smarthome.Execute;
import Intents = smarthome.Intents;

import IntentFlow = smarthome.IntentFlow;
import HttpResponseData = smarthome.DataFlow.HttpResponseData;

const findHassCustomDeviceDataByMdnsData = (
  requestId: string,
  devices: Array<{ customData?: unknown }>,
  mdnsScanData: { [key: string]: string }
) => {
  let device;
  device = devices.find((dev) => {
    const customData = dev.customData as HassCustomDeviceData;
    return (
      customData &&
      "webhookId" in customData &&
      (!mdnsScanData.uuid || customData.uuid === mdnsScanData.uuid)
    );
  });

  if (!device) {
    console.log(requestId, "Unable to find HASS connection info.", devices);
    throw new IntentFlow.HandlerError(
      requestId,
      "invalidRequest",
      "Unable to find HASS connection info."
    );
  }

  return device.customData as HassCustomDeviceData;
};

const findHassCustomDeviceDataByDeviceId = (
  requestId: string,
  devices: Array<{ customData?: unknown }>,
  deviceId?: string
) => {
  let device;
  device = devices.find((dev) => {
    const customData = dev.customData as HassCustomDeviceData;
    return (
      customData &&
      "webhookId" in customData &&
      customData.proxyDeviceId === deviceId
    );
  });

  if (!device) {
    console.log(requestId, "Unable to find HASS connection info.", devices);
    throw new IntentFlow.HandlerError(
      requestId,
      "invalidRequest",
      "Unable to find HASS connection info."
    );
  }

  return device.customData as HassCustomDeviceData;
};

const createResponse = (
  request: smarthome.IntentRequest,
  payload: smarthome.IntentResponse["payload"]
): any => ({
  intent: request.inputs[0].intent,
  requestId: request.requestId,
  payload,
});

interface HassCustomDeviceData {
  webhookId: string;
  httpPort: number;
  uuid?: string;
  proxyDeviceId: string;
}

class UnknownInstance extends Error {
  constructor(public requestId: string) {
    super();
  }

  throwHandlerError() {
    throw new IntentFlow.HandlerError(
      this.requestId,
      "invalidRequest",
      "Unknown Instance"
    );
  }
}

const forwardRequest = async (
  hassDeviceData: HassCustomDeviceData,
  targetDeviceId: string,
  request: smarthome.IntentRequest
) => {
  const command = new DataFlow.HttpRequestData();
  command.method = Constants.HttpOperation.POST;
  command.requestId = request.requestId;
  command.deviceId = targetDeviceId;
  command.port = hassDeviceData.httpPort;
  command.path = `/api/webhook/${hassDeviceData.webhookId}`;
  command.data = JSON.stringify(request);
  command.dataType = "application/json";

  console.log(request.requestId, "Sending", command);

  const deviceManager = await app.getDeviceManager();

  let resp: HttpResponseData;

  try {
    resp = await new Promise<HttpResponseData>((resolve, reject) => {
      setTimeout(() => reject(-1), 10000);
      deviceManager
        .send(command)
        .then((response: any) => resolve(response as HttpResponseData), reject);
    });
    // resp = (await deviceManager.send(command)) as HttpResponseData;
    console.log(request.requestId, "Raw Response", resp);
  } catch (err) {
    console.error(request.requestId, "Error making request", err);
    throw new IntentFlow.HandlerError(
      request.requestId,
      "invalidRequest",
      err === -1 ? "Timeout" : err.message
    );
  }

  // Response if the webhook is not registered.
  if (resp.httpResponse.statusCode === 200 && !resp.httpResponse.body) {
    throw new UnknownInstance(request.requestId);
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
      "invalidRequest",
      err.message
    );
  }
};

const identifyHandler = async (
  request: IntentFlow.IdentifyRequest
): Promise<IntentFlow.IdentifyResponse> => {
  console.log("IDENTIFY intent:", request);

  const deviceToIdentify = request.inputs[0].payload.device;

  if (!deviceToIdentify.mdnsScanData) {
    console.error(request.requestId, "No usable mdns scan data");
    return createResponse(request, {} as any);
  }

  if (
    !deviceToIdentify.mdnsScanData.serviceName.endsWith(
      "._home-assistant._tcp.local"
    )
  ) {
    console.error(request.requestId, "Not Home Assistant type");
    return createResponse(request, {} as any);
  }

  try {
    const hassCustomData = findHassCustomDeviceDataByMdnsData(
      request.requestId,
      request.devices,
      deviceToIdentify.mdnsScanData.txt
    );
    return await forwardRequest(hassCustomData, "", request);
  } catch (err) {
    if (err instanceof UnknownInstance) {
      return createResponse(request, {} as any);
    }
    throw err;
  }
};

const reachableDevicesHandler = async (
  request: IntentFlow.ReachableDevicesRequest
): Promise<IntentFlow.ReachableDevicesResponse> => {
  console.log("REACHABLE_DEVICES intent:", request);

  const hassCustomData = findHassCustomDeviceDataByDeviceId(
    request.requestId,
    request.devices,
    request.inputs[0].payload.device.id
  );

  try {
    return forwardRequest(
      hassCustomData,
      // Old code would sent it to the proxy ID: hassCustomData.proxyDeviceId
      // But tutorial claims otherwise, but maybe it is not for hub devices??
      // https://developers.google.com/assistant/smarthome/develop/local#implement_the_execute_handler

      // Sending it to the device that has to receive the command as per the tutorial
      request.inputs[0].payload.device.id as string,
      request
    );
  } catch (err) {
    if (err instanceof UnknownInstance) {
      err.throwHandlerError();
    }
    throw err;
  }
};

const executeHandler = async (
  request: IntentFlow.ExecuteRequest
): Promise<IntentFlow.ExecuteResponse> => {
  console.log("EXECUTE intent:", request);

  const device = request.inputs[0].payload.commands[0].devices[0];

  try {
    return forwardRequest(
      device.customData as HassCustomDeviceData,
      device.id,
      request
    );
  } catch (err) {
    if (err instanceof UnknownInstance) {
      err.throwHandlerError();
    }
    throw err;
  }
};

const app = new App("1.0.0");

app
  .onIdentify(identifyHandler)
  .onReachableDevices(reachableDevicesHandler)
  .onExecute(executeHandler)

  // Undocumented in TypeScript

  // Suggested by Googler, seems to work :shrug:
  // https://github.com/actions-on-google/smart-home-local/issues/1#issuecomment-515706997
  // @ts-ignore
  .onProxySelected((req) => {
    console.log("ProxySelected", req);
    return createResponse(req, {} as any);
  })

  // @ts-ignore
  .onIndicate((req) => console.log("Indicate", req))
  // @ts-ignore
  .onParseNotification((req) => console.log("ParseNotification", req))
  // @ts-ignore
  .onProvision((req) => console.log("Provision", req))
  // @ts-ignore
  .onQuery((req) => console.log("Query", req))
  // @ts-ignore
  .onRegister((req) => console.log("Register", req))
  // @ts-ignore
  .onUnprovision((req) => console.log("Unprovision", req))
  // @ts-ignore
  .onUpdate((req) => console.log("Update", req))

  .listen()
  .then(() => {
    console.log("Ready!");
    // Play audio to indicate that receiver is ready to inspect.
    new Audio("https://www.pacdv.com/sounds/fart-sounds/fart-1.wav").play();
  })
  .catch((e: Error) => console.error(e));
