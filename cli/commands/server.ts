import chalk from "chalk";
import { randomBytes } from "crypto";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";
import { appendSecret } from "../utils/common.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ServerOptions {
  port: string;
  project?: string;
}

export async function serverCommand(options: ServerOptions): Promise<void> {
  console.log(chalk.blue("\n  expo-air server\n"));
  console.log(chalk.gray("  Starting WebSocket server only...\n"));

  const port = parseInt(options.port, 10);

  // Resolve project directory
  let projectRoot = options.project ? path.resolve(options.project) : process.cwd();

  // If running from the expo-air package root, default to example/
  const exampleDir = path.resolve(__dirname, "../..", "example");
  if (!options.project && fs.existsSync(path.join(exampleDir, "app.json"))) {
    if (!fs.existsSync(path.join(projectRoot, "app.json"))) {
      projectRoot = exampleDir;
      console.log(chalk.gray(`  Using example app: ${projectRoot}\n`));
    }
  }

  // Start prompt server with authentication secret
  const secret = randomBytes(32).toString("hex");
  const { PromptServer } = await import("../server/promptServer.js");
  const server = new PromptServer(port, projectRoot, secret);
  await server.start();
  console.log(chalk.green(`  ✓ Prompt server started on port ${port} (authenticated)`));
  console.log(chalk.gray(`    Project root: ${projectRoot}`));

  console.log(chalk.gray("\n  ─────────────────────────────────────────────"));
  console.log(chalk.white(`    WebSocket URL: ${appendSecret(`ws://localhost:${port}`, secret)}`));
  console.log(chalk.gray("  ─────────────────────────────────────────────"));
  console.log(chalk.yellow("\n  Waiting for prompts... (Ctrl+C to stop)\n"));

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log(chalk.gray("\n  Shutting down..."));
    await server.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
