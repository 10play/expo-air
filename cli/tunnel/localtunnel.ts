import localtunnel from "localtunnel";

interface TunnelInfo {
  url: string;
  host: string;
}

interface LocalTunnelInstance {
  url: string;
  close: () => void;
}

export class LocalTunnel {
  private tunnel: LocalTunnelInstance | null = null;

  async start(port: number): Promise<TunnelInfo> {
    this.tunnel = await localtunnel({ port });

    // localtunnel returns https URLs like https://random-name.loca.lt
    const url = this.tunnel.url;

    return {
      url,
      host: url.replace(/^https?:\/\//, ""),
    };
  }

  async stop(): Promise<void> {
    if (this.tunnel) {
      this.tunnel.close();
      this.tunnel = null;
    }
  }

  getUrl(): string | null {
    return this.tunnel?.url ?? null;
  }
}
