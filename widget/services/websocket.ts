/**
 * WebSocket client for connecting to the expo-flow prompt server.
 * Handles connection lifecycle, message parsing, and reconnection.
 */

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "processing";

export interface StreamMessage {
  type: "stream";
  promptId: string;
  chunk: string;
  done: boolean;
  timestamp: number;
}

export interface ToolMessage {
  type: "tool";
  promptId: string;
  toolName: string;
  status: "started" | "completed" | "failed";
  input?: unknown;
  output?: unknown;
  timestamp: number;
}

export interface StatusMessage {
  type: "status";
  status: "connected" | "processing" | "idle";
  promptId?: string;
  timestamp: number;
}

export interface ResultMessage {
  type: "result";
  promptId: string;
  success: boolean;
  result?: string;
  error?: string;
  costUsd?: number;
  durationMs?: number;
  timestamp: number;
}

export interface ErrorMessage {
  type: "error";
  promptId?: string;
  message: string;
  timestamp: number;
}

export type ServerMessage =
  | StreamMessage
  | ToolMessage
  | StatusMessage
  | ResultMessage
  | ErrorMessage;

export interface WebSocketClientOptions {
  url: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onMessage?: (message: ServerMessage) => void;
  onError?: (error: Error) => void;
  onStatusChange?: (status: ConnectionStatus) => void;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private options: Required<WebSocketClientOptions>;
  private reconnectAttempts = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private _status: ConnectionStatus = "disconnected";
  private shouldReconnect = true;

  constructor(options: WebSocketClientOptions) {
    this.options = {
      reconnectInterval: 3000,
      maxReconnectAttempts: 10,
      onConnect: () => {},
      onDisconnect: () => {},
      onMessage: () => {},
      onError: () => {},
      onStatusChange: () => {},
      ...options,
    };
  }

  get status(): ConnectionStatus {
    return this._status;
  }

  private setStatus(status: ConnectionStatus) {
    this._status = status;
    this.options.onStatusChange(status);
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    this.shouldReconnect = true;
    this.setStatus("connecting");

    try {
      this.ws = new WebSocket(this.options.url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.setStatus("connected");
        this.options.onConnect();
      };

      this.ws.onclose = () => {
        this.setStatus("disconnected");
        this.options.onDisconnect();
        this.attemptReconnect();
      };

      this.ws.onerror = () => {
        const error = new Error("WebSocket error");
        this.options.onError(error);
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as ServerMessage;
          this.handleMessage(message);
        } catch (e) {
          console.error("[expo-flow] Failed to parse message:", e);
        }
      };
    } catch (e) {
      this.options.onError(e as Error);
      this.attemptReconnect();
    }
  }

  private handleMessage(message: ServerMessage) {
    // Update status based on message type
    if (message.type === "status") {
      if (message.status === "processing") {
        this.setStatus("processing");
      } else if (message.status === "idle" || message.status === "connected") {
        this.setStatus("connected");
      }
    } else if (message.type === "result" || message.type === "error") {
      this.setStatus("connected");
    }

    this.options.onMessage(message);
  }

  private attemptReconnect() {
    if (!this.shouldReconnect) {
      return;
    }

    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      console.log("[expo-flow] Max reconnect attempts reached");
      return;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectAttempts++;
    console.log(
      `[expo-flow] Reconnecting... (attempt ${this.reconnectAttempts}/${this.options.maxReconnectAttempts})`
    );

    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, this.options.reconnectInterval);
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setStatus("disconnected");
  }

  sendPrompt(content: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.options.onError(new Error("Not connected"));
      return;
    }

    const message = {
      type: "prompt",
      content,
      id: generateId(),
    };

    this.ws.send(JSON.stringify(message));
    this.setStatus("processing");
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

// Singleton instance for app-wide use
let clientInstance: WebSocketClient | null = null;

export function getWebSocketClient(): WebSocketClient | null {
  return clientInstance;
}

export function createWebSocketClient(
  options: WebSocketClientOptions
): WebSocketClient {
  if (clientInstance) {
    clientInstance.disconnect();
  }
  clientInstance = new WebSocketClient(options);
  return clientInstance;
}
