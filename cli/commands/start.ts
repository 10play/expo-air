import chalk from "chalk";
import { BoreTunnel } from "../tunnel/bore.js";

interface StartOptions {
  port: string;
  build: boolean;
  tunnel: boolean;
}

export async function startCommand(options: StartOptions): Promise<void> {
  console.log(chalk.blue("\n  expo-flow\n"));
  console.log(chalk.gray("  Starting full development environment...\n"));

  const port = parseInt(options.port, 10);

  // Start prompt server
  const { PromptServer } = await import("../server/promptServer.js");
  const server = new PromptServer(port);
  await server.start();
  console.log(chalk.green(`  ✓ Prompt server started on port ${port}`));

  // Start tunnel if enabled
  let tunnel: BoreTunnel | null = null;
  let tunnelUrl: string | null = null;

  if (options.tunnel) {
    tunnel = new BoreTunnel();
    try {
      const info = await tunnel.start({ localPort: port });
      tunnelUrl = info.url;
      console.log(chalk.green(`  ✓ Tunnel established: ${tunnelUrl}`));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(chalk.red(`  ✗ Tunnel failed: ${message}`));
      console.log(chalk.yellow(`  Continuing with local-only mode...`));
    }
  }

  if (options.build) {
    // TODO: Phase 4 - Build and install app
    console.log(chalk.yellow("  ⚠ Build not yet implemented (Phase 4)"));
  }

  // Show connection info
  console.log(chalk.gray("\n  ─────────────────────────────────"));
  console.log(chalk.gray("  Connect via:"));
  console.log(chalk.white(`    Local:  ws://localhost:${port}`));
  if (tunnelUrl) {
    console.log(chalk.white(`    Remote: ${tunnelUrl}`));
  }
  console.log(chalk.gray("  ─────────────────────────────────"));
  console.log(chalk.yellow("\n  Waiting for prompts...\n"));

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log(chalk.gray("\n  Shutting down..."));
    if (tunnel) {
      await tunnel.stop();
    }
    await server.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
