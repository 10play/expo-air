import chalk from "chalk";
import { execSync, spawn } from "child_process";
import * as path from "path";
import * as fs from "fs";
interface InitOptions {
  force?: boolean;
  skipPrebuild?: boolean;
}

interface ExpoAirConfig {
  autoShow: boolean;
  ui: {
    bubbleSize: number;
    bubbleColor: string;
  };
}

const DEFAULT_CONFIG: ExpoAirConfig = {
  autoShow: true,
  ui: {
    bubbleSize: 60,
    bubbleColor: "#007AFF",
  },
};

export async function initCommand(options: InitOptions): Promise<void> {
  console.log(chalk.blue("\n  expo-air init\n"));

  const projectRoot = process.cwd();

  // Step 1: Validate this is an Expo project
  const appJsonPath = path.join(projectRoot, "app.json");
  const appConfigPath = path.join(projectRoot, "app.config.js");

  if (!fs.existsSync(appJsonPath) && !fs.existsSync(appConfigPath)) {
    console.log(chalk.red("  Error: No Expo app found in current directory"));
    console.log(chalk.gray("    Expected app.json or app.config.js\n"));
    process.exit(1);
  }

  // Step 2: Install @10play/expo-air if not already installed
  const packageJsonPath = path.join(projectRoot, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
  const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };

  if (!allDeps["@10play/expo-air"]) {
    console.log(chalk.gray("  Installing @10play/expo-air...\n"));
    const cmd = fs.existsSync(path.join(projectRoot, "bun.lockb")) || fs.existsSync(path.join(projectRoot, "bun.lock"))
      ? "bun add @10play/expo-air"
      : fs.existsSync(path.join(projectRoot, "pnpm-lock.yaml"))
      ? "pnpm add @10play/expo-air"
      : fs.existsSync(path.join(projectRoot, "yarn.lock"))
      ? "yarn add @10play/expo-air"
      : "npm install @10play/expo-air";

    try {
      execSync(cmd, { cwd: projectRoot, stdio: "inherit" });
      console.log(chalk.green("  Installed @10play/expo-air"));
    } catch {
      console.log(chalk.red(`  Failed to install. Run manually: ${cmd}\n`));
      process.exit(1);
    }
  }

  // Step 3: Create .expo-air.json config file
  const configPath = path.join(projectRoot, ".expo-air.json");
  if (fs.existsSync(configPath) && !options.force) {
    console.log(chalk.yellow("  .expo-air.json already exists (use --force to overwrite)"));
  } else {
    fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n");
    console.log(chalk.green("  Created .expo-air.json"));
  }

  // Step 4: Add plugin to app.json
  if (fs.existsSync(appJsonPath)) {
    try {
      const appJsonContent = fs.readFileSync(appJsonPath, "utf-8");
      const appJson = JSON.parse(appJsonContent);

      // Ensure expo key exists
      if (!appJson.expo) {
        appJson.expo = {};
      }

      // Ensure plugins array exists
      if (!appJson.expo.plugins) {
        appJson.expo.plugins = [];
      }

      // Add plugin if not already present
      const pluginName = "@10play/expo-air";
      if (!appJson.expo.plugins.includes(pluginName)) {
        appJson.expo.plugins.push(pluginName);
        fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + "\n");
        console.log(chalk.green(`  Added ${pluginName} to app.json plugins`));
      } else {
        console.log(chalk.yellow(`  ${pluginName} already in app.json plugins`));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(chalk.red(`  Failed to update app.json: ${message}`));
      process.exit(1);
    }
  } else {
    console.log(chalk.yellow("  app.config.js detected - please add plugin manually:"));
    console.log(chalk.gray('    plugins: ["@10play/expo-air"]\n'));
  }

  // Step 5: Add .expo-air.local.json to .gitignore
  const gitignorePath = path.join(projectRoot, ".gitignore");
  const gitignoreEntry = ".expo-air.local.json";

  if (fs.existsSync(gitignorePath)) {
    const gitignoreContent = fs.readFileSync(gitignorePath, "utf-8");
    if (!gitignoreContent.includes(gitignoreEntry)) {
      fs.appendFileSync(gitignorePath, `\n# expo-air local config (tunnel URLs)\n${gitignoreEntry}\n`);
      console.log(chalk.green("  Added .expo-air.local.json to .gitignore"));
    } else {
      console.log(chalk.yellow("  .expo-air.local.json already in .gitignore"));
    }
  } else {
    fs.writeFileSync(gitignorePath, `# expo-air local config (tunnel URLs)\n${gitignoreEntry}\n`);
    console.log(chalk.green("  Created .gitignore with .expo-air.local.json"));
  }

  // Step 6: Run expo prebuild (unless --skip-prebuild)
  if (!options.skipPrebuild) {
    console.log(chalk.gray("\n  Running expo prebuild --platform ios --clean..."));
    console.log(chalk.gray("  This generates native iOS code with expo-air plugin\n"));

    try {
      await new Promise<void>((resolve, reject) => {
        const prebuild = spawn("npx", ["expo", "prebuild", "--platform", "ios", "--clean"], {
          cwd: projectRoot,
          stdio: "inherit",
          shell: true,
        });

        prebuild.on("close", (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`expo prebuild exited with code ${code}`));
          }
        });

        prebuild.on("error", (err) => {
          reject(err);
        });
      });

      console.log(chalk.green("\n  Prebuild completed successfully!"));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(chalk.red(`\n  Prebuild failed: ${message}`));
      console.log(chalk.gray("  You can run it manually: npx expo prebuild --platform ios --clean\n"));
      process.exit(1);
    }
  } else {
    console.log(chalk.yellow("\n  Skipped prebuild (--skip-prebuild)"));
    console.log(chalk.gray("  Run manually: npx expo prebuild --platform ios --clean\n"));
  }

  // Success message
  console.log(chalk.blue("\n  expo-air initialized!\n"));
  console.log(chalk.gray("  Next steps:"));
  console.log(chalk.white("    1. Connect your iOS device via cable"));
  console.log(chalk.white("    2. Run: npx expo-air fly"));
  console.log(chalk.white("    3. The widget will appear on your device\n"));

}
