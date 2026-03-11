import type { WebSocket } from "ws";
import type { GitOperations } from "./gitOperations.js";
import type { OutgoingMessage, GitChange } from "../types/messages.js";
import { serverLog } from "./serverLogger.js";

export interface GitHandlerContext {
  git: GitOperations;
  clients: Set<WebSocket>;
  sendToClient: (ws: WebSocket, message: OutgoingMessage) => void;
  updateGitWatcherState: (branchName: string, changesHash: string) => void;
}

export function handleListBranches(ctx: GitHandlerContext, ws: WebSocket): void {
  const branches = ctx.git.getRecentBranches();
  ctx.sendToClient(ws, {
    type: "branches_list",
    branches,
    timestamp: Date.now(),
  });
  serverLog(`Sent ${branches.length} branches to client`, "info");
}

export function handleSwitchBranch(ctx: GitHandlerContext, ws: WebSocket, branchName: string): void {
  if (!ctx.git.isValidBranchName(branchName)) {
    ctx.sendToClient(ws, {
      type: "branch_switched",
      branchName,
      success: false,
      error: "Invalid branch name",
      timestamp: Date.now(),
    });
    return;
  }

  const currentBranchBeforeSwitch = ctx.git.getBranchName();
  const stash = ctx.git.autoStash(currentBranchBeforeSwitch);
  if (stash.error) {
    ctx.sendToClient(ws, {
      type: "branch_switched",
      branchName,
      success: false,
      error: `Failed to stash changes: ${stash.error}`,
      timestamp: Date.now(),
    });
    serverLog(`Failed to stash before switch: ${stash.error}`, "error");
    return;
  }
  if (stash.didStash) {
    serverLog(`Auto-stashed uncommitted changes for branch ${currentBranchBeforeSwitch}`, "info");
  }

  try {
    ctx.git.checkoutBranch(branchName);

    const pop = ctx.git.autoPopStash(branchName);
    if (pop.popped) {
      serverLog(`Restored auto-stashed changes for branch ${branchName}`, "info");
    } else if (pop.conflict) {
      serverLog("Warning: failed to pop auto-stash (possible merge conflict). Stash preserved.", "error");
      serverLog("Reset working directory after stash conflict", "info");
    }

    const currentBranch = ctx.git.getBranchName();
    const changes = ctx.git.getGitChanges();
    broadcastGitStatus(ctx, currentBranch, changes);

    ctx.sendToClient(ws, {
      type: "branch_switched",
      branchName: currentBranch,
      success: true,
      timestamp: Date.now(),
    });
    serverLog(`Switched to branch: ${currentBranch}`, "success");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (stash.didStash) {
      if (ctx.git.restoreStashAfterFailure()) {
        serverLog("Restored stash after failed checkout", "info");
      } else {
        serverLog("Warning: failed to restore stash after failed checkout", "error");
      }
    }
    ctx.sendToClient(ws, {
      type: "branch_switched",
      branchName,
      success: false,
      error: errorMessage,
      timestamp: Date.now(),
    });
    serverLog(`Failed to switch branch: ${errorMessage}`, "error");
  }
}

export function handleCreateBranch(ctx: GitHandlerContext, ws: WebSocket, branchName: string): void {
  if (!ctx.git.isValidBranchName(branchName)) {
    ctx.sendToClient(ws, {
      type: "branch_created",
      branchName,
      success: false,
      error: "Invalid branch name",
      timestamp: Date.now(),
    });
    return;
  }

  const currentBranchBeforeCreate = ctx.git.getBranchName();
  const stash = ctx.git.autoStash(currentBranchBeforeCreate);
  if (stash.error) {
    ctx.sendToClient(ws, {
      type: "branch_created",
      branchName,
      success: false,
      error: `Failed to stash changes: ${stash.error}`,
      timestamp: Date.now(),
    });
    serverLog(`Failed to stash before create: ${stash.error}`, "error");
    return;
  }
  if (stash.didStash) {
    serverLog(`Auto-stashed uncommitted changes for branch ${currentBranchBeforeCreate}`, "info");
  }

  try {
    ctx.git.createBranchFromMain(branchName);

    const currentBranch = ctx.git.getBranchName();
    const changes = ctx.git.getGitChanges();
    broadcastGitStatus(ctx, currentBranch, changes);

    ctx.sendToClient(ws, {
      type: "branch_created",
      branchName: currentBranch,
      success: true,
      timestamp: Date.now(),
    });
    serverLog(`Created new branch: ${currentBranch}`, "success");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (stash.didStash) {
      if (ctx.git.restoreStashAfterFailure()) {
        serverLog("Restored stash after failed branch creation", "info");
      } else {
        serverLog("Warning: failed to restore stash after failed branch creation", "error");
      }
    }
    ctx.sendToClient(ws, {
      type: "branch_created",
      branchName,
      success: false,
      error: errorMessage,
      timestamp: Date.now(),
    });
    serverLog(`Failed to create branch: ${errorMessage}`, "error");
  }
}

export function handleDiscardChanges(ctx: GitHandlerContext, ws: WebSocket): void {
  serverLog("Discarding all git changes...", "info");

  try {
    ctx.git.discardAllChanges();
    serverLog("All changes discarded", "success");

    const branchName = ctx.git.getBranchName();
    const changes = ctx.git.getGitChanges();
    broadcastGitStatus(ctx, branchName, changes);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    serverLog(`Failed to discard changes: ${errorMessage}`, "error");

    ctx.sendToClient(ws, {
      type: "error",
      message: `Failed to discard changes: ${errorMessage}`,
      timestamp: Date.now(),
    });
  }
}

export function broadcastGitStatus(ctx: GitHandlerContext, branchName: string, changes: GitChange[]): void {
  ctx.updateGitWatcherState(branchName, JSON.stringify(changes));

  const prStatus = ctx.git.getPRStatus();
  const message: OutgoingMessage = {
    type: "git_status",
    branchName,
    changes,
    hasPR: prStatus.hasPR,
    prUrl: prStatus.prUrl,
    timestamp: Date.now(),
  };

  for (const client of ctx.clients) {
    ctx.sendToClient(client, message);
  }

  serverLog(`Git status updated: ${branchName} (${changes.length} changes, PR: ${prStatus.hasPR})`, "info");
}
