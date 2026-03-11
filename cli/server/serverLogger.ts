import chalk from "chalk";

export type LogLevel = "info" | "error" | "success" | "prompt" | "output";

export function serverLog(
  message: string,
  level: LogLevel
): void {
  const timestamp = new Date().toLocaleTimeString();
  const prefix = chalk.gray(`  [${timestamp}]`);

  switch (level) {
    case "info":
      console.log(`${prefix} ${chalk.blue("INFO")} ${message}`);
      break;
    case "error":
      console.log(`${prefix} ${chalk.red("ERROR")} ${message}`);
      break;
    case "success":
      console.log(`${prefix} ${chalk.green("SUCCESS")} ${message}`);
      break;
    case "prompt":
      console.log(`${prefix} ${chalk.yellow("PROMPT")} ${message}`);
      break;
    case "output":
      console.log(`${prefix} ${chalk.cyan("OUTPUT")} ${message}`);
      break;
  }
}
