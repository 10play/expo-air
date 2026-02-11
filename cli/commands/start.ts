import chalk from "chalk";
import { DevEnvironment } from "../runner/devEnvironment.js";

export interface StartOptions {
  port: string;
  build: boolean;
  tunnel: boolean;
  server: boolean;
  widgetPort?: string;
  metroPort?: string;
  project?: string;
}

export async function startCommand(options: StartOptions): Promise<void> {
  console.log(chalk.blue("\n  expo-air\n"));
  console.log(chalk.gray("  Starting full development environment...\n"));

  // Create development environment with options
  const env = new DevEnvironment({
    port: parseInt(options.port, 10),
    widgetPort: options.widgetPort ? parseInt(options.widgetPort, 10) : undefined,
    metroPort: options.metroPort ? parseInt(options.metroPort, 10) : undefined,
    project: options.project,
    tunnel: options.tunnel,
    server: options.server,
    // runWidgetMetro: auto-detect (default behavior)
    metroCommand: "run-script", // start uses the project's start script
  });

  // Allocate ports
  await env.allocatePorts();

  // Resolve project directory (don't exit on error for start command)
  const projectRoot = env.resolveProject({ exitOnError: false });
  console.log(chalk.gray(`    Project root: ${projectRoot}`));

  // Start Metro servers
  await env.startMetroServers();

  // Start prompt server
  await env.startPromptServer();

  // Start tunnels
  const tunnelsOk = await env.startTunnels();
  if (!tunnelsOk) {
    env.showRateLimitWarning(false); // Show warning but don't exit
  }

  // Start extra tunnels (configured in .expo-air.json)
  const extraTunnelsOk = await env.startExtraTunnels();
  if (!extraTunnelsOk) {
    env.showRateLimitWarning(false);
  }

  // Update config files with tunnel URLs
  env.updateConfigFiles();

  // Update env file with extra tunnel URLs
  env.writeEnvFileWithTunnelUrls();

  if (options.build) {
    // TODO: Phase 4 - Build and install app
    console.log(chalk.yellow("  ⚠ Build not yet implemented (Phase 4)"));
  }

  // Display connection info
  env.displayConnectionInfo();

  if (options.server) {
    console.log(chalk.yellow("\n  Waiting for prompts...\n"));
  } else {
    console.log(chalk.yellow("\n  Running... (Ctrl+C to stop)\n"));
  }

  // Set up graceful shutdown
  env.setupShutdownHandlers("Shutting down...");
}
