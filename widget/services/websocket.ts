/**
 * WebSocket client for connecting to the expo-air prompt server.
 * Handles connection lifecycle, message parsing, and reconnection.
 */

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "sending" | "processing";

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
  branchName?: string;
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

export interface SessionClearedMessage {
  type: "session_cleared";
  timestamp: number;
}

export interface StoppedMessage {
  type: "stopped";
  timestamp: number;
}

export interface ConversationEntry {
  role: "user" | "assistant";
  content: string;
  imagePaths?: string[];
  timestamp: number;
}

// Tool conversation entry for persisted tool executions
export interface ToolConversationEntry {
  role: "tool";
  toolName: string;
  status: "started" | "completed" | "failed";
  input?: unknown;
  output?: unknown;
  timestamp: number;
}

// System conversation entry for errors, stops, etc.
export interface SystemConversationEntry {
  role: "system";
  type: "error" | "stopped" | "info";
  content: string;
  timestamp: number;
}

// Union of all entry types
export type AnyConversationEntry = ConversationEntry | ToolConversationEntry | SystemConversationEntry;

export interface HistoryMessage {
  type: "history";
  entries: AnyConversationEntry[];
  timestamp: number;
}

export interface ImageAttachment {
  uri: string;
  width?: number;
  height?: number;
}

// Local display-only message for showing user prompts in the UI
export interface UserPromptMessage {
  type: "user_prompt";
  content: string;
  images?: ImageAttachment[];
  pending?: boolean;
  timestamp: number;
}

// Local display-only message for showing assistant responses from history
export interface HistoryResultMessage {
  type: "history_result";
  content: string;
  timestamp: number;
}

// Local display-only message for showing system messages (errors, stops) from history
export interface SystemDisplayMessage {
  type: "system_message";
  messageType: "error" | "stopped" | "info";
  content: string;
  timestamp: number;
}

// Part types for interleaved assistant responses (text + tools in order)
export interface TextPart {
  type: "text";
  id: string;
  content: string;
}

export interface ToolPart {
  type: "tool";
  id: string;
  toolName: string;
  status: "started" | "completed" | "failed";
  input?: unknown;
  output?: unknown;
  timestamp: number;
}

export type AssistantPart = TextPart | ToolPart;

// Message containing interleaved parts (for completed responses)
export interface AssistantPartsMessage {
  type: "assistant_parts";
  promptId: string;
  parts: AssistantPart[];
  isComplete: boolean;
  timestamp: number;
}

export interface GitChange {
  file: string;
  status: "added" | "modified" | "deleted" | "renamed" | "untracked";
}

export interface BranchInfo {
  name: string;
  isCurrent: boolean;
  prNumber?: string;
  prTitle?: string;
  lastCommitDate?: string;
  isRemote?: boolean;
}

export interface BranchesListMessage {
  type: "branches_list";
  branches: BranchInfo[];
  timestamp: number;
}

export interface BranchSwitchedMessage {
  type: "branch_switched";
  branchName: string;
  success: boolean;
  error?: string;
  timestamp: number;
}

export interface BranchCreatedMessage {
  type: "branch_created";
  branchName: string;
  success: boolean;
  error?: string;
  timestamp: number;
}

export interface GitStatusMessage {
  type: "git_status";
  branchName: string;
  changes: GitChange[];
  hasPR: boolean;
  prUrl?: string;
  timestamp: number;
}

export type ServerMessage =
  | StreamMessage
  | ToolMessage
  | StatusMessage
  | ResultMessage
  | ErrorMessage
  | SessionClearedMessage
  | StoppedMessage
  | HistoryMessage
  | UserPromptMessage
  | HistoryResultMessage
  | SystemDisplayMessage
  | GitStatusMessage
  | AssistantPartsMessage
  | BranchesListMessage
  | BranchSwitchedMessage
  | BranchCreatedMessage;

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
          console.warn("[expo-air] Failed to parse message:", e);
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
    } else if (message.type === "stopped" || message.type === "session_cleared") {
      this.setStatus("connected");
    }

    this.options.onMessage(message);
  }

  private attemptReconnect() {
    if (!this.shouldReconnect) {
      return;
    }

    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      console.log("[expo-air] Max reconnect attempts reached");
      return;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectAttempts++;
    console.log(
      `[expo-air] Reconnecting... (attempt ${this.reconnectAttempts}/${this.options.maxReconnectAttempts})`
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

  async sendPrompt(content: string, imagePaths?: string[]): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.options.onError(new Error("Not connected"));
      return;
    }

    const message: Record<string, unknown> = {
      type: "prompt",
      content,
      id: generateId(),
    };

    if (imagePaths && imagePaths.length > 0) {
      try {
        console.log("[expo-air] Uploading", imagePaths.length, "image(s) to:", this.getUploadUrl());
        const serverPaths = await this.uploadImages(imagePaths);
        console.log("[expo-air] Upload returned paths:", serverPaths);
        if (serverPaths.length > 0) {
          message.imagePaths = serverPaths;
        }
      } catch (error) {
        console.error("[expo-air] Image upload failed:", error);
      }
    }

    this.ws.send(JSON.stringify(message));
    this.setStatus("sending");
  }

  private getUploadUrl(): string {
    let url = this.options.url;
    // ws:// → http://, wss:// → https://
    if (url.startsWith("wss://")) url = "https://" + url.slice(6);
    else if (url.startsWith("ws://")) url = "http://" + url.slice(5);
    // Insert /upload before the query string
    const qIndex = url.indexOf("?");
    if (qIndex >= 0) {
      return url.slice(0, qIndex) + "/upload" + url.slice(qIndex);
    }
    return url + "/upload";
  }

  private async uploadImages(localPaths: string[]): Promise<string[]> {
    const uploadUrl = this.getUploadUrl();

    const formData = new FormData();
    for (const path of localPaths) {
      const uri = path.startsWith("file://") ? path : `file://${path}`;
      const ext = path.split(".").pop()?.toLowerCase() || "jpg";
      const mimeType = ext === "png" ? "image/png" : "image/jpeg";
      formData.append("images", {
        uri,
        type: mimeType,
        name: `image.${ext}`,
      } as unknown as Blob);
    }

    const response = await fetch(uploadUrl, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Upload failed: ${response.status} ${text}`);
    }

    const result = await response.json();
    return result.paths || [];
  }

  requestNewSession(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.options.onError(new Error("Not connected"));
      return;
    }

    this.ws.send(JSON.stringify({ type: "new_session" }));
  }

  requestStop(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.options.onError(new Error("Not connected"));
      return;
    }

    this.ws.send(JSON.stringify({ type: "stop" }));
  }

  requestDiscardChanges(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.options.onError(new Error("Not connected"));
      return;
    }

    this.ws.send(JSON.stringify({ type: "discard_changes" }));
  }

  requestBranches(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    this.ws.send(JSON.stringify({ type: "list_branches" }));
  }

  requestSwitchBranch(branchName: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.options.onError(new Error("Not connected"));
      return;
    }

    this.ws.send(JSON.stringify({ type: "switch_branch", branchName }));
  }

  requestCreateBranch(branchName: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.options.onError(new Error("Not connected"));
      return;
    }

    this.ws.send(JSON.stringify({ type: "create_branch", branchName }));
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
