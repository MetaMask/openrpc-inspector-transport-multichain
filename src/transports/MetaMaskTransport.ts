import { Transport } from "@open-rpc/client-js/build/transports/Transport";
import {
  IJSONRPCData,
  JSONRPCRequestData,
  getBatchRequests,
  getNotifications,
} from "@open-rpc/client-js/build/Request";
import { JSONRPCError } from "@open-rpc/client-js";
import { ERR_UNKNOWN } from "@open-rpc/client-js/build/Error";

class MetaMaskTransport extends Transport {
  private extensionPort?: chrome.runtime.Port;
  private url?: string;

  public async _connect(url: string): Promise<boolean> {
    this.url = url;
    return this.connect();
  }

  public async connect(): Promise<boolean> {
    this.extensionPort =
      this.extensionPort || chrome.runtime.connect(this.url!);
    this.extensionPort.onDisconnect.addListener(() => {
      this.extensionPort?.onMessage.removeListener(
        this.onMessageListener.bind(this),
      );
      this.extensionPort = undefined;
    });
    this.extensionPort.onMessage.addListener(this.onMessageListener.bind(this));
    return true;
  }

  public async sendData(
    data: JSONRPCRequestData,
    timeout: number | undefined = 5000,
  ): Promise<any> {
    if (Array.isArray(data)) {
      throw new Error("Batch requests not supported yet");
    }
    const dataRequestWithIds = {
      ...(data as IJSONRPCData).request,
      id: (data as IJSONRPCData).internalID,
    };
    const r = { ...data, request: dataRequestWithIds };
    let prom = this.transportRequestManager.addRequest(r, timeout);
    const notifications = getNotifications(r);
    try {
      this.extensionPort?.postMessage({
        type: "caip-348",
        data: dataRequestWithIds,
      });
      this.transportRequestManager.settlePendingRequest(notifications);
    } catch (err) {
      const jsonError = new JSONRPCError(
        (err as any).message,
        ERR_UNKNOWN,
        err,
      );

      this.transportRequestManager.settlePendingRequest(
        notifications,
        jsonError,
      );
      this.transportRequestManager.settlePendingRequest(
        getBatchRequests(r),
        jsonError,
      );

      prom = Promise.reject(jsonError);
    }

    return prom;
  }

  public close(): void {
    this.extensionPort?.onMessage.removeListener(this.onMessageListener);
  }

  private onMessageListener(msg: any) {
    const { data } = msg;
    this.transportRequestManager.resolveResponse(JSON.stringify(data));
  }
}

export default MetaMaskTransport;
