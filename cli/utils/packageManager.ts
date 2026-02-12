import * as path from "path";
import * as fs from "fs";

export type PackageManager = "npm" | "yarn" | "pnpm" | "bun";

/**
 * Detect the package manager used in a project by checking lock files.
 */
export function detectPackageManager(projectRoot: string): PackageManager {
  let dir = projectRoot;
  while (true) {
    if (
      fs.existsSync(path.join(dir, "bun.lockb")) ||
      fs.existsSync(path.join(dir, "bun.lock"))
    ) {
      return "bun";
    }
    if (fs.existsSync(path.join(dir, "pnpm-lock.yaml"))) {
      return "pnpm";
    }
    if (fs.existsSync(path.join(dir, "yarn.lock"))) {
      return "yarn";
    }
    if (fs.existsSync(path.join(dir, "package-lock.json"))) {
      return "npm";
    }

    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return "npm";
}

/**
 * Get the command and args prefix for executing a local package binary.
 * Equivalent of `npx` for each package manager.
 *
 * Usage: spawn(exec.cmd, [...exec.args, "expo", "prebuild", "--clean"])
 */
export function getExecCommand(pm: PackageManager): { cmd: string; args: string[] } {
  switch (pm) {
    case "bun": return { cmd: "bunx", args: [] };
    case "pnpm": return { cmd: "pnpm", args: ["exec"] };
    case "yarn": return { cmd: "yarn", args: [] };
    case "npm": return { cmd: "npx", args: [] };
  }
}

/**
 * Get the full install command string for a package.
 */
export function getInstallCommand(pm: PackageManager, pkg: string): string {
  switch (pm) {
    case "bun": return `bun add ${pkg}`;
    case "pnpm": return `pnpm add ${pkg}`;
    case "yarn": return `yarn add ${pkg}`;
    case "npm": return `npm install ${pkg}`;
  }
}

/**
 * Get command + args for running a package.json script with extra args.
 *
 * Usage: spawn(run.cmd, run.args)
 */
export function getRunScriptCommand(
  pm: PackageManager,
  script: string,
  extraArgs: string[]
): { cmd: string; args: string[] } {
  switch (pm) {
    case "npm": return { cmd: "npm", args: [script, "--", ...extraArgs] };
    case "yarn": return { cmd: "yarn", args: [script, ...extraArgs] };
    case "pnpm": return { cmd: "pnpm", args: [script, ...extraArgs] };
    case "bun": return { cmd: "bun", args: ["run", script, ...extraArgs] };
  }
}
