import type { TrafficStateResponse } from "@/types/graph";

export type TrafficWsStatus = "connecting" | "open" | "reconnecting" | "closed";

interface TrafficWsMessage {
  type?: unknown;
  seq?: unknown;
  data?: unknown;
  message?: unknown;
}

interface TrafficWsClientOptions {
  url: string;
  throttleMs?: number;
  baseRetryMs?: number;
  maxRetryMs?: number;
  maxRetries?: number;
  onStatus?: (status: TrafficWsStatus, detail?: string, manual?: boolean) => void;
  onTrafficState?: (state: TrafficStateResponse, seq: number | null) => void;
  onError?: (message: string) => void;
}

export class TrafficWsClient {
  private readonly url: string;
  private readonly throttleMs: number;
  private readonly baseRetryMs: number;
  private readonly maxRetryMs: number;
  private readonly maxRetries: number;

  private readonly onStatus?: TrafficWsClientOptions["onStatus"];
  private readonly onTrafficState?: TrafficWsClientOptions["onTrafficState"];
  private readonly onError?: TrafficWsClientOptions["onError"];

  private websocket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private retries = 0;
  private manualClose = false;

  constructor(options: TrafficWsClientOptions) {
    this.url = options.url;
    this.throttleMs = options.throttleMs ?? 1000;
    this.baseRetryMs = options.baseRetryMs ?? 600;
    this.maxRetryMs = options.maxRetryMs ?? 6000;
    this.maxRetries = options.maxRetries ?? 6;

    this.onStatus = options.onStatus;
    this.onTrafficState = options.onTrafficState;
    this.onError = options.onError;
  }

  async connect(timeoutMs = 4000): Promise<void> {
    this.manualClose = false;
    this.clearReconnectTimer();

    if (this.websocket && (this.websocket.readyState === WebSocket.OPEN || this.websocket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.onStatus?.(this.retries > 0 ? "reconnecting" : "connecting");

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.websocket = ws;

      const timeoutId = window.setTimeout(() => {
        cleanup();
        try {
          ws.close();
        } catch {
          // no-op
        }
        reject(new Error("Traffic websocket connect timeout"));
      }, timeoutMs);

      const cleanup = () => {
        window.clearTimeout(timeoutId);
        ws.removeEventListener("open", handleOpen);
        ws.removeEventListener("error", handleError);
      };

      const handleOpen = () => {
        cleanup();
        this.retries = 0;
        this.onStatus?.("open");
        ws.send(
          JSON.stringify({
            type: "subscribe",
            channel: "traffic",
            options: {
              throttle_ms: this.throttleMs,
            },
          }),
        );
        resolve();
      };

      const handleError = () => {
        cleanup();
        reject(new Error("Traffic websocket failed to connect"));
      };

      ws.addEventListener("open", handleOpen);
      ws.addEventListener("error", handleError);
      ws.addEventListener("message", this.handleMessage);
      ws.addEventListener("close", this.handleClose);
    }).catch((error) => {
      this.scheduleReconnect("initial connect failed");
      throw error;
    });
  }

  sendPing(timestamp = Date.now()): void {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.websocket.send(JSON.stringify({ type: "ping", timestamp }));
  }

  disconnect(): void {
    this.manualClose = true;
    this.clearReconnectTimer();

    if (this.websocket) {
      this.websocket.removeEventListener("message", this.handleMessage);
      this.websocket.removeEventListener("close", this.handleClose);
      try {
        this.websocket.send(JSON.stringify({ type: "unsubscribe", channel: "traffic" }));
      } catch {
        // no-op
      }
      try {
        this.websocket.close();
      } catch {
        // no-op
      }
      this.websocket = null;
    }

    this.onStatus?.("closed", "manual disconnect", true);
  }

  isOpen(): boolean {
    return this.websocket?.readyState === WebSocket.OPEN;
  }

  private handleMessage = (event: MessageEvent<string>) => {
    let parsed: TrafficWsMessage;
    try {
      parsed = JSON.parse(event.data) as TrafficWsMessage;
    } catch {
      this.onError?.("Invalid websocket payload");
      return;
    }

    const messageType = typeof parsed.type === "string" ? parsed.type : "";
    if (messageType === "traffic_state") {
      const data = parsed.data;
      const seq = typeof parsed.seq === "number" ? parsed.seq : null;
      if (data && typeof data === "object") {
        this.onTrafficState?.(data as TrafficStateResponse, seq);
      }
      return;
    }

    if (messageType === "error") {
      const message = typeof parsed.message === "string" ? parsed.message : "Traffic websocket server error";
      this.onError?.(message);
    }
  };

  private handleClose = () => {
    this.websocket?.removeEventListener("message", this.handleMessage);
    this.websocket?.removeEventListener("close", this.handleClose);
    this.websocket = null;

    if (this.manualClose) {
      this.onStatus?.("closed", "manual disconnect", true);
      return;
    }

    this.scheduleReconnect("socket closed");
  };

  private scheduleReconnect(reason: string): void {
    if (this.manualClose) {
      return;
    }
    if (this.retries >= this.maxRetries) {
      this.onStatus?.("closed", reason, false);
      return;
    }

    this.retries += 1;
    const delay = Math.min(this.maxRetryMs, this.baseRetryMs * 2 ** (this.retries - 1));
    this.onStatus?.("reconnecting", `${reason}; retry in ${delay}ms`, false);

    this.clearReconnectTimer();
    this.reconnectTimer = window.setTimeout(() => {
      void this.connect().catch((error) => {
        this.onError?.(error instanceof Error ? error.message : "Traffic websocket reconnect failed");
      });
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer != null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
