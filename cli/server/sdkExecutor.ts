import { query } from "@anthropic-ai/claude-agent-sdk";
import { serverLog } from "./serverLogger.js";
import type {
  OutgoingMessage,
  AnyConversationEntry,
  ToolConversationEntry,
  SystemConversationEntry,
} from "../types/messages.js";

export interface SdkExecutorContext {
  projectRoot: string;
  sessionId: string | null;
  conversationHistory: AnyConversationEntry[];
  broadcastToClients: (message: OutgoingMessage) => void;
  saveSession: () => void;
  retriggerHMR: () => void;
  setSessionId: (id: string) => void;
}

export interface SdkExecutorState {
  abortController: AbortController | null;
  currentStreamedResponse: string;
  lastToolInput: unknown;
  activePromptId: string | null;
  currentQuery: ReturnType<typeof query> | null;
}

export function createInitialSdkState(): SdkExecutorState {
  return {
    abortController: null,
    currentStreamedResponse: "",
    lastToolInput: undefined,
    activePromptId: null,
    currentQuery: null,
  };
}

function sendToolUpdate(
  ctx: SdkExecutorContext,
  state: SdkExecutorState,
  promptId: string,
  toolName: string,
  status: "completed" | "failed",
  output?: unknown
): void {
  ctx.broadcastToClients({
    type: "tool",
    promptId,
    toolName,
    status,
    input: state.lastToolInput,
    output,
    timestamp: Date.now(),
  });

  if (status === "completed") {
    const responseStr = typeof output === 'string' ? output : JSON.stringify(output || '');
    const truncatedResponse = responseStr.length > 150 ? responseStr.substring(0, 150) + "..." : responseStr;
    serverLog(`Tool completed: ${toolName} - ${truncatedResponse.replace(/\n/g, ' ')}`, "success");
  } else {
    const errorStr = typeof output === 'string' ? output : JSON.stringify(output || 'Unknown error');
    serverLog(`Tool FAILED: ${toolName}`, "error");
    serverLog(`  Error: ${errorStr.substring(0, 500)}`, "error");
    if (state.lastToolInput) {
      const inputStr = JSON.stringify(state.lastToolInput);
      serverLog(`  Input was: ${inputStr.substring(0, 200)}`, "error");
    }
  }
}

function saveToolToHistory(
  ctx: SdkExecutorContext,
  state: SdkExecutorState,
  toolName: string,
  status: "completed" | "failed",
  output: unknown
): void {
  const toolEntry: ToolConversationEntry = {
    role: "tool",
    toolName,
    status,
    input: state.lastToolInput,
    output,
    timestamp: Date.now(),
  };
  ctx.conversationHistory.push(toolEntry);
  state.lastToolInput = undefined;
}

export async function executeWithSDK(
  ctx: SdkExecutorContext,
  state: SdkExecutorState,
  promptId: string,
  content: string,
  imagePaths?: string[]
): Promise<void> {
  // Add user prompt to history
  const historyEntry: AnyConversationEntry = {
    role: "user" as const,
    content,
    timestamp: Date.now(),
    ...(imagePaths && imagePaths.length > 0 ? { imagePaths } : {}),
  };
  ctx.conversationHistory.push(historyEntry);

  state.activePromptId = promptId;

  // Send processing status
  ctx.broadcastToClients({
    type: "status",
    status: "processing",
    promptId,
    timestamp: Date.now(),
  });

  serverLog("Executing with Claude Agent SDK...", "info");

  // Create abort controller for this query
  state.abortController = new AbortController();
  // Reset streamed response accumulator for this query
  state.currentStreamedResponse = "";

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
    state.currentQuery = query({
      prompt: promptContent,
      options: {
        cwd: ctx.projectRoot,
        abortController: state.abortController,
        includePartialMessages: true,
        permissionMode: "bypassPermissions",
        settingSources: ["project"],
        systemPrompt: {
          type: "preset",
          preset: "claude_code",
          append: `You are running as part of Expo Flow - an AI-powered development tool that runs on the developer's local machine. The developer runs the app on their phone with a widget that helps them develop the app on the go.

IMPORTANT CONSTRAINTS:
- This environment uses Expo's Over-The-Air (OTA) updates for rapid iteration
- DO NOT add new npm/yarn packages unless the user EXPLICITLY asks for it
- Adding new packages requires the developer to completely reset and rebuild the native app, which is a slow and disruptive process
- If a feature could be implemented with existing packages or vanilla JavaScript/TypeScript, prefer that approach
- If a new package is truly necessary, clearly warn the user that adding it will require a full app rebuild`,
        },
        tools: {
          type: "preset",
          preset: "claude_code",
        },
        ...(ctx.sessionId && { resume: ctx.sessionId }),
        hooks: {
          PreToolUse: [{
            hooks: [async (input) => {
              try {
                if (input.hook_event_name === "PreToolUse") {
                  state.lastToolInput = input.tool_input;
                  const inputStr = JSON.stringify(input.tool_input || {});
                  const truncatedInput = inputStr.length > 100 ? inputStr.substring(0, 100) + "..." : inputStr;
                  serverLog(`Tool started: ${input.tool_name} - ${truncatedInput}`, "info");
                }
              } catch (e) {
                serverLog(`Hook error: ${e}`, "error");
              }
              return {};
            }],
          }],
          PostToolUse: [{
            hooks: [async (input) => {
              try {
                if (input.hook_event_name === "PostToolUse") {
                  sendToolUpdate(ctx, state, promptId, input.tool_name, "completed", input.tool_response);
                  saveToolToHistory(ctx, state, input.tool_name, "completed", input.tool_response);
                }
              } catch (e) {
                serverLog(`Hook error: ${e}`, "error");
              }
              return {};
            }],
          }],
          PostToolUseFailure: [{
            hooks: [async (input) => {
              try {
                if (input.hook_event_name === "PostToolUseFailure") {
                  const error = typeof input.error === "string" ? input.error : JSON.stringify(input.error || "Unknown error");
                  sendToolUpdate(ctx, state, promptId, input.tool_name, "failed", error);
                  saveToolToHistory(ctx, state, input.tool_name, "failed", error);
                }
              } catch (e) {
                serverLog(`Hook error: ${e}`, "error");
              }
              return {};
            }],
          }],
        },
      },
    });

    // Stream messages from the SDK
    for await (const message of state.currentQuery) {
      if (message.type !== "stream_event") {
        serverLog(`SDK msg: ${message.type}`, "info");
      }

      // Capture session_id from first message if we don't have one
      if (!ctx.sessionId && "session_id" in message && message.session_id) {
        ctx.setSessionId(message.session_id);
        ctx.saveSession();
      }

      if (message.type === "stream_event") {
        const event = message.event;
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          state.currentStreamedResponse += event.delta.text;
          ctx.broadcastToClients({
            type: "stream",
            promptId,
            chunk: event.delta.text,
            done: false,
            timestamp: Date.now(),
          });
        } else {
          serverLog(`stream_event: ${event.type}`, "info");
        }
      } else if (message.type === "result") {
        const isSuccess = message.subtype === "success";

        ctx.broadcastToClients({
          type: "stream",
          promptId,
          chunk: "",
          done: true,
          timestamp: Date.now(),
        });

        ctx.broadcastToClients({
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
          const responseContent = state.currentStreamedResponse.trim() || message.result;
          if (responseContent) {
            ctx.conversationHistory.push({
              role: "assistant",
              content: responseContent,
              timestamp: Date.now(),
            });
            ctx.saveSession();
          }
          serverLog(
            `Completed in ${message.duration_ms}ms, cost: $${message.total_cost_usd?.toFixed(4)}`,
            "success"
          );

          serverLog("Auto-triggering HMR retrigger after completion", "info");
          ctx.retriggerHMR();
        } else {
          const failedMessage = message.errors?.join(", ") || "Unknown error";
          const errorEntry: SystemConversationEntry = {
            role: "system",
            type: "error",
            content: failedMessage,
            timestamp: Date.now(),
          };
          ctx.conversationHistory.push(errorEntry);
          ctx.saveSession();
          serverLog(`Failed: ${failedMessage}`, "error");
        }
      }
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    if (state.abortController?.signal.aborted) {
      serverLog(`SDK aborted: ${errorMessage}`, "info");
    } else {
      serverLog(`SDK error: ${errorMessage}`, "error");

      const errorEntry: SystemConversationEntry = {
        role: "system",
        type: "error",
        content: errorMessage,
        timestamp: Date.now(),
      };
      ctx.conversationHistory.push(errorEntry);
      ctx.saveSession();
    }

    ctx.broadcastToClients({
      type: "error",
      promptId,
      message: errorMessage,
      timestamp: Date.now(),
    });
  } finally {
    state.currentQuery = null;
    state.abortController = null;
    state.activePromptId = null;
    state.currentStreamedResponse = "";
    state.lastToolInput = undefined;

    ctx.broadcastToClients({
      type: "status",
      status: "idle",
      timestamp: Date.now(),
    });
  }
}
