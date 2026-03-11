import { existsSync, readFileSync, writeFileSync } from "fs";
import type { AnyConversationEntry } from "../types/messages.js";
import { serverLog } from "./serverLogger.js";

export interface SessionState {
  sessionId: string | null;
  conversationHistory: AnyConversationEntry[];
}

/**
 * Load session ID and conversation history from the local config file.
 */
export function loadSession(configPath: string): SessionState {
  const state: SessionState = { sessionId: null, conversationHistory: [] };
  try {
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, "utf-8"));
      if (config.sessionId) {
        state.sessionId = config.sessionId;
        serverLog(`Loaded session: ${state.sessionId}`, "info");
      }
      if (config.conversationHistory && Array.isArray(config.conversationHistory)) {
        state.conversationHistory = config.conversationHistory;
        serverLog(`Loaded ${state.conversationHistory.length} history entries`, "info");
      }
    }
  } catch {
    serverLog("Failed to load session from config", "error");
  }
  return state;
}

/**
 * Save session ID and conversation history to the local config file.
 * Merges with any existing config data.
 */
export function saveSession(
  configPath: string,
  sessionId: string | null,
  conversationHistory: AnyConversationEntry[]
): void {
  try {
    let config: Record<string, unknown> = {};
    if (existsSync(configPath)) {
      config = JSON.parse(readFileSync(configPath, "utf-8"));
    }
    config.sessionId = sessionId;
    config.conversationHistory = conversationHistory;
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    serverLog(`Saved session with ${conversationHistory.length} history entries`, "info");
  } catch {
    serverLog("Failed to save session to config", "error");
  }
}

/**
 * Remove session ID and conversation history from the local config file.
 * Preserves other config fields (e.g. tunnel URLs).
 */
export function clearSessionFromFile(configPath: string): void {
  try {
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, "utf-8"));
      delete config.sessionId;
      delete config.conversationHistory;
      writeFileSync(configPath, JSON.stringify(config, null, 2));
    }
  } catch {
    serverLog("Failed to clear session from config", "error");
  }
}
