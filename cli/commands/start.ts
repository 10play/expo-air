import chalk from "chalk";

interface StartOptions {
  port: string;
  build: boolean;
  tunnel: boolean;
}

export async function startCommand(options: StartOptions): Promise<void> {
  console.log(chalk.blue("\n  expo-flow\n"));
  console.log(chalk.gray("  Starting full development environment...\n"));

  // Phase 1: Just start the server
  // TODO Phase 2: Add tunnel
  // TODO Phase 4: Add build & install

  const port = parseInt(options.port, 10);

  // Import and start server
  const { PromptServer } = await import("../server/promptServer.js");
  const server = new PromptServer(port);
  await server.start();

  console.log(chalk.green(`  ✓ Prompt server started on port ${port}`));

  if (options.tunnel) {
    // TODO: Phase 2 - Add bore tunnel
    console.log(chalk.yellow("  ⚠ Tunnel not yet implemented (Phase 2)"));
  }

  if (options.build) {
    // TODO: Phase 4 - Build and install app
    console.log(chalk.yellow("  ⚠ Build not yet implemented (Phase 4)"));
  }

  console.log(chalk.gray(`\n  Connect via: ws://localhost:${port}`));
  console.log(chalk.yellow("\n  Waiting for prompts...\n"));

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log(chalk.gray("\n  Shutting down..."));
    await server.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
