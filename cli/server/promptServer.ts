import { WebSocketServer, WebSocket } from "ws";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { randomUUID } from "crypto";
import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import chalk from "chalk";
import type {
  PromptMessage,
  NewSessionMessage,
  StopMessage,
  DiscardChangesMessage,
  RegisterPushTokenMessage,
  OutgoingMessage,
  ConversationEntry,
  GitChange,
} from "../types/messages.js";

export class PromptServer {
  private wss: WebSocketServer | null = null;
  private port: number;
  private clients: Set<WebSocket> = new Set();
  private currentQuery: ReturnType<typeof query> | null = null;
  private abortController: AbortController | null = null;
  private projectRoot: string;
  private sessionId: string | null = null;
  private conversationHistory: ConversationEntry[] = [];
  private gitWatchInterval: ReturnType<typeof setInterval> | null = null;
  private lastBranchName: string = "";
  private lastGitChangesHash: string = "";
  private pushToken: string | null = null;

  constructor(port: number, projectRoot?: string) {
    this.port = port;
    this.projectRoot = projectRoot || process.cwd();
    this.loadSession();
  }

  private getBranchName(): string {
    try {
      return execSync("git rev-parse --abbrev-ref HEAD", {
        cwd: this.projectRoot,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();
    } catch {
      return "main";
    }
  }

  private getGitChanges(): GitChange[] {
    try {
      const output = execSync("git status --porcelain -u", {
        cwd: this.projectRoot,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });

      if (!output.trim()) {
        return [];
      }

      return output
        .trim()
        .split("\n")
        .map((line) => {
          const statusCode = line.substring(0, 2);
          const file = line.substring(3);

          let status: GitChange["status"] = "modified";
          if (statusCode.includes("A") || statusCode === "??") {
            status = statusCode === "??" ? "untracked" : "added";
          } else if (statusCode.includes("D")) {
            status = "deleted";
          } else if (statusCode.includes("R")) {
            status = "renamed";
          }

          return { file, status };
        });
    } catch {
      return [];
    }
  }

  private startGitWatcher(): void {
    // Initial state
    this.lastBranchName = this.getBranchName();
    this.lastGitChangesHash = JSON.stringify(this.getGitChanges());

    // Poll every 2 seconds for changes
    this.gitWatchInterval = setInterval(() => {
      const currentBranch = this.getBranchName();
      const currentChanges = this.getGitChanges();
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

  private broadcastGitStatus(branchName: string, changes: GitChange[]): void {
    const message: OutgoingMessage = {
      type: "git_status",
      branchName,
      changes,
      timestamp: Date.now(),
    };

    for (const client of this.clients) {
      this.sendToClient(client, message);
    }

    this.log(`Git status updated: ${branchName} (${changes.length} changes)`, "info");
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

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.wss = new WebSocketServer({ port: this.port });

      this.wss.on("listening", () => {
        this.startGitWatcher();
        resolve();
      });

      this.wss.on("error", (error) => {
        reject(error);
      });

      this.wss.on("connection", (ws) => {
        this.handleConnection(ws);
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

    // Close server
    return new Promise((resolve) => {
      if (this.wss) {
        this.wss.close(() => {
          resolve();
        });
      } else {
        resolve();
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

    // Send initial git status
    const branchName = this.getBranchName();
    const changes = this.getGitChanges();
    this.sendToClient(ws, {
      type: "git_status",
      branchName,
      changes,
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

    // Handle prompt message
    if (this.isPromptMessage(message)) {
      const promptId = message.id || randomUUID();
      this.log(
        `Received prompt: ${message.content.substring(0, 50)}...`,
        "prompt"
      );
      this.executeWithSDK(ws, promptId, message.content);
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
    }
    this.sendToClient(ws, {
      type: "stopped",
      timestamp: Date.now(),
    });
  }

  private handleDiscardChanges(ws: WebSocket): void {
    this.log("Discarding all git changes...", "info");

    try {
      // Reset tracked files to HEAD
      execSync("git checkout -- .", {
        cwd: this.projectRoot,
        stdio: ["pipe", "pipe", "pipe"],
      });

      // Remove untracked files and directories
      execSync("git clean -fd", {
        cwd: this.projectRoot,
        stdio: ["pipe", "pipe", "pipe"],
      });

      this.log("All changes discarded", "success");

      // Broadcast updated git status to all clients
      const branchName = this.getBranchName();
      const changes = this.getGitChanges();
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

  private async executeWithSDK(
    ws: WebSocket,
    promptId: string,
    content: string
  ): Promise<void> {
    // Add user prompt to history
    this.conversationHistory.push({
      role: "user",
      content,
      timestamp: Date.now(),
    });

    // Send processing status
    this.sendToClient(ws, {
      type: "status",
      status: "processing",
      promptId,
      timestamp: Date.now(),
    });

    this.log("Executing with Claude Agent SDK...", "info");

    // Create abort controller for this query
    this.abortController = new AbortController();

    try {
      // Create the query with Claude Agent SDK
      this.currentQuery = query({
        prompt: content,
        options: {
          cwd: this.projectRoot,
          abortController: this.abortController,
          includePartialMessages: true,
          permissionMode: "acceptEdits", // Auto-accept edits for dev workflow
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
            PreToolUse: [
              {
                hooks: [
                  async (input) => {
                    if (input.hook_event_name === "PreToolUse") {
                      this.sendToClient(ws, {
                        type: "tool",
                        promptId,
                        toolName: input.tool_name,
                        status: "started",
                        input: input.tool_input,
                        timestamp: Date.now(),
                      });
                      this.log(`Tool started: ${input.tool_name}`, "info");
                    }
                    return {};
                  },
                ],
              },
            ],
            PostToolUse: [
              {
                hooks: [
                  async (input) => {
                    if (input.hook_event_name === "PostToolUse") {
                      this.sendToClient(ws, {
                        type: "tool",
                        promptId,
                        toolName: input.tool_name,
                        status: "completed",
                        output: input.tool_response,
                        timestamp: Date.now(),
                      });
                      this.log(`Tool completed: ${input.tool_name}`, "success");
                    }
                    return {};
                  },
                ],
              },
            ],
            PostToolUseFailure: [
              {
                hooks: [
                  async (input) => {
                    if (input.hook_event_name === "PostToolUseFailure") {
                      this.sendToClient(ws, {
                        type: "tool",
                        promptId,
                        toolName: input.tool_name,
                        status: "failed",
                        output: input.error,
                        timestamp: Date.now(),
                      });
                      this.log(`Tool failed: ${input.tool_name}`, "error");
                    }
                    return {};
                  },
                ],
              },
            ],
          },
        },
      });

      // Stream messages from the SDK
      for await (const message of this.currentQuery) {
        // Capture session_id from first message if we don't have one
        if (!this.sessionId && "session_id" in message && message.session_id) {
          this.sessionId = message.session_id;
          this.saveSession();
        }

        // Handle different message types
        if (message.type === "assistant") {
          // Extract text content from assistant message
          const messageContent = message.message.content;
          if (Array.isArray(messageContent)) {
            for (const block of messageContent) {
              if (block.type === "text") {
                this.sendToClient(ws, {
                  type: "stream",
                  promptId,
                  chunk: block.text,
                  done: false,
                  timestamp: Date.now(),
                });
              }
            }
          }
        } else if (message.type === "stream_event") {
          // Handle partial/streaming content
          const event = message.event;
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            this.sendToClient(ws, {
              type: "stream",
              promptId,
              chunk: event.delta.text,
              done: false,
              timestamp: Date.now(),
            });
          }
        } else if (message.type === "result") {
          // Final result
          const isSuccess = message.subtype === "success";

          this.sendToClient(ws, {
            type: "stream",
            promptId,
            chunk: "",
            done: true,
            timestamp: Date.now(),
          });

          this.sendToClient(ws, {
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
            if (message.result) {
              this.conversationHistory.push({
                role: "assistant",
                content: message.result,
                timestamp: Date.now(),
              });
              this.saveSession();
            }
            this.log(
              `Completed in ${message.duration_ms}ms, cost: $${message.total_cost_usd?.toFixed(4)}`,
              "success"
            );
          } else {
            this.log(`Failed: ${message.errors?.join(", ")}`, "error");
          }
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.log(`SDK error: ${errorMessage}`, "error");

      this.sendToClient(ws, {
        type: "error",
        promptId,
        message: errorMessage,
        timestamp: Date.now(),
      });
    } finally {
      this.currentQuery = null;
      this.abortController = null;

      // Send idle status
      this.sendToClient(ws, {
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
