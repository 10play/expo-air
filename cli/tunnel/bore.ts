import { spawn, ChildProcess, execSync } from "child_process";
import { createWriteStream, existsSync, mkdirSync, chmodSync } from "fs";
import { join } from "path";
import { get } from "https";
import { homedir, platform, arch } from "os";

const BORE_VERSION = "0.6.0";
const BORE_DEFAULT_SERVER = process.env.BORE_SERVER || "bore.pub";

interface BoreConfig {
  localPort: number;
  server?: string;
  remotePort?: number; // Optional fixed remote port
  secret?: string; // Optional HMAC secret for auth
}

interface TunnelInfo {
  url: string;
  host: string;
  port: number;
}

export class BoreTunnel {
  private process: ChildProcess | null = null;
  private tunnelUrl: string | null = null;
  private binPath: string;

  constructor() {
    const cacheDir = join(homedir(), ".cache", "expo-air");
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true });
    }
    this.binPath = join(cacheDir, "bore");
  }

  async ensureBinary(): Promise<void> {
    // Check if binary exists and is correct version
    if (existsSync(this.binPath)) {
      try {
        const version = execSync(`"${this.binPath}" --version`, { encoding: "utf-8" });
        if (version.includes(BORE_VERSION)) {
          return;
        }
        console.log(`  Updating bore to v${BORE_VERSION}...`);
      } catch {
        // Binary exists but can't run, re-download
      }
    }

    const os = platform();
    const architecture = arch();

    let target: string;
    if (os === "darwin") {
      target = architecture === "arm64"
        ? "aarch64-apple-darwin"
        : "x86_64-apple-darwin";
    } else if (os === "linux") {
      target = architecture === "arm64"
        ? "aarch64-unknown-linux-musl"
        : "x86_64-unknown-linux-musl";
    } else {
      throw new Error(`Unsupported platform: ${os}-${architecture}`);
    }

    const url = `https://github.com/ekzhang/bore/releases/download/v${BORE_VERSION}/bore-v${BORE_VERSION}-${target}.tar.gz`;

    console.log(`  Downloading bore v${BORE_VERSION}...`);

    const tarPath = `${this.binPath}.tar.gz`;
    await this.downloadFile(url, tarPath);

    // Extract binary
    const cacheDir = join(homedir(), ".cache", "expo-air");
    execSync(`tar -xzf "${tarPath}" -C "${cacheDir}"`, { stdio: "ignore" });
    execSync(`rm "${tarPath}"`, { stdio: "ignore" });

    // Make executable
    chmodSync(this.binPath, 0o755);

    console.log(`  ✓ bore installed to ${this.binPath}`);
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

  async start(config: BoreConfig): Promise<TunnelInfo> {
    await this.ensureBinary();

    const server = config.server || BORE_DEFAULT_SERVER;
    const secret = config.secret || process.env.BORE_SECRET;

    return new Promise((resolve, reject) => {
      const args = ["local", config.localPort.toString(), "--to", server];

      // Add fixed remote port if specified
      if (config.remotePort) {
        args.push("-p", config.remotePort.toString());
      }

      // Add secret for HMAC authentication
      if (secret) {
        args.push("-s", secret);
      }

      this.process = spawn(this.binPath, args, {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let output = "";
      let resolved = false;

      const parseUrl = (data: string) => {
        output += data;

        // bore outputs: "listening at bore.pub:XXXXX"
        const match = output.match(/listening at ([^\s]+):(\d+)/);
        if (match && !resolved) {
          resolved = true;
          const [, host, portStr] = match;
          const port = parseInt(portStr, 10);
          this.tunnelUrl = `ws://${host}:${port}`;
          resolve({
            url: this.tunnelUrl,
            host: `${host}:${port}`,
            port,
          });
        }
      };

      this.process.stdout?.on("data", (data) => parseUrl(data.toString()));
      this.process.stderr?.on("data", (data) => parseUrl(data.toString()));

      this.process.on("error", (err) => {
        if (!resolved) {
          reject(new Error(`Failed to start bore: ${err.message}`));
        }
      });

      this.process.on("exit", (code) => {
        if (!resolved) {
          reject(new Error(`bore exited with code ${code}\nOutput: ${output}`));
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
