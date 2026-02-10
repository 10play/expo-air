import { execSync, execFileSync } from "child_process";
import type { GitChange, BranchInfo } from "../types/messages.js";

export class GitOperations {
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  // --- Private helpers ---

  private execGit(command: string): string {
    return execSync(command, {
      cwd: this.projectRoot,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  }

  private execGitFile(args: string[]): string {
    return execFileSync("git", args, {
      cwd: this.projectRoot,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  }

  private execGitVoid(command: string): void {
    execSync(command, {
      cwd: this.projectRoot,
      stdio: ["pipe", "pipe", "pipe"],
    });
  }

  // --- Public query methods ---

  getBranchName(): string {
    try {
      return this.execGit("git rev-parse --abbrev-ref HEAD");
    } catch {
      return "main";
    }
  }

  getGitChanges(): GitChange[] {
    try {
      const output = this.execGit("git status --porcelain -u");

      if (!output) {
        return [];
      }

      return output
        .split("\n")
        .filter((line) => line.length >= 3)
        .map((line) => {
          const statusCode = line.substring(0, 2);
          const file = line.substring(3).trim();

          let status: GitChange["status"] = "modified";
          if (statusCode.includes("A") || statusCode === "??") {
            status = statusCode === "??" ? "untracked" : "added";
          } else if (statusCode.includes("D")) {
            status = "deleted";
          } else if (statusCode.includes("R")) {
            status = "renamed";
          }

          return { file, status };
        });
    } catch {
      return [];
    }
  }

  hasUncommittedChanges(): boolean {
    try {
      return this.execGit("git status --porcelain -u") !== "";
    } catch {
      return false;
    }
  }

  getGitRoot(): string {
    try {
      return this.execGit("git rev-parse --show-toplevel");
    } catch {
      return this.projectRoot;
    }
  }

  getPRStatus(): { hasPR: boolean; prUrl?: string } {
    try {
      const result = this.execGit("gh pr view --json url -q .url");
      return { hasPR: true, prUrl: result || undefined };
    } catch {
      return { hasPR: false };
    }
  }

  getRecentBranches(): BranchInfo[] {
    try {
      const output = this.execGit(
        "git branch --sort=-committerdate --format='%(refname:short)|%(committerdate:iso8601)'"
      );

      if (!output) return [];

      const currentBranch = this.getBranchName();
      const branches: BranchInfo[] = output
        .split("\n")
        .map((line) => {
          const [name, lastCommitDate] = line.split("|");
          return {
            name: name.trim(),
            isCurrent: name.trim() === currentBranch,
            lastCommitDate: lastCommitDate?.trim(),
          };
        });

      const localBranchNames = new Set(branches.map((b) => b.name));

      // Fetch remote branches
      try {
        const remoteOutput = this.execGit(
          "git branch -r --sort=-committerdate --format='%(refname:short)|%(committerdate:iso8601)'"
        );

        if (remoteOutput) {
          for (const line of remoteOutput.split("\n")) {
            const [rawName, lastCommitDate] = line.split("|");
            const trimmedRaw = rawName.trim();
            if (trimmedRaw === "origin/HEAD" || trimmedRaw.endsWith("/HEAD")) continue;
            const name = trimmedRaw.replace(/^origin\//, "");
            if (localBranchNames.has(name)) continue;
            branches.push({
              name,
              isCurrent: false,
              lastCommitDate: lastCommitDate?.trim(),
              isRemote: true,
            });
          }
        }
      } catch {
        // No remote branches or git error, skip
      }

      // Try to enrich with PR info
      try {
        const prOutput = this.execGit(
          "gh pr list --json headRefName,number,title --limit 10"
        );

        if (prOutput) {
          const prs = JSON.parse(prOutput) as Array<{
            headRefName: string;
            number: number;
            title: string;
          }>;
          for (const pr of prs) {
            const branch = branches.find((b) => b.name === pr.headRefName);
            if (branch) {
              branch.prNumber = String(pr.number);
              branch.prTitle = pr.title;
            }
          }
        }
      } catch {
        // gh CLI not available or not authenticated, skip PR enrichment
      }

      return branches;
    } catch {
      return [];
    }
  }

  isValidBranchName(name: string): boolean {
    if (!name || name.trim() !== name || name.length > 250) return false;
    if (/[\s~^:?*\[\]\\]/.test(name)) return false;
    if (/\.\./.test(name)) return false;
    if (/\/\//.test(name)) return false;
    if (name.endsWith(".") || name.endsWith("/") || name.endsWith(".lock")) return false;
    if (name.startsWith("-") || name.startsWith(".")) return false;
    return true;
  }

  // --- Public stash methods ---

  autoStash(branchTag: string): { didStash: boolean; error?: string } {
    if (!this.hasUncommittedChanges()) {
      return { didStash: false };
    }
    try {
      this.execGitFile(["stash", "push", "-u", "-m", `expo-air-auto-stash:${branchTag}`]);
      return { didStash: true };
    } catch (e) {
      return { didStash: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  autoPopStash(branchName: string): { popped: boolean; conflict: boolean } {
    try {
      const stashList = this.execGitFile(["stash", "list"]);
      const stashLines = stashList.split("\n");
      const autoStashIndex = stashLines.findIndex((line) =>
        line.endsWith(`expo-air-auto-stash:${branchName}`)
      );
      if (autoStashIndex === -1) {
        return { popped: false, conflict: false };
      }
      try {
        this.execGitFile(["stash", "pop", `stash@{${autoStashIndex}}`]);
        return { popped: true, conflict: false };
      } catch {
        // Merge conflict — reset working directory, stash is preserved
        try {
          this.execGitFile(["reset", "--hard", "HEAD"]);
        } catch {
          // best-effort reset
        }
        return { popped: false, conflict: true };
      }
    } catch {
      // stash list failed — not critical
      return { popped: false, conflict: false };
    }
  }

  restoreStashAfterFailure(): boolean {
    try {
      this.execGitFile(["stash", "pop"]);
      return true;
    } catch {
      return false;
    }
  }

  // --- Public mutation methods ---

  checkoutBranch(branchName: string): void {
    this.execGitFile(["checkout", branchName]);
  }

  createBranchFromMain(branchName: string): void {
    this.execGitFile(["fetch", "origin", "main"]);
    this.execGitFile(["checkout", "-b", branchName, "origin/main"]);
  }

  discardAllChanges(): void {
    this.execGitVoid("git checkout -- .");
    this.execGitVoid("git clean -fd");
  }
}
