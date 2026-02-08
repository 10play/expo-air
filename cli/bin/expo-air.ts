#!/usr/bin/env node

import { Command } from "commander";
import { fileURLToPath } from "url";
import * as path from "path";
import { startCommand } from "../commands/start.js";
import { serverCommand } from "../commands/server.js";
import { initCommand } from "../commands/init.js";
import { flyCommand } from "../commands/fly.js";
import { devCommand } from "../commands/dev.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Check if running from an npm installation (inside node_modules)
 */
function isInstalledFromNpm(): boolean {
  return __dirname.includes("node_modules");
}

const program = new Command();

program
  .name("expo-air")
  .description("Vibe Coding for React-Native - Mobile assistant for Claude Code")
  .version("0.1.0");

program
  .command("init")
  .description("Initialize expo-air in your Expo project")
  .option("-f, --force", "Overwrite existing configuration")
  .option("--skip-prebuild", "Skip running expo prebuild")
  .action(initCommand);

program
  .command("start")
  .description("Start the development environment")
  .option("-p, --port <port>", "Port for prompt server", "3847")
  .option("-w, --widget-port <port>", "Port for widget Metro server", "8082")
  .option("-m, --metro-port <port>", "Port for main app Metro server", "8081")
  .option("--project <path>", "Path to Expo project (where Claude makes changes)")
  .option("--no-tunnel", "Skip tunnel (local network only)")
  .option("--no-build", "Skip building and installing the app")
  .option("--no-server", "Skip starting the WebSocket server")
  .action(startCommand);

program
  .command("server")
  .description("Start only the WebSocket server (for dev mode with watch)")
  .option("-p, --port <port>", "Port for prompt server", "3847")
  .option("--project <path>", "Path to Expo project (where Claude makes changes)")
  .action(serverCommand);

program
  .command("fly")
  .description("✈️  Start everything + build and install on a real iOS device")
  .option("-p, --port <port>", "Port for prompt server", "3847")
  .option("-w, --widget-port <port>", "Port for widget Metro server", "8082")
  .option("-m, --metro-port <port>", "Port for main app Metro server", "8081")
  .option("--project <path>", "Path to Expo project")
  .option("--device <id>", "Device UDID or name to use")
  .option("--no-tunnel", "Skip tunnel (local network only)")
  .option("--dev", "SDK development mode: run widget Metro + tunnel for live widget development")
  .action(flyCommand);

// fly-dev and dev are only available when running from source (not published to npm)
if (!isInstalledFromNpm()) {
  program
    .command("fly-dev")
    .description("✈️  SDK development mode - run widget Metro + tunnel for live widget development")
    .option("-p, --port <port>", "Port for prompt server", "3847")
    .option("-w, --widget-port <port>", "Port for widget Metro server", "8082")
    .option("-m, --metro-port <port>", "Port for main app Metro server", "8081")
    .option("--project <path>", "Path to Expo project")
    .option("--device <id>", "Device UDID or name to use")
    .option("--no-tunnel", "Skip tunnel (local network only)")
    .action((options) => flyCommand({ ...options, dev: true }));

  program
    .command("dev")
    .description("🛠  SDK development mode for simulator - starts everything and builds to iOS Simulator")
    .option("-p, --port <port>", "Port for prompt server", "3847")
    .option("-w, --widget-port <port>", "Port for widget Metro server", "8082")
    .option("-m, --metro-port <port>", "Port for main app Metro server", "8081")
    .option("--project <path>", "Path to Expo project")
    .action(devCommand);
}

// Default command (just running `expo-air` starts everything)
program
  .action(() => {
    program.commands.find((cmd) => cmd.name() === "start")?.parse();
  });

program.parse();
