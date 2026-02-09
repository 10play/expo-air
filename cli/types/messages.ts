/**
 * Message types for communication between the prompt server and widget.
 * These types are shared between:
 * - cli/server/promptServer.ts (server side)
 * - widget/services/websocket.ts (client side - Phase 4)
 */

// Incoming messages from widget
export interface PromptMessage {
  type: "prompt";
  id?: string;
  content: string;
  imagePaths?: string[];
}

export interface NewSessionMessage {
  type: "new_session";
}

export interface StopMessage {
  type: "stop";
}

export interface DiscardChangesMessage {
  type: "discard_changes";
}

export interface RegisterPushTokenMessage {
  type: "register_push_token";
  token: string;
}

export interface ListBranchesMessage {
  type: "list_branches";
}

export interface SwitchBranchMessage {
  type: "switch_branch";
  branchName: string;
}

export interface CreateBranchMessage {
  type: "create_branch";
  branchName: string;
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
  branchName?: string;
  timestamp: number;
}

export interface GitChange {
  file: string;
  status: "added" | "modified" | "deleted" | "renamed" | "untracked";
}

export interface GitStatusMessage {
  type: "git_status";
  branchName: string;
  changes: GitChange[];
  hasPR: boolean;
  prUrl?: string;
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

export interface PushTokenAckMessage {
  type: "push_token_ack";
  success: boolean;
  timestamp: number;
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

export interface ConversationEntry {
  role: "user" | "assistant";
  content: string;
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

export type OutgoingMessage =
  | StreamMessage
  | ToolMessage
  | StatusMessage
  | ResultMessage
  | ErrorMessage
  | SessionClearedMessage
  | StoppedMessage
  | HistoryMessage
  | GitStatusMessage
  | PushTokenAckMessage
  | BranchesListMessage
  | BranchSwitchedMessage
  | BranchCreatedMessage;

export type IncomingMessage =
  | PromptMessage
  | NewSessionMessage
  | StopMessage
  | DiscardChangesMessage
  | RegisterPushTokenMessage
  | ListBranchesMessage
  | SwitchBranchMessage
  | CreateBranchMessage;
