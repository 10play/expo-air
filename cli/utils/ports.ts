import * as net from "net";

/**
 * Check if a port is listening (service is ready)
 */
export function waitForPort(port: number, timeout = 30000): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const tryConnect = () => {
      const socket = new net.Socket();

      socket.setTimeout(1000);

      socket.on("connect", () => {
        socket.destroy();
        resolve();
      });

      socket.on("timeout", () => {
        socket.destroy();
        if (Date.now() - startTime > timeout) {
          reject(new Error(`Timeout waiting for port ${port}`));
        } else {
          setTimeout(tryConnect, 500);
        }
      });

      socket.on("error", () => {
        socket.destroy();
        if (Date.now() - startTime > timeout) {
          reject(new Error(`Timeout waiting for port ${port}`));
        } else {
          setTimeout(tryConnect, 500);
        }
      });

      socket.connect(port, "127.0.0.1");
    };

    tryConnect();
  });
}

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
 * @param startPort - Port to start searching from
 * @param maxAttempts - Maximum number of consecutive ports to try
 * @param excludePorts - Ports to skip (already allocated by this session)
 */
export async function findFreePort(
  startPort: number,
  maxAttempts: number = 50,
  excludePorts: number[] = []
): Promise<number> {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    // Skip ports we've already allocated in this session
    if (excludePorts.includes(port)) {
      continue;
    }
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(
    `Could not find a free port starting from ${startPort} (tried ${maxAttempts} ports)`
  );
}
