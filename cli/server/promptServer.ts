import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { type Server as HttpServer } from "http";
import { randomUUID } from "crypto";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { GitOperations } from "./gitOperations.js";
import { serverLog } from "./serverLogger.js";
import {
  isPromptMessage,
  isNewSessionMessage,
  isStopMessage,
  isDiscardChangesMessage,
  isListBranchesMessage,
  isSwitchBranchMessage,
  isCreateBranchMessage,
} from "./messageGuards.js";
import { createHttpHandler } from "./httpHandler.js";
import { loadSession, saveSession, clearSessionFromFile } from "./sessionManager.js";
import { persistImages, cleanupTempImages } from "./imageManager.js";
import {
  handleListBranches,
  handleSwitchBranch,
  handleCreateBranch,
  handleDiscardChanges,
  broadcastGitStatus,
  type GitHandlerContext,
} from "./gitHandlers.js";
import {
  executeWithSDK,
  createInitialSdkState,
  type SdkExecutorState,
} from "./sdkExecutor.js";
import type {
  OutgoingMessage,
  AnyConversationEntry,
  SystemConversationEntry,
} from "../types/messages.js";

export class PromptServer {
  private wss: WebSocketServer | null = null;
  private httpServer: HttpServer | null = null;
  private port: number;
  private clients: Set<WebSocket> = new Set();
  private projectRoot: string;
  private sessionId: string | null = null;
  private conversationHistory: AnyConversationEntry[] = [];
  private gitWatchInterval: ReturnType<typeof setInterval> | null = null;
  private lastBranchName: string = "";
  private lastGitChangesHash: string = "";
  private secret: string | null = null;
  private git: GitOperations;
  private sdkState: SdkExecutorState;

  constructor(port: number, projectRoot?: string, secret?: string | null) {
    this.port = port;
    this.projectRoot = projectRoot || process.cwd();
    this.secret = secret ?? null;
    this.git = new GitOperations(this.projectRoot);
    this.sdkState = createInitialSdkState();

    const session = loadSession(this.getConfigPath());
    this.sessionId = session.sessionId;
    this.conversationHistory = session.conversationHistory;
  }

  private getImageDir(): string {
    return join(this.projectRoot, ".expo-air-images");
  }

  private getConfigPath(): string {
    return join(this.projectRoot, ".expo-air.local.json");
  }

  // --- Git watcher ---

  private startGitWatcher(): void {
    this.lastBranchName = this.git.getBranchName();
    this.lastGitChangesHash = JSON.stringify(this.git.getGitChanges());

    this.gitWatchInterval = setInterval(() => {
      const currentBranch = this.git.getBranchName();
      const currentChanges = this.git.getGitChanges();
      const currentChangesHash = JSON.stringify(currentChanges);

      if (currentBranch !== this.lastBranchName || currentChangesHash !== this.lastGitChangesHash) {
        this.lastBranchName = currentBranch;
        this.lastGitChangesHash = currentChangesHash;
        broadcastGitStatus(this.gitCtx(), currentBranch, currentChanges);
      }
    }, 2000);
  }

  private stopGitWatcher(): void {
    if (this.gitWatchInterval) {
      clearInterval(this.gitWatchInterval);
      this.gitWatchInterval = null;
    }
  }

  // --- HMR ---

  private retriggerHMR(): void {
    const changes = this.git.getGitChanges();
    if (changes.length === 0) {
      serverLog("HMR retrigger: no uncommitted files to re-touch", "info");
      return;
    }

    const gitRoot = this.git.getGitRoot();
    serverLog(`HMR retrigger: re-touching ${changes.length} uncommitted files (root: ${gitRoot})`, "info");

    let touched = 0;
    for (const change of changes) {
      if (change.status === "deleted") {
        serverLog(`HMR retrigger: skipped ${change.file} (status: deleted)`, "info");
        continue;
      }
      try {
        let filePath = join(gitRoot, change.file);
        if (!existsSync(filePath) && this.projectRoot !== gitRoot) {
          filePath = join(this.projectRoot, change.file);
        }
        if (existsSync(filePath)) {
          const content = readFileSync(filePath);
          writeFileSync(filePath, content);
          touched++;
        } else {
          serverLog(`HMR retrigger: skipped ${change.file} (not found at ${filePath})`, "info");
        }
      } catch (e) {
        serverLog(`HMR retrigger: failed to re-touch ${change.file}: ${e}`, "error");
      }
    }
    serverLog(`HMR retrigger: done, re-touched ${touched} files`, "success");
  }

  // --- Context builders ---

  private gitCtx(): GitHandlerContext {
    return {
      git: this.git,
      clients: this.clients,
      sendToClient: (ws, msg) => this.sendToClient(ws, msg),
      updateGitWatcherState: (branch, hash) => {
        this.lastBranchName = branch;
        this.lastGitChangesHash = hash;
      },
    };
  }

  private sdkCtx() {
    return {
      projectRoot: this.projectRoot,
      sessionId: this.sessionId,
      conversationHistory: this.conversationHistory,
      broadcastToClients: (msg: OutgoingMessage) => this.broadcastToClients(msg),
      saveSession: () => saveSession(this.getConfigPath(), this.sessionId, this.conversationHistory),
      retriggerHMR: () => this.retriggerHMR(),
      setSessionId: (id: string) => { this.sessionId = id; },
    };
  }

  // --- Server lifecycle ---

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.httpServer = http.createServer(
        createHttpHandler({
          port: this.port,
          secret: this.secret,
          imageDir: this.getImageDir(),
          retriggerHMR: () => this.retriggerHMR(),
        })
      );

      this.wss = new WebSocketServer({
        server: this.httpServer,
        verifyClient: this.secret
          ? (info, cb) => {
              const url = new URL(info.req.url || "/", `http://localhost:${this.port}`);
              if (url.searchParams.get("secret") === this.secret) {
                cb(true);
              } else {
                serverLog("Rejected unauthorized WebSocket connection", "error");
                cb(false, 401, "Unauthorized");
              }
            }
          : undefined,
      });

      this.wss.on("error", (error) => {
        reject(error);
      });

      this.wss.on("connection", (ws) => {
        this.handleConnection(ws);
      });

      this.httpServer.listen(this.port, () => {
        this.startGitWatcher();
        resolve();
      });

      this.httpServer.on("error", (error) => {
        reject(error);
      });
    });
  }

  async stop(): Promise<void> {
    this.stopGitWatcher();

    if (this.sdkState.abortController) {
      this.sdkState.abortController.abort();
      this.sdkState.abortController = null;
    }

    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();

    return new Promise((resolve) => {
      const closeHttp = () => {
        if (this.httpServer) {
          this.httpServer.close(() => resolve());
        } else {
          resolve();
        }
      };
      if (this.wss) {
        this.wss.close(() => closeHttp());
      } else {
        closeHttp();
      }
    });
  }

  // --- Connection & message handling ---

  private handleConnection(ws: WebSocket): void {
    this.clients.add(ws);
    serverLog("Client connected", "info");

    this.sendToClient(ws, {
      type: "status",
      status: "connected",
      timestamp: Date.now(),
    });

    if (this.conversationHistory.length > 0) {
      this.sendToClient(ws, {
        type: "history",
        entries: this.conversationHistory,
        timestamp: Date.now(),
      });
      serverLog(`Sent ${this.conversationHistory.length} history entries to client`, "info");
    }

    // Replay active query state to reconnecting clients
    if (this.sdkState.currentQuery !== null && this.sdkState.activePromptId !== null) {
      this.sendToClient(ws, {
        type: "status",
        status: "processing",
        promptId: this.sdkState.activePromptId,
        timestamp: Date.now(),
      });

      if (this.sdkState.currentStreamedResponse) {
        this.sendToClient(ws, {
          type: "stream",
          promptId: this.sdkState.activePromptId,
          chunk: this.sdkState.currentStreamedResponse,
          done: false,
          timestamp: Date.now(),
        });
      }
      serverLog("Replayed active query state to reconnected client", "info");
    }

    // Send initial git status
    const branchName = this.git.getBranchName();
    const changes = this.git.getGitChanges();
    const prStatus = this.git.getPRStatus();
    this.sendToClient(ws, {
      type: "git_status",
      branchName,
      changes,
      hasPR: prStatus.hasPR,
      prUrl: prStatus.prUrl,
      timestamp: Date.now(),
    });

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(ws, message);
      } catch {
        this.sendToClient(ws, {
          type: "error",
          message: "Invalid JSON message",
          timestamp: Date.now(),
        });
      }
    });

    ws.on("close", () => {
      this.clients.delete(ws);
      serverLog("Client disconnected", "info");
    });

    ws.on("error", (error) => {
      serverLog(`WebSocket error: ${error.message}`, "error");
      this.clients.delete(ws);
    });
  }

  private handleMessage(ws: WebSocket, message: unknown): void {
    if (isNewSessionMessage(message)) {
      this.handleNewSession(ws);
      return;
    }

    if (isStopMessage(message)) {
      this.handleStop(ws);
      return;
    }

    if (isDiscardChangesMessage(message)) {
      handleDiscardChanges(this.gitCtx(), ws);
      return;
    }

    if (isListBranchesMessage(message)) {
      handleListBranches(this.gitCtx(), ws);
      return;
    }

    if (isSwitchBranchMessage(message)) {
      handleSwitchBranch(this.gitCtx(), ws, message.branchName);
      return;
    }

    if (isCreateBranchMessage(message)) {
      handleCreateBranch(this.gitCtx(), ws, message.branchName);
      return;
    }

    if (isPromptMessage(message)) {
      const promptId = message.id || randomUUID();
      serverLog(
        `Received prompt: ${message.content.substring(0, 50)}...`,
        "prompt"
      );

      let persistedImagePaths: string[] | undefined;
      if (message.imagePaths && message.imagePaths.length > 0) {
        persistedImagePaths = persistImages(message.imagePaths, this.getImageDir());
        serverLog(`Prompt includes ${message.imagePaths.length} image(s)`, "info");
      }

      executeWithSDK(this.sdkCtx(), this.sdkState, promptId, message.content, persistedImagePaths);
      return;
    }

    this.sendToClient(ws, {
      type: "error",
      message:
        'Invalid message format. Expected: {"type":"prompt","content":"..."} or {"type":"new_session"} or {"type":"stop"} or {"type":"discard_changes"}',
      timestamp: Date.now(),
    });
  }

  private handleNewSession(ws: WebSocket): void {
    if (this.sdkState.abortController) {
      this.sdkState.abortController.abort();
      this.sdkState.abortController = null;
    }
    this.sdkState.currentQuery = null;

    this.sessionId = null;
    this.conversationHistory = [];
    clearSessionFromFile(this.getConfigPath());

    cleanupTempImages(this.getImageDir());

    this.sendToClient(ws, {
      type: "session_cleared",
      timestamp: Date.now(),
    });

    serverLog("Session cleared - starting fresh", "info");
  }

  private handleStop(ws: WebSocket): void {
    if (this.sdkState.abortController) {
      this.sdkState.abortController.abort();
      serverLog("Query stopped by user", "info");

      const stoppedEntry: SystemConversationEntry = {
        role: "system",
        type: "stopped",
        content: "Stopped by user",
        timestamp: Date.now(),
      };
      this.conversationHistory.push(stoppedEntry);
    }
    saveSession(this.getConfigPath(), this.sessionId, this.conversationHistory);

    this.sendToClient(ws, {
      type: "stopped",
      timestamp: Date.now(),
    });
  }

  // --- Client communication ---

  private sendToClient(ws: WebSocket, message: OutgoingMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private broadcastToClients(message: OutgoingMessage): void {
    for (const client of this.clients) {
      this.sendToClient(client, message);
    }
  }
}
