#!/usr/bin/env node

import { Command } from "commander";
import { startCommand } from "../commands/start.js";

const program = new Command();

program
  .name("expo-flow")
  .description("Vibe Coding for React-Native - Mobile assistant for Claude Code")
  .version("0.1.0");

program
  .command("start")
  .description("Start the development environment")
  .option("-p, --port <port>", "Port for prompt server", "3847")
  .option("-w, --widget-port <port>", "Port for widget Metro server", "8082")
  .option("-m, --metro-port <port>", "Port for main app Metro server", "8081")
  .option("--project <path>", "Path to Expo project (where Claude makes changes)")
  .option("--no-tunnel", "Skip tunnel (local network only)")
  .option("--no-build", "Skip building and installing the app")
  .action(startCommand);

// Default command (just running `expo-flow` starts everything)
program
  .action(() => {
    program.commands.find((cmd) => cmd.name() === "start")?.parse();
  });

program.parse();
