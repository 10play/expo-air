import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { type Server as HttpServer } from "http";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { randomUUID } from "crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, copyFileSync } from "fs";
import { join } from "path";
import chalk from "chalk";
import { GitOperations } from "./gitOperations.js";
import type {
  PromptMessage,
  NewSessionMessage,
  StopMessage,
  DiscardChangesMessage,
  RegisterPushTokenMessage,
  ListBranchesMessage,
  SwitchBranchMessage,
  CreateBranchMessage,
  OutgoingMessage,
  AnyConversationEntry,
  ToolConversationEntry,
  SystemConversationEntry,
  GitChange,
} from "../types/messages.js";

export class PromptServer {
  private wss: WebSocketServer | null = null;
  private httpServer: HttpServer | null = null;
  private port: number;
  private clients: Set<WebSocket> = new Set();
  private currentQuery: ReturnType<typeof query> | null = null;
  private abortController: AbortController | null = null;
  private projectRoot: string;
  private sessionId: string | null = null;
  private conversationHistory: AnyConversationEntry[] = [];
  private gitWatchInterval: ReturnType<typeof setInterval> | null = null;
  private lastBranchName: string = "";
  private lastGitChangesHash: string = "";
  private pushToken: string | null = null;
  private currentStreamedResponse: string = "";
  private lastToolInput: unknown = undefined;
  private secret: string | null = null;
  private activePromptId: string | null = null;
  private git: GitOperations;

  constructor(port: number, projectRoot?: string, secret?: string | null) {
    this.port = port;
    this.projectRoot = projectRoot || process.cwd();
    this.secret = secret ?? null;
    this.git = new GitOperations(this.projectRoot);
    this.loadSession();
  }

  private getImageDir(): string {
    return join(this.projectRoot, ".expo-air-images");
  }

  private startGitWatcher(): void {
    // Initial state
    this.lastBranchName = this.git.getBranchName();
    this.lastGitChangesHash = JSON.stringify(this.git.getGitChanges());

    // Poll every 2 seconds for changes
    this.gitWatchInterval = setInterval(() => {
      const currentBranch = this.git.getBranchName();
      const currentChanges = this.git.getGitChanges();
      const currentChangesHash = JSON.stringify(currentChanges);

      // Check if anything changed
      if (currentBranch !== this.lastBranchName || currentChangesHash !== this.lastGitChangesHash) {
        this.lastBranchName = currentBranch;
        this.lastGitChangesHash = currentChangesHash;

        // Broadcast to all clients
        this.broadcastGitStatus(currentBranch, currentChanges);
      }
    }, 2000);
  }

  private stopGitWatcher(): void {
    if (this.gitWatchInterval) {
      clearInterval(this.gitWatchInterval);
      this.gitWatchInterval = null;
    }
  }

  private handleListBranches(ws: WebSocket): void {
    const branches = this.git.getRecentBranches();
    this.sendToClient(ws, {
      type: "branches_list",
      branches,
      timestamp: Date.now(),
    });
    this.log(`Sent ${branches.length} branches to client`, "info");
  }

  private handleSwitchBranch(ws: WebSocket, branchName: string): void {
    if (!this.git.isValidBranchName(branchName)) {
      this.sendToClient(ws, {
        type: "branch_switched",
        branchName,
        success: false,
        error: "Invalid branch name",
        timestamp: Date.now(),
      });
      return;
    }

    const currentBranchBeforeSwitch = this.git.getBranchName();
    const stash = this.git.autoStash(currentBranchBeforeSwitch);
    if (stash.error) {
      this.sendToClient(ws, {
        type: "branch_switched",
        branchName,
        success: false,
        error: `Failed to stash changes: ${stash.error}`,
        timestamp: Date.now(),
      });
      this.log(`Failed to stash before switch: ${stash.error}`, "error");
      return;
    }
    if (stash.didStash) {
      this.log(`Auto-stashed uncommitted changes for branch ${currentBranchBeforeSwitch}`, "info");
    }

    try {
      this.git.checkoutBranch(branchName);

      const pop = this.git.autoPopStash(branchName);
      if (pop.popped) {
        this.log(`Restored auto-stashed changes for branch ${branchName}`, "info");
      } else if (pop.conflict) {
        this.log("Warning: failed to pop auto-stash (possible merge conflict). Stash preserved.", "error");
        this.log("Reset working directory after stash conflict", "info");
      }

      const currentBranch = this.git.getBranchName();
      const changes = this.git.getGitChanges();
      this.broadcastGitStatus(currentBranch, changes);

      this.sendToClient(ws, {
        type: "branch_switched",
        branchName: currentBranch,
        success: true,
        timestamp: Date.now(),
      });
      this.log(`Switched to branch: ${currentBranch}`, "success");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (stash.didStash) {
        if (this.git.restoreStashAfterFailure()) {
          this.log("Restored stash after failed checkout", "info");
        } else {
          this.log("Warning: failed to restore stash after failed checkout", "error");
        }
      }
      this.sendToClient(ws, {
        type: "branch_switched",
        branchName,
        success: false,
        error: errorMessage,
        timestamp: Date.now(),
      });
      this.log(`Failed to switch branch: ${errorMessage}`, "error");
    }
  }

  private handleCreateBranch(ws: WebSocket, branchName: string): void {
    if (!this.git.isValidBranchName(branchName)) {
      this.sendToClient(ws, {
        type: "branch_created",
        branchName,
        success: false,
        error: "Invalid branch name",
        timestamp: Date.now(),
      });
      return;
    }

    const currentBranchBeforeCreate = this.git.getBranchName();
    const stash = this.git.autoStash(currentBranchBeforeCreate);
    if (stash.error) {
      this.sendToClient(ws, {
        type: "branch_created",
        branchName,
        success: false,
        error: `Failed to stash changes: ${stash.error}`,
        timestamp: Date.now(),
      });
      this.log(`Failed to stash before create: ${stash.error}`, "error");
      return;
    }
    if (stash.didStash) {
      this.log(`Auto-stashed uncommitted changes for branch ${currentBranchBeforeCreate}`, "info");
    }

    try {
      this.git.createBranchFromMain(branchName);

      const currentBranch = this.git.getBranchName();
      const changes = this.git.getGitChanges();
      this.broadcastGitStatus(currentBranch, changes);

      this.sendToClient(ws, {
        type: "branch_created",
        branchName: currentBranch,
        success: true,
        timestamp: Date.now(),
      });
      this.log(`Created new branch: ${currentBranch}`, "success");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (stash.didStash) {
        if (this.git.restoreStashAfterFailure()) {
          this.log("Restored stash after failed branch creation", "info");
        } else {
          this.log("Warning: failed to restore stash after failed branch creation", "error");
        }
      }
      this.sendToClient(ws, {
        type: "branch_created",
        branchName,
        success: false,
        error: errorMessage,
        timestamp: Date.now(),
      });
      this.log(`Failed to create branch: ${errorMessage}`, "error");
    }
  }

  private broadcastGitStatus(branchName: string, changes: GitChange[]): void {
    this.lastBranchName = branchName;
    this.lastGitChangesHash = JSON.stringify(changes);

    const prStatus = this.git.getPRStatus();
    const message: OutgoingMessage = {
      type: "git_status",
      branchName,
      changes,
      hasPR: prStatus.hasPR,
      prUrl: prStatus.prUrl,
      timestamp: Date.now(),
    };

    for (const client of this.clients) {
      this.sendToClient(client, message);
    }

    this.log(`Git status updated: ${branchName} (${changes.length} changes, PR: ${prStatus.hasPR})`, "info");
  }

  private retriggerHMR(): void {
    const changes = this.git.getGitChanges();
    if (changes.length === 0) {
      this.log("HMR retrigger: no uncommitted files to re-touch", "info");
      return;
    }

    // git status returns paths relative to the repo root, not projectRoot
    const gitRoot = this.git.getGitRoot();
    this.log(`HMR retrigger: re-touching ${changes.length} uncommitted files (root: ${gitRoot})`, "info");

    let touched = 0;
    for (const change of changes) {
      if (change.status === "deleted") {
        this.log(`HMR retrigger: skipped ${change.file} (status: deleted)`, "info");
        continue;
      }
      try {
        let filePath = join(gitRoot, change.file);
        // Fallback: git status paths may be relative to cwd (projectRoot) instead of repo root
        if (!existsSync(filePath) && this.projectRoot !== gitRoot) {
          filePath = join(this.projectRoot, change.file);
        }
        if (existsSync(filePath)) {
          const content = readFileSync(filePath);
          writeFileSync(filePath, content); // Same content, new mtime → Metro re-pushes HMR
          touched++;
        } else {
          this.log(`HMR retrigger: skipped ${change.file} (not found at ${filePath})`, "info");
        }
      } catch (e) {
        this.log(`HMR retrigger: failed to re-touch ${change.file}: ${e}`, "error");
      }
    }
    this.log(`HMR retrigger: done, re-touched ${touched} files`, "success");
  }

  private getConfigPath(): string {
    return join(this.projectRoot, ".expo-air.local.json");
  }

  private loadSession(): void {
    try {
      const configPath = this.getConfigPath();
      if (existsSync(configPath)) {
        const config = JSON.parse(readFileSync(configPath, "utf-8"));
        if (config.sessionId) {
          this.sessionId = config.sessionId;
          this.log(`Loaded session: ${this.sessionId}`, "info");
        }
        if (config.conversationHistory && Array.isArray(config.conversationHistory)) {
          this.conversationHistory = config.conversationHistory;
          this.log(`Loaded ${this.conversationHistory.length} history entries`, "info");
        }
      }
    } catch (error) {
      this.log("Failed to load session from config", "error");
    }
  }

  private saveSession(): void {
    try {
      const configPath = this.getConfigPath();
      let config: Record<string, unknown> = {};
      if (existsSync(configPath)) {
        config = JSON.parse(readFileSync(configPath, "utf-8"));
      }
      config.sessionId = this.sessionId;
      config.conversationHistory = this.conversationHistory;
      writeFileSync(configPath, JSON.stringify(config, null, 2));
      this.log(`Saved session with ${this.conversationHistory.length} history entries`, "info");
    } catch (error) {
      this.log("Failed to save session to config", "error");
    }
  }

  private clearSessionFromFile(): void {
    try {
      const configPath = this.getConfigPath();
      if (existsSync(configPath)) {
        const config = JSON.parse(readFileSync(configPath, "utf-8"));
        delete config.sessionId;
        delete config.conversationHistory;
        writeFileSync(configPath, JSON.stringify(config, null, 2));
      }
    } catch (error) {
      this.log("Failed to clear session from config", "error");
    }
  }

  private cleanupTempImages(): void {
    const imageDir = this.getImageDir();
    if (existsSync(imageDir)) {
      try {
        rmSync(imageDir, { recursive: true, force: true });
        this.log("Cleaned up temp images", "info");
      } catch (error) {
        this.log(`Failed to clean temp images: ${error}`, "error");
      }
    }
  }

  private persistImages(sourcePaths: string[]): string[] {
    const imageDir = this.getImageDir();
    if (!existsSync(imageDir)) {
      mkdirSync(imageDir, { recursive: true });
    }
    const persisted: string[] = [];
    for (const src of sourcePaths) {
      try {
        if (!existsSync(src)) {
          this.log(`Image file not found, skipping: ${src}`, "error");
          continue;
        }
        const ext = src.split(".").pop() || "png";
        const dest = join(imageDir, `${randomUUID()}.${ext}`);
        copyFileSync(src, dest);
        persisted.push(dest);
      } catch (error) {
        this.log(`Failed to persist image ${src}: ${error}`, "error");
      }
    }
    return persisted;
  }

  private handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const reqUrl = new URL(req.url || "/", `http://localhost:${this.port}`);

    // CORS headers for the widget
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Validate secret for all non-OPTIONS requests
    if (this.secret && reqUrl.searchParams.get("secret") !== this.secret) {
      this.log("Rejected unauthorized HTTP request", "error");
      res.writeHead(401);
      res.end("Unauthorized");
      return;
    }

    if (req.method === "POST" && reqUrl.pathname === "/upload") {
      this.handleUpload(req, res);
      return;
    }

    if (reqUrl.pathname === "/hmr-retrigger" && req.method === "POST") {
      this.retriggerHMR();
      res.writeHead(200);
      res.end("OK");
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  }

  private handleUpload(req: http.IncomingMessage, res: http.ServerResponse): void {
    const contentType = req.headers["content-type"] || "";

    if (!contentType.includes("multipart/form-data")) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Expected multipart/form-data" }));
      return;
    }

    const boundaryMatch = contentType.match(/boundary=(.+)/);
    if (!boundaryMatch) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "No boundary in content-type" }));
      return;
    }

    const boundary = boundaryMatch[1];
    const chunks: Buffer[] = [];

    req.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    req.on("end", () => {
      try {
        const body = Buffer.concat(chunks);
        const paths = this.parseMultipartAndSave(body, boundary);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ paths }));
        this.log(`Uploaded ${paths.length} image(s)`, "info");
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.log(`Upload error: ${msg}`, "error");
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: msg }));
      }
    });

    req.on("error", (error) => {
      this.log(`Upload stream error: ${error.message}`, "error");
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error.message }));
    });
  }

  private parseMultipartAndSave(body: Buffer, boundary: string): string[] {
    const imageDir = this.getImageDir();
    if (!existsSync(imageDir)) {
      mkdirSync(imageDir, { recursive: true });
    }

    const paths: string[] = [];
    const boundaryBuffer = Buffer.from(`--${boundary}`);
    const parts = this.splitBuffer(body, boundaryBuffer);

    for (const part of parts) {
      // Skip empty parts and the closing boundary
      const partStr = part.toString("utf-8", 0, Math.min(part.length, 500));
      if (partStr.trim() === "" || partStr.trim() === "--") continue;

      // Find the double CRLF that separates headers from body
      const headerEnd = this.findDoubleCRLF(part);
      if (headerEnd === -1) continue;

      const headers = part.toString("utf-8", 0, headerEnd);
      const fileData = part.subarray(headerEnd + 4); // Skip \r\n\r\n

      // Extract filename from Content-Disposition
      const filenameMatch = headers.match(/filename="([^"]+)"/);
      if (!filenameMatch) continue;

      // Determine extension from content-type or filename
      const ctMatch = headers.match(/Content-Type:\s*image\/(\w+)/i);
      const ext = ctMatch ? ctMatch[1].replace("jpeg", "jpg") : "png";
      const filename = `${randomUUID()}.${ext}`;
      const filePath = join(imageDir, filename);

      // Strip trailing \r\n if present
      let endOffset = fileData.length;
      if (endOffset >= 2 && fileData[endOffset - 2] === 0x0d && fileData[endOffset - 1] === 0x0a) {
        endOffset -= 2;
      }

      writeFileSync(filePath, fileData.subarray(0, endOffset));
      paths.push(filePath);
    }

    return paths;
  }

  private splitBuffer(buffer: Buffer, delimiter: Buffer): Buffer[] {
    const parts: Buffer[] = [];
    let start = 0;

    while (start < buffer.length) {
      const idx = buffer.indexOf(delimiter, start);
      if (idx === -1) {
        parts.push(buffer.subarray(start));
        break;
      }
      if (idx > start) {
        parts.push(buffer.subarray(start, idx));
      }
      start = idx + delimiter.length;
    }

    return parts;
  }

  private findDoubleCRLF(buffer: Buffer): number {
    for (let i = 0; i < buffer.length - 3; i++) {
      if (
        buffer[i] === 0x0d &&
        buffer[i + 1] === 0x0a &&
        buffer[i + 2] === 0x0d &&
        buffer[i + 3] === 0x0a
      ) {
        return i;
      }
    }
    return -1;
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.httpServer = http.createServer((req, res) => this.handleHttpRequest(req, res));
      this.wss = new WebSocketServer({
        server: this.httpServer,
        verifyClient: this.secret
          ? (info, cb) => {
              const url = new URL(info.req.url || "/", `http://localhost:${this.port}`);
              if (url.searchParams.get("secret") === this.secret) {
                cb(true);
              } else {
                this.log("Rejected unauthorized WebSocket connection", "error");
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
    // Stop git watcher
    this.stopGitWatcher();

    // Abort any running query
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    // Close all client connections
    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();

    // Close servers
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

  private handleConnection(ws: WebSocket): void {
    this.clients.add(ws);
    this.log("Client connected", "info");

    // Send connected status
    this.sendToClient(ws, {
      type: "status",
      status: "connected",
      timestamp: Date.now(),
    });

    // Send conversation history if we have any
    if (this.conversationHistory.length > 0) {
      this.sendToClient(ws, {
        type: "history",
        entries: this.conversationHistory,
        timestamp: Date.now(),
      });
      this.log(`Sent ${this.conversationHistory.length} history entries to client`, "info");
    }

    // If a query is currently running, replay its state to the new client
    if (this.currentQuery !== null && this.activePromptId !== null) {
      this.sendToClient(ws, {
        type: "status",
        status: "processing",
        promptId: this.activePromptId,
        timestamp: Date.now(),
      });

      if (this.currentStreamedResponse) {
        this.sendToClient(ws, {
          type: "stream",
          promptId: this.activePromptId,
          chunk: this.currentStreamedResponse,
          done: false,
          timestamp: Date.now(),
        });
      }
      this.log("Replayed active query state to reconnected client", "info");
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
      this.log("Client disconnected", "info");
    });

    ws.on("error", (error) => {
      this.log(`WebSocket error: ${error.message}`, "error");
      this.clients.delete(ws);
    });
  }

  private handleMessage(ws: WebSocket, message: unknown): void {
    // Handle new session request
    if (this.isNewSessionMessage(message)) {
      this.handleNewSession(ws);
      return;
    }

    // Handle stop request
    if (this.isStopMessage(message)) {
      this.handleStop(ws);
      return;
    }

    // Handle discard changes request
    if (this.isDiscardChangesMessage(message)) {
      this.handleDiscardChanges(ws);
      return;
    }

    // Handle push token registration
    if (this.isRegisterPushTokenMessage(message)) {
      this.pushToken = message.token;
      this.sendToClient(ws, {
        type: "push_token_ack",
        success: true,
        timestamp: Date.now(),
      });
      this.log("Push token registered", "info");
      return;
    }

    // Handle branch operations
    if (this.isListBranchesMessage(message)) {
      this.handleListBranches(ws);
      return;
    }

    if (this.isSwitchBranchMessage(message)) {
      this.handleSwitchBranch(ws, message.branchName);
      return;
    }

    if (this.isCreateBranchMessage(message)) {
      this.handleCreateBranch(ws, message.branchName);
      return;
    }

    // Handle prompt message
    if (this.isPromptMessage(message)) {
      const promptId = message.id || randomUUID();
      this.log(
        `Received prompt: ${message.content.substring(0, 50)}...`,
        "prompt"
      );

      // Persist images to stable location and track paths
      let persistedImagePaths: string[] | undefined;
      if (message.imagePaths && message.imagePaths.length > 0) {
        persistedImagePaths = this.persistImages(message.imagePaths);
        this.log(`Prompt includes ${message.imagePaths.length} image(s)`, "info");
      }

      this.executeWithSDK(promptId, message.content, persistedImagePaths);
      return;
    }

    // Unknown message type
    this.sendToClient(ws, {
      type: "error",
      message:
        'Invalid message format. Expected: {"type":"prompt","content":"..."} or {"type":"new_session"} or {"type":"stop"} or {"type":"discard_changes"}',
      timestamp: Date.now(),
    });
  }

  private handleNewSession(ws: WebSocket): void {
    // Abort any running query
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.currentQuery = null;

    // Clear session and history
    this.sessionId = null;
    this.conversationHistory = [];
    this.clearSessionFromFile();

    // Cleanup temp images
    this.cleanupTempImages();

    // Notify client
    this.sendToClient(ws, {
      type: "session_cleared",
      timestamp: Date.now(),
    });

    this.log("Session cleared - starting fresh", "info");
  }

  private handleStop(ws: WebSocket): void {
    if (this.abortController) {
      this.abortController.abort();
      this.log("Query stopped by user", "info");

      // Store stopped message in history so it persists after reopen
      const stoppedEntry: SystemConversationEntry = {
        role: "system",
        type: "stopped",
        content: "Stopped by user",
        timestamp: Date.now(),
      };
      this.conversationHistory.push(stoppedEntry);
    }
    // Keep sessionId so the next message continues the same conversation
    this.saveSession();

    this.sendToClient(ws, {
      type: "stopped",
      timestamp: Date.now(),
    });
  }

  private handleDiscardChanges(ws: WebSocket): void {
    this.log("Discarding all git changes...", "info");

    try {
      this.git.discardAllChanges();
      this.log("All changes discarded", "success");

      const branchName = this.git.getBranchName();
      const changes = this.git.getGitChanges();
      this.broadcastGitStatus(branchName, changes);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`Failed to discard changes: ${errorMessage}`, "error");

      this.sendToClient(ws, {
        type: "error",
        message: `Failed to discard changes: ${errorMessage}`,
        timestamp: Date.now(),
      });
    }
  }

  private isPromptMessage(message: unknown): message is PromptMessage {
    return (
      typeof message === "object" &&
      message !== null &&
      "type" in message &&
      (message as PromptMessage).type === "prompt" &&
      "content" in message &&
      typeof (message as PromptMessage).content === "string"
    );
  }

  private isNewSessionMessage(message: unknown): message is NewSessionMessage {
    return (
      typeof message === "object" &&
      message !== null &&
      "type" in message &&
      (message as NewSessionMessage).type === "new_session"
    );
  }

  private isStopMessage(message: unknown): message is StopMessage {
    return (
      typeof message === "object" &&
      message !== null &&
      "type" in message &&
      (message as StopMessage).type === "stop"
    );
  }

  private isDiscardChangesMessage(message: unknown): message is DiscardChangesMessage {
    return (
      typeof message === "object" &&
      message !== null &&
      "type" in message &&
      (message as DiscardChangesMessage).type === "discard_changes"
    );
  }

  private isRegisterPushTokenMessage(message: unknown): message is RegisterPushTokenMessage {
    return (
      typeof message === "object" &&
      message !== null &&
      "type" in message &&
      (message as RegisterPushTokenMessage).type === "register_push_token" &&
      "token" in message &&
      typeof (message as RegisterPushTokenMessage).token === "string"
    );
  }

  private isListBranchesMessage(message: unknown): message is ListBranchesMessage {
    return (
      typeof message === "object" &&
      message !== null &&
      "type" in message &&
      (message as ListBranchesMessage).type === "list_branches"
    );
  }

  private isSwitchBranchMessage(message: unknown): message is SwitchBranchMessage {
    return (
      typeof message === "object" &&
      message !== null &&
      "type" in message &&
      (message as SwitchBranchMessage).type === "switch_branch" &&
      "branchName" in message &&
      typeof (message as SwitchBranchMessage).branchName === "string"
    );
  }

  private isCreateBranchMessage(message: unknown): message is CreateBranchMessage {
    return (
      typeof message === "object" &&
      message !== null &&
      "type" in message &&
      (message as CreateBranchMessage).type === "create_branch" &&
      "branchName" in message &&
      typeof (message as CreateBranchMessage).branchName === "string"
    );
  }

  private async executeWithSDK(
    promptId: string,
    content: string,
    imagePaths?: string[]
  ): Promise<void> {
    // Add user prompt to history (original content + image paths for UI persistence)
    const historyEntry: AnyConversationEntry = {
      role: "user" as const,
      content,
      timestamp: Date.now(),
      ...(imagePaths && imagePaths.length > 0 ? { imagePaths } : {}),
    };
    this.conversationHistory.push(historyEntry);

    this.activePromptId = promptId;

    // Send processing status
    this.broadcastToClients({
      type: "status",
      status: "processing",
      promptId,
      timestamp: Date.now(),
    });

    this.log("Executing with Claude Agent SDK...", "info");

    // Create abort controller for this query
    this.abortController = new AbortController();
    // Reset streamed response accumulator for this query
    this.currentStreamedResponse = "";

    try {
      // Build prompt for Claude, appending image read instructions if images are attached
      let promptContent = content;
      if (imagePaths && imagePaths.length > 0) {
        const imageInstructions = imagePaths.map(
          (p) => `Use the Read tool to view the image at: ${p}`
        ).join("\n");
        promptContent = promptContent
          ? `${promptContent}\n\n[Attached images — please view them first]\n${imageInstructions}`
          : `[Attached images — please view them]\n${imageInstructions}`;
      }

      // Create the query with Claude Agent SDK
      this.currentQuery = query({
        prompt: promptContent,
        options: {
          cwd: this.projectRoot,
          abortController: this.abortController,
          includePartialMessages: true,
          permissionMode: "bypassPermissions", // YOLO mode - bypass all permission prompts
          systemPrompt: `You are Claude, running as part of Expo Flow - an AI-powered development tool that runs on the developer's local machine and developer runs the app on their phone with a widget that help him develop the app on the go.

IMPORTANT CONSTRAINTS:
- This environment uses Expo's Over-The-Air (OTA) updates for rapid iteration
- DO NOT add new npm/yarn packages unless the user EXPLICITLY asks for it
- Adding new packages requires the developer to completely reset and rebuild the native app, which is a slow and disruptive process
- If a feature could be implemented with existing packages or vanilla JavaScript/TypeScript, prefer that approach
- If a new package is truly necessary, clearly warn the user that adding it will require a full app rebuild
`,
          tools: {
            type: "preset",
            preset: "claude_code",
          },
          // Resume existing session if we have one
          ...(this.sessionId && { resume: this.sessionId }),
          // Hook into tool usage for real-time updates
          hooks: {
            PreToolUse: [{
              hooks: [async (input) => {
                try {
                  if (input.hook_event_name === "PreToolUse") {
                    this.lastToolInput = input.tool_input;
                    const inputStr = JSON.stringify(input.tool_input || {});
                    const truncatedInput = inputStr.length > 100 ? inputStr.substring(0, 100) + "..." : inputStr;
                    this.log(`Tool started: ${input.tool_name} - ${truncatedInput}`, "info");
                  }
                } catch (e) {
                  this.log(`Hook error: ${e}`, "error");
                }
                return {};
              }],
            }],
            PostToolUse: [{
              hooks: [async (input) => {
                try {
                  if (input.hook_event_name === "PostToolUse") {
                    this.sendToolUpdate(promptId, input.tool_name, "completed", input.tool_response);
                    this.saveToolToHistory(input.tool_name, "completed", input.tool_response);
                  }
                } catch (e) {
                  this.log(`Hook error: ${e}`, "error");
                }
                return {};
              }],
            }],
            PostToolUseFailure: [{
              hooks: [async (input) => {
                try {
                  if (input.hook_event_name === "PostToolUseFailure") {
                    const error = typeof input.error === "string" ? input.error : JSON.stringify(input.error || "Unknown error");
                    this.sendToolUpdate(promptId, input.tool_name, "failed", error);
                    this.saveToolToHistory(input.tool_name, "failed", error);
                  }
                } catch (e) {
                  this.log(`Hook error: ${e}`, "error");
                }
                return {};
              }],
            }],
          },
        },
      });

      // Stream messages from the SDK
      for await (const message of this.currentQuery) {
        // Debug: log all message types to understand SDK output
        if (message.type !== "stream_event") {
          this.log(`SDK msg: ${message.type}`, "info");
        }

        // Capture session_id from first message if we don't have one
        if (!this.sessionId && "session_id" in message && message.session_id) {
          this.sessionId = message.session_id;
          this.saveSession();
        }

        // Handle different message types
        // Note: We only use stream_event for text streaming to avoid duplicates
        // (assistant messages contain complete blocks, stream_event has deltas)
        if (message.type === "stream_event") {
          // Handle partial/streaming content
          const event = message.event;
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            // Accumulate streamed text for history persistence
            this.currentStreamedResponse += event.delta.text;
            this.broadcastToClients({
              type: "stream",
              promptId,
              chunk: event.delta.text,
              done: false,
              timestamp: Date.now(),
            });
          } else {
            // Debug: log other stream_event types
            this.log(`stream_event: ${event.type}`, "info");
          }
        } else if (message.type === "result") {
          // Final result
          const isSuccess = message.subtype === "success";

          this.broadcastToClients({
            type: "stream",
            promptId,
            chunk: "",
            done: true,
            timestamp: Date.now(),
          });

          this.broadcastToClients({
            type: "result",
            promptId,
            success: isSuccess,
            result: isSuccess ? message.result : undefined,
            error: !isSuccess ? message.errors?.join(", ") : undefined,
            costUsd: message.total_cost_usd,
            durationMs: message.duration_ms,
            timestamp: Date.now(),
          });

          // Send push notification (shown only when app is backgrounded)
          await this.sendPushNotification(promptId, isSuccess);

          if (isSuccess) {
            // Add assistant response to history
            // Prefer accumulated streamed text, fall back to message.result
            const responseContent = this.currentStreamedResponse.trim() || message.result;
            if (responseContent) {
              this.conversationHistory.push({
                role: "assistant",
                content: responseContent,
                timestamp: Date.now(),
              });
              this.saveSession();
            }
            this.log(
              `Completed in ${message.duration_ms}ms, cost: $${message.total_cost_usd?.toFixed(4)}`,
              "success"
            );

            // Auto-retrigger HMR after successful completion
            // This ensures Metro pushes any file changes even if HMR reconnected
            // after the files were written but before the retrigger
            this.log("Auto-triggering HMR retrigger after completion", "info");
            this.retriggerHMR();
          } else {
            // Store failed result in history
            const failedMessage = message.errors?.join(", ") || "Unknown error";
            const errorEntry: SystemConversationEntry = {
              role: "system",
              type: "error",
              content: failedMessage,
              timestamp: Date.now(),
            };
            this.conversationHistory.push(errorEntry);
            this.saveSession();
            this.log(`Failed: ${failedMessage}`, "error");
          }
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Don't add duplicate error if this was an abort (handleStop already saved a "stopped" entry)
      if (this.abortController?.signal.aborted) {
        this.log(`SDK aborted: ${errorMessage}`, "info");
      } else {
        this.log(`SDK error: ${errorMessage}`, "error");

        // Store error in history so it persists after reopen
        const errorEntry: SystemConversationEntry = {
          role: "system",
          type: "error",
          content: errorMessage,
          timestamp: Date.now(),
        };
        this.conversationHistory.push(errorEntry);
        this.saveSession();
      }

      this.broadcastToClients({
        type: "error",
        promptId,
        message: errorMessage,
        timestamp: Date.now(),
      });
    } finally {
      this.currentQuery = null;
      this.abortController = null;
      this.activePromptId = null;
      this.currentStreamedResponse = "";  // Clear accumulated response
      this.lastToolInput = undefined;  // Clear any pending tool input

      // Send idle status
      this.broadcastToClients({
        type: "status",
        status: "idle",
        timestamp: Date.now(),
      });
    }
  }

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

  private sendToolUpdate(
    promptId: string,
    toolName: string,
    status: "completed" | "failed",
    output?: unknown
  ): void {
    this.broadcastToClients({
      type: "tool",
      promptId,
      toolName,
      status,
      input: this.lastToolInput,
      output,
      timestamp: Date.now(),
    });

    if (status === "completed") {
      const responseStr = typeof output === 'string' ? output : JSON.stringify(output || '');
      const truncatedResponse = responseStr.length > 150 ? responseStr.substring(0, 150) + "..." : responseStr;
      this.log(`Tool completed: ${toolName} - ${truncatedResponse.replace(/\n/g, ' ')}`, "success");
    } else {
      const errorStr = typeof output === 'string' ? output : JSON.stringify(output || 'Unknown error');
      this.log(`Tool FAILED: ${toolName}`, "error");
      this.log(`  Error: ${errorStr.substring(0, 500)}`, "error");
      if (this.lastToolInput) {
        const inputStr = JSON.stringify(this.lastToolInput);
        this.log(`  Input was: ${inputStr.substring(0, 200)}`, "error");
      }
    }
  }

  private saveToolToHistory(toolName: string, status: "completed" | "failed", output: unknown): void {
    const toolEntry: ToolConversationEntry = {
      role: "tool",
      toolName,
      status,
      input: this.lastToolInput,
      output,
      timestamp: Date.now(),
    };
    this.conversationHistory.push(toolEntry);
    this.lastToolInput = undefined;
  }

  private async sendPushNotification(promptId: string, success: boolean): Promise<void> {
    if (!this.pushToken) return;

    try {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: this.pushToken,
          title: success ? "Task completed" : "Task failed",
          body: success ? "Claude finished your request" : "Something went wrong",
          data: { source: "expo-air", promptId, success },
          sound: "default",
          priority: "high",
        }),
      });

      if (!response.ok) {
        this.log(`Push notification failed: ${response.status}`, "error");
      } else {
        this.log("Push notification sent", "info");
      }
    } catch (error) {
      this.log(`Push notification error: ${error}`, "error");
    }
  }

  private log(
    message: string,
    level: "info" | "error" | "success" | "prompt" | "output"
  ): void {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = chalk.gray(`  [${timestamp}]`);

    switch (level) {
      case "info":
        console.log(`${prefix} ${chalk.blue("INFO")} ${message}`);
        break;
      case "error":
        console.log(`${prefix} ${chalk.red("ERROR")} ${message}`);
        break;
      case "success":
        console.log(`${prefix} ${chalk.green("SUCCESS")} ${message}`);
        break;
      case "prompt":
        console.log(`${prefix} ${chalk.yellow("PROMPT")} ${message}`);
        break;
      case "output":
        console.log(`${prefix} ${chalk.cyan("OUTPUT")} ${message}`);
        break;
    }
  }
}
