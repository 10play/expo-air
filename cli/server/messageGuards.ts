import type {
  PromptMessage,
  NewSessionMessage,
  StopMessage,
  DiscardChangesMessage,
  ListBranchesMessage,
  SwitchBranchMessage,
  CreateBranchMessage,
} from "../types/messages.js";

export function isPromptMessage(message: unknown): message is PromptMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    (message as PromptMessage).type === "prompt" &&
    "content" in message &&
    typeof (message as PromptMessage).content === "string"
  );
}

export function isNewSessionMessage(message: unknown): message is NewSessionMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    (message as NewSessionMessage).type === "new_session"
  );
}

export function isStopMessage(message: unknown): message is StopMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    (message as StopMessage).type === "stop"
  );
}

export function isDiscardChangesMessage(message: unknown): message is DiscardChangesMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    (message as DiscardChangesMessage).type === "discard_changes"
  );
}

export function isListBranchesMessage(message: unknown): message is ListBranchesMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    (message as ListBranchesMessage).type === "list_branches"
  );
}

export function isSwitchBranchMessage(message: unknown): message is SwitchBranchMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    (message as SwitchBranchMessage).type === "switch_branch" &&
    "branchName" in message &&
    typeof (message as SwitchBranchMessage).branchName === "string"
  );
}

export function isCreateBranchMessage(message: unknown): message is CreateBranchMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    (message as CreateBranchMessage).type === "create_branch" &&
    "branchName" in message &&
    typeof (message as CreateBranchMessage).branchName === "string"
  );
}
