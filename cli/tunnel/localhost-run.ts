import { spawn, ChildProcess } from "child_process";

interface TunnelInfo {
  url: string;
  host: string;
}

export class LocalhostRunTunnel {
  private process: ChildProcess | null = null;
  private tunnelUrl: string | null = null;

  async start(port: number): Promise<TunnelInfo> {
    return new Promise((resolve, reject) => {
      // Use SSH to create tunnel via localhost.run
      // ssh -R 80:localhost:PORT localhost.run
      this.process = spawn("ssh", [
        "-o", "StrictHostKeyChecking=no",
        "-o", "ServerAliveInterval=60",
        "-R", `80:localhost:${port}`,
        "localhost.run"
      ], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let output = "";
      let resolved = false;

      const parseUrl = (data: string) => {
        output += data;

        // localhost.run outputs something like:
        // "https://abc123.localhost.run tunneled with tls termination"
        const match = output.match(/https:\/\/[^\s]+\.localhost\.run/);
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
          reject(new Error(`Failed to start localhost.run tunnel: ${err.message}`));
        }
      });

      this.process.on("exit", (code) => {
        if (!resolved) {
          reject(new Error(`localhost.run exited with code ${code}\nOutput: ${output}`));
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
