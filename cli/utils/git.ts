import { execSync } from "child_process";

/**
 * Get the current git branch name, sanitized for use in bundle IDs.
 * Returns null if not in a git repo or if git command fails.
 *
 * Bundle IDs can only contain alphanumeric characters and hyphens.
 * The result is lowercased and truncated to 30 characters.
 */
export function getGitBranchSuffix(cwd?: string): string | null {
  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", {
      cwd: cwd ?? process.cwd(),
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();

    if (!branch || branch === "HEAD") {
      return null;
    }

    // Sanitize for bundle ID:
    // - Replace invalid characters with hyphens
    // - Collapse multiple hyphens
    // - Remove leading/trailing hyphens
    // - Lowercase
    // - Truncate to 30 chars
    const sanitized = branch
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 30);

    return sanitized || null;
  } catch {
    return null;
  }
}
