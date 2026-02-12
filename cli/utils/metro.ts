import chalk from "chalk";
import { spawn, ChildProcess } from "child_process";
import { waitForPort, detectPackageManager, getExecCommand, getRunScriptCommand } from "./common.js";

export interface MetroProcess {
  process: ChildProcess;
  port: number;
  name: string;
}

export type MetroCommand = "run-script" | "exec";

export interface StartMetroOptions {
  name: string;
  cwd: string;
  port: number;
  /** Use 'run-script' for `<pm> start --port`, 'exec' for `<pm-exec> expo start --port` */
  command?: MetroCommand;
  /** Timeout for waiting for port to be ready (default: 30000ms) */
  timeout?: number;
  /** Extra environment variables to pass to the Metro process */
  extraEnv?: Record<string, string>;
}

/**
 * Start a Metro bundler server
 */
export async function startMetro(options: StartMetroOptions): Promise<ChildProcess | null> {
  const { name, cwd, port, command = "run-script", timeout = 30000, extraEnv = {} } = options;

  const pm = detectPackageManager(cwd);

  try {
    let proc: ChildProcess;

    if (command === "run-script") {
      const run = getRunScriptCommand(pm, "start", ["--port", String(port)]);
      proc = spawn(run.cmd, run.args, {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, FORCE_COLOR: "1", ...extraEnv },
      });
    } else {
      const exec = getExecCommand(pm);
      proc = spawn(exec.cmd, [...exec.args, "expo", "start", "--port", String(port)], {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          FORCE_COLOR: "1",
          PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
          ...extraEnv,
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
