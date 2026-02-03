import { spawn, ChildProcess, execSync } from "child_process";
import { createWriteStream, existsSync, mkdirSync, chmodSync, unlinkSync } from "fs";
import { join } from "path";
import { get } from "https";
import { homedir, platform, arch } from "os";

interface TunnelInfo {
  url: string;
  host: string;
}

export class CloudflareTunnel {
  private process: ChildProcess | null = null;
  private tunnelUrl: string | null = null;
  private binPath: string;

  constructor() {
    const cacheDir = join(homedir(), ".cache", "expo-air");
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true });
    }
    this.binPath = join(cacheDir, "cloudflared");
  }

  async ensureBinary(): Promise<void> {
    // Check if binary exists
    if (existsSync(this.binPath)) {
      try {
        execSync(`"${this.binPath}" --version`, { encoding: "utf-8", stdio: "pipe" });
        return;
      } catch {
        // Binary exists but can't run, re-download
      }
    }

    const os = platform();
    const architecture = arch();

    let downloadUrl: string;
    let isZip = false;

    if (os === "darwin") {
      // macOS - use .tgz
      if (architecture === "arm64") {
        downloadUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64.tgz";
      } else {
        downloadUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz";
      }
    } else if (os === "linux") {
      // Linux - direct binary
      if (architecture === "arm64") {
        downloadUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64";
      } else {
        downloadUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64";
      }
    } else if (os === "win32") {
      downloadUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe";
    } else {
      throw new Error(`Unsupported platform: ${os}-${architecture}`);
    }

    console.log(`  Downloading cloudflared...`);

    const isTgz = downloadUrl.endsWith(".tgz");
    const cacheDir = join(homedir(), ".cache", "expo-air");

    if (isTgz) {
      const tgzPath = `${this.binPath}.tgz`;
      await this.downloadFile(downloadUrl, tgzPath);
      execSync(`tar -xzf "${tgzPath}" -C "${cacheDir}"`, { stdio: "ignore" });
      unlinkSync(tgzPath);
    } else {
      await this.downloadFile(downloadUrl, this.binPath);
    }

    // Make executable
    chmodSync(this.binPath, 0o755);
    console.log(`  ✓ cloudflared installed`);
  }

  private downloadFile(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = createWriteStream(dest);

      const request = (currentUrl: string) => {
        get(currentUrl, (response) => {
          // Handle redirects
          if (response.statusCode === 302 || response.statusCode === 301) {
            const redirectUrl = response.headers.location;
            if (redirectUrl) {
              request(redirectUrl);
              return;
            }
          }

          if (response.statusCode !== 200) {
            reject(new Error(`Download failed: ${response.statusCode}`));
            return;
          }

          response.pipe(file);
          file.on("finish", () => {
            file.close();
            resolve();
          });
        }).on("error", (err) => {
          reject(err);
        });
      };

      request(url);
    });
  }

  async start(port: number): Promise<TunnelInfo> {
    await this.ensureBinary();

    return new Promise((resolve, reject) => {
      // cloudflared tunnel --url http://localhost:PORT
      this.process = spawn(this.binPath, [
        "tunnel",
        "--url", `http://localhost:${port}`,
      ], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let output = "";
      let resolved = false;

      const parseUrl = (data: string) => {
        output += data;

        // cloudflared outputs something like:
        // "https://random-words.trycloudflare.com"
        const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
        if (match && !resolved) {
          resolved = true;
          this.tunnelUrl = match[0];
          resolve({
            url: this.tunnelUrl,
            host: this.tunnelUrl.replace("https://", ""),
          });
        }
      };

      this.process.stdout?.on("data", (data) => parseUrl(data.toString()));
      this.process.stderr?.on("data", (data) => parseUrl(data.toString()));

      this.process.on("error", (err) => {
        if (!resolved) {
          reject(new Error(`Failed to start cloudflared: ${err.message}`));
        }
      });

      this.process.on("exit", (code) => {
        if (!resolved) {
          reject(new Error(`cloudflared exited with code ${code}\nOutput: ${output}`));
        }
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (!resolved) {
          this.stop();
          reject(new Error(`Tunnel connection timeout.\nOutput: ${output}`));
        }
      }, 30000);
    });
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill("SIGTERM");
      this.process = null;
      this.tunnelUrl = null;
    }
  }

  getUrl(): string | null {
    return this.tunnelUrl;
  }
}
