import * as net from "net";

/**
 * Check if a port is available (not in use)
 */
export function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();

    socket.setTimeout(1000);

    socket.on("connect", () => {
      // Port is in use (something responded)
      socket.destroy();
      resolve(false);
    });

    socket.on("timeout", () => {
      // Timeout usually means port is free
      socket.destroy();
      resolve(true);
    });

    socket.on("error", () => {
      // Connection refused = port is free
      socket.destroy();
      resolve(true);
    });

    socket.connect(port, "127.0.0.1");
  });
}

/**
 * Find a free port starting from the given port.
 * Tries up to maxAttempts consecutive ports.
 */
export async function findFreePort(
  startPort: number,
  maxAttempts: number = 10
): Promise<number> {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(
    `Could not find a free port starting from ${startPort} (tried ${maxAttempts} ports)`
  );
}
