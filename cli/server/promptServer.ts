import { WebSocketServer, WebSocket } from "ws";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { randomUUID } from "crypto";
import chalk from "chalk";
import type { PromptMessage, OutgoingMessage } from "../types/messages.js";

export class PromptServer {
  private wss: WebSocketServer | null = null;
  private port: number;
  private clients: Set<WebSocket> = new Set();
  private currentQuery: ReturnType<typeof query> | null = null;
  private abortController: AbortController | null = null;
  private projectRoot: string;

  constructor(port: number, projectRoot?: string) {
    this.port = port;
    this.projectRoot = projectRoot || process.cwd();
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.wss = new WebSocketServer({ port: this.port });

      this.wss.on("listening", () => {
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
    if (!this.isPromptMessage(message)) {
      this.sendToClient(ws, {
        type: "error",
        message:
          'Invalid message format. Expected: {"type":"prompt","content":"..."}',
        timestamp: Date.now(),
      });
      return;
    }

    const promptId = message.id || randomUUID();
    this.log(
      `Received prompt: ${message.content.substring(0, 50)}...`,
      "prompt"
    );

    // Execute with Claude Agent SDK
    this.executeWithSDK(ws, promptId, message.content);
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

  private async executeWithSDK(
    ws: WebSocket,
    promptId: string,
    content: string
  ): Promise<void> {
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
          systemPrompt: {
            type: "preset",
            preset: "claude_code",
          },
          tools: {
            type: "preset",
            preset: "claude_code",
          },
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

          if (isSuccess) {
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
