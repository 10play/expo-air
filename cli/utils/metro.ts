import chalk from "chalk";
import { spawn, ChildProcess } from "child_process";
import { waitForPort } from "./common.js";

export interface MetroProcess {
  process: ChildProcess;
  port: number;
  name: string;
}

export type MetroCommand = "npm" | "npx";

export interface StartMetroOptions {
  name: string;
  cwd: string;
  port: number;
  /** Use 'npm' for `npm start -- --port`, 'npx' for `npx expo start --port` */
  command?: MetroCommand;
  /** Timeout for waiting for port to be ready (default: 30000ms) */
  timeout?: number;
}

/**
 * Start a Metro bundler server
 */
export async function startMetro(options: StartMetroOptions): Promise<ChildProcess | null> {
  const { name, cwd, port, command = "npm", timeout = 30000 } = options;

  try {
    let proc: ChildProcess;

    if (command === "npm") {
      proc = spawn("npm", ["start", "--", "--port", String(port)], {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, FORCE_COLOR: "1" },
      });
    } else {
      proc = spawn("npx", ["expo", "start", "--port", String(port)], {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          FORCE_COLOR: "1",
          PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
        },
      });
    }

    // Wait for initial Metro output
    await new Promise<void>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => resolve(), 3000);

      proc.on("error", (err) => {
        clearTimeout(timeoutHandle);
        reject(err);
      });

      proc.stdout?.on("data", (data) => {
        const str = data.toString();
        if (str.includes("Metro") || str.includes("Bundler") || str.includes("Starting")) {
          clearTimeout(timeoutHandle);
          resolve();
        }
      });

      proc.stderr?.on("data", (data) => {
        const str = data.toString();
        if (str.includes("Metro") || str.includes("Bundler")) {
          clearTimeout(timeoutHandle);
          resolve();
        }
      });
    });

    // Wait for port to actually be listening (Metro fully ready)
    await waitForPort(port, timeout);

    console.log(chalk.green(`  ✓ ${name} Metro started on port ${port}`));
    return proc;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(chalk.yellow(`  ⚠ ${name} Metro: ${message}`));
    return null;
  }
}
