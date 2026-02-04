import chalk from "chalk";
import { spawn } from "child_process";
import * as path from "path";
import * as fs from "fs";
import * as readline from "readline";

interface InitOptions {
  force?: boolean;
  skipPrebuild?: boolean;
}

interface ExpoAirConfig {
  autoShow: boolean;
  enableNotifications?: boolean;
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

async function askYesNo(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`  ${question} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

async function runCommand(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell: true,
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
      }
    });

    proc.on("error", (err) => {
      reject(err);
    });
  });
}

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

  // Step 2: Create .expo-air.json config file
  const configPath = path.join(projectRoot, ".expo-air.json");
  if (fs.existsSync(configPath) && !options.force) {
    console.log(chalk.yellow("  .expo-air.json already exists (use --force to overwrite)"));
  } else {
    fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n");
    console.log(chalk.green("  Created .expo-air.json"));
  }

  // Step 3: Add plugin to app.json
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

  // Step 4: Add .expo-air.local.json to .gitignore
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

  // Step 5: Ask about push notifications
  console.log("");
  const enableNotifications = await askYesNo(
    chalk.white("Enable push notifications?") + chalk.gray(" (requires paid Apple Developer account)")
  );

  if (enableNotifications) {
    // Update config with notifications enabled
    const configContent = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(configContent) as ExpoAirConfig;
    config.enableNotifications = true;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
    console.log(chalk.green("  Enabled notifications in .expo-air.json"));

    // Install expo-notifications
    console.log(chalk.gray("\n  Installing expo-notifications..."));
    try {
      await runCommand("npx", ["expo", "install", "expo-notifications"], projectRoot);
      console.log(chalk.green("  Installed expo-notifications"));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(chalk.red(`  Failed to install expo-notifications: ${message}`));
      console.log(chalk.gray("  You can install it manually: npx expo install expo-notifications\n"));
    }

    // Add expo-notifications to app.json plugins with background notifications enabled
    if (fs.existsSync(appJsonPath)) {
      try {
        const appJsonContent = fs.readFileSync(appJsonPath, "utf-8");
        const appJson = JSON.parse(appJsonContent);

        // Check if expo-notifications is already in plugins (as string or array config)
        const hasNotificationsPlugin = appJson.expo.plugins.some(
          (p: string | [string, unknown]) =>
            p === "expo-notifications" || (Array.isArray(p) && p[0] === "expo-notifications")
        );

        if (!hasNotificationsPlugin) {
          // Add with enableBackgroundRemoteNotifications for background push support
          appJson.expo.plugins.push([
            "expo-notifications",
            { enableBackgroundRemoteNotifications: true }
          ]);
          fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + "\n");
          console.log(chalk.green("  Added expo-notifications to app.json plugins"));
        }
      } catch (err) {
        console.log(chalk.yellow("  Could not add expo-notifications to plugins - add it manually"));
      }
    }
  } else {
    console.log(chalk.gray("  Skipped push notifications setup"));
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

  if (!enableNotifications) {
    console.log(chalk.gray("  Want push notifications later? Re-run init with --force, or manually:"));
    console.log(chalk.gray("    npx expo install expo-notifications"));
    console.log(chalk.gray("    Add to app.json plugins:"));
    console.log(chalk.gray('      ["expo-notifications", { "enableBackgroundRemoteNotifications": true }]'));
    console.log(chalk.gray("    npx expo prebuild --platform ios --clean\n"));
  }
}
