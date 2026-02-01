/**
 * Message types for communication between the prompt server and widget.
 * These types are shared between:
 * - cli/server/promptServer.ts (server side)
 * - widget/services/websocket.ts (client side - Phase 4)
 */

// Incoming message from widget
export interface PromptMessage {
  type: "prompt";
  id?: string;
  content: string;
}

// Outgoing messages to widget
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
  status: "idle" | "processing" | "connected";
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

export type OutgoingMessage =
  | StreamMessage
  | ToolMessage
  | StatusMessage
  | ResultMessage
  | ErrorMessage;

export type IncomingMessage = PromptMessage;
