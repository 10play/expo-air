/**
 * Metro HMR WebSocket Auto-Reconnect
 *
 * Patches global.WebSocket to wrap Metro's HMR connections with automatic
 * reconnection. When the HMR WebSocket disconnects (tunnel drops, WiFi issues,
 * app backgrounding), this module auto-reconnects and tells the prompt server
 * to re-touch uncommitted files so Metro re-pushes HMR updates.
 *
 * Must be imported early in the app lifecycle, before Metro's HMR client
 * creates its WebSocket connection.
 */

/* eslint-disable @typescript-eslint/no-var-requires */

declare const __DEV__: boolean;
declare const globalThis: {
  WebSocket: typeof WebSocket;
  fetch: typeof fetch;
};

if (typeof __DEV__ !== "undefined" && __DEV__) {
  console.log("[expo-air:hmr] Initializing HMR auto-reconnect module");

  const OriginalWebSocket = globalThis.WebSocket;

  // Get the prompt server URL for retrigger requests
  let serverHttpUrl: string | null = null;
  try {
    const ExpoAirModule =
      require("./ExpoAirModule").default ?? require("./ExpoAirModule");
    const wsUrl: string = ExpoAirModule.getServerUrl?.();
    console.log("[expo-air:hmr] Server URL from native module:", wsUrl);
    if (wsUrl) {
      serverHttpUrl = wsUrl
        .replace(/^ws:/, "http:")
        .replace(/^wss:/, "https:");
      console.log("[expo-air:hmr] HTTP URL for retrigger:", serverHttpUrl);
    } else {
      console.warn("[expo-air:hmr] getServerUrl() returned empty/null");
    }
  } catch (e) {
    console.warn("[expo-air:hmr] Failed to get server URL:", e);
  }

  const MAX_ATTEMPTS = 50;
  const BASE_DELAY = 2000;
  const MAX_DELAY = 30000;

  function isMetroHMRUrl(url: string): boolean {
    return typeof url === "string" && url.includes("/hot");
  }

  function notifyServerOfReconnection(): void {
    if (!serverHttpUrl) {
      console.log(
        "[expo-air:hmr] Cannot retrigger - no server URL available"
      );
      return;
    }
    console.log(
      "[expo-air:hmr] Sending retrigger request to:",
      `${serverHttpUrl}/hmr-retrigger`
    );
    globalThis
      .fetch(`${serverHttpUrl}/hmr-retrigger`, { method: "POST" })
      .then((res) => {
        console.log("[expo-air:hmr] Retrigger response status:", res.status);
      })
      .catch((err) => {
        console.warn("[expo-air:hmr] Retrigger request failed:", err);
      });
  }

  type Handler = ((...args: any[]) => void) | null;

  globalThis.WebSocket = function ReconnectingWebSocket(
    this: any,
    url: string,
    protocols?: string | string[]
  ) {
    // Non-HMR connections pass through unchanged
    if (!isMetroHMRUrl(url)) {
      if (protocols !== undefined) {
        return new OriginalWebSocket(url, protocols);
      }
      return new OriginalWebSocket(url);
    }

    console.log("[expo-air:hmr] Wrapping Metro HMR WebSocket:", url);

    let inner: WebSocket | null = null;
    const handlers: Record<string, Handler> = {
      open: null,
      close: null,
      message: null,
      error: null,
    };
    const eventListeners: Record<string, Set<Function>> = {
      open: new Set(),
      close: new Set(),
      message: new Set(),
      error: new Set(),
    };

    let attempts = 0;
    let intentionalClose = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    // Capture HMR protocol messages for replay on reconnection.
    // Metro's server tears down all client state (including file-change listeners)
    // when the WebSocket disconnects. On reconnect, the client must re-send
    // register-entrypoints so Metro knows which bundles to watch.
    const registrationMessages: string[] = [];

    // The wrapper object returned to the HMR client
    const wrapper: any = Object.create(OriginalWebSocket.prototype);

    function dispatch(type: string, event: any): void {
      const handler = handlers[type];
      if (handler) handler.call(wrapper, event);
      const set = eventListeners[type];
      if (set) {
        for (const fn of set) {
          fn.call(wrapper, event);
        }
      }
    }

    function connect(): void {
      let ws: WebSocket;
      try {
        console.log(
          `[expo-air:hmr] ${attempts > 0 ? "Re-c" : "C"}onnecting HMR WebSocket to:`,
          url
        );
        ws = protocols
          ? new OriginalWebSocket(url, protocols)
          : new OriginalWebSocket(url);
      } catch (e) {
        console.warn("[expo-air:hmr] WebSocket creation failed:", e);
        scheduleReconnect();
        return;
      }

      inner = ws;

      ws.onopen = (event: Event) => {
        const wasReconnect = attempts > 0;
        attempts = 0;

        console.log(
          `[expo-air:hmr] HMR WebSocket ${wasReconnect ? "RE" : ""}connected`
        );

        if (wasReconnect && registrationMessages.length > 0) {
          // Re-send captured registration messages BEFORE notifying HMR client.
          // Metro's server resets all client state on disconnect, so we must
          // re-register entrypoints for Metro to set up file-change listeners.
          console.log(
            `[expo-air:hmr] Replaying ${registrationMessages.length} registration messages`
          );
          for (const msg of registrationMessages) {
            try {
              ws.send(msg);
            } catch (e) {
              console.warn("[expo-air:hmr] Failed to replay message:", e);
            }
          }
        }

        dispatch("open", event);

        if (wasReconnect) {
          console.log(
            "[expo-air:hmr] Reconnected, re-registered, requesting file retrigger"
          );
          // Delay retrigger to let Metro process registration and set up listeners
          setTimeout(notifyServerOfReconnection, 2000);
        }
      };

      ws.onmessage = (event: MessageEvent) => {
        dispatch("message", event);
      };

      ws.onerror = (event: Event) => {
        console.warn("[expo-air:hmr] HMR WebSocket error");
        dispatch("error", event);
      };

      ws.onclose = (event: CloseEvent) => {
        if (intentionalClose) {
          dispatch("close", event);
          return;
        }

        console.log(
          "[expo-air:hmr] HMR WebSocket disconnected (code:",
          (event as any)?.code,
          "), will auto-reconnect..."
        );
        scheduleReconnect();
      };
    }

    function scheduleReconnect(): void {
      if (attempts >= MAX_ATTEMPTS) {
        console.warn(
          `[expo-air:hmr] Gave up reconnecting after ${MAX_ATTEMPTS} attempts`
        );

        dispatch("close", {
          code: 1006,
          reason: "Max reconnect attempts reached",
        });
        return;
      }
      attempts++;
      const delay = Math.min(
        BASE_DELAY * Math.pow(1.5, attempts - 1),
        MAX_DELAY
      );
      const jitter = delay * (0.8 + Math.random() * 0.4);
      console.log(
        `[expo-air:hmr] Reconnect attempt ${attempts}/${MAX_ATTEMPTS} in ${Math.round(jitter / 1000)}s`
      );
      reconnectTimer = setTimeout(connect, jitter);
    }

    // on* handler properties
    for (const type of ["open", "close", "message", "error"] as const) {
      Object.defineProperty(wrapper, `on${type}`, {
        get: () => handlers[type],
        set: (fn: Handler) => {
          handlers[type] = fn;
        },
        configurable: true,
        enumerable: true,
      });
    }

    Object.defineProperties(wrapper, {
      readyState: {
        get: () => (inner ? inner.readyState : OriginalWebSocket.CLOSED),
        configurable: true,
      },
      url: {
        get: () => url,
        configurable: true,
      },
      protocol: {
        get: () => (inner ? inner.protocol : ""),
        configurable: true,
      },
      extensions: {
        get: () => (inner ? inner.extensions : ""),
        configurable: true,
      },
      bufferedAmount: {
        get: () => (inner ? inner.bufferedAmount : 0),
        configurable: true,
      },
      binaryType: {
        get: () => (inner ? inner.binaryType : "blob"),
        set: (val: BinaryType) => {
          if (inner) inner.binaryType = val;
        },
        configurable: true,
      },
    });

    wrapper.send = (data: any) => {
      // Capture HMR protocol messages needed for reconnection
      if (typeof data === "string") {
        try {
          const parsed = JSON.parse(data);
          if (
            parsed.type === "register-entrypoints" ||
            parsed.type === "log-opt-in"
          ) {
            // Update: keep latest version of each message type
            const idx = registrationMessages.findIndex((m) => {
              try {
                return JSON.parse(m).type === parsed.type;
              } catch {
                return false;
              }
            });
            if (idx >= 0) {
              registrationMessages[idx] = data;
            } else {
              registrationMessages.push(data);
            }
            console.log(
              `[expo-air:hmr] Captured ${parsed.type} message for reconnection replay`
            );
          }
        } catch {
          // Not JSON, ignore
        }
      }
      if (inner && inner.readyState === OriginalWebSocket.OPEN) {
        inner.send(data);
      }
    };

    wrapper.close = (code?: number, reason?: string) => {
      intentionalClose = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (inner) inner.close(code, reason);
    };

    wrapper.addEventListener = (
      type: string,
      listener: Function,
      _options?: any
    ) => {
      const set = eventListeners[type];
      if (set) set.add(listener);
    };

    wrapper.removeEventListener = (type: string, listener: Function) => {
      const set = eventListeners[type];
      if (set) set.delete(listener);
    };

    wrapper.dispatchEvent = () => false;

    connect();
    return wrapper;
  } as any;

  // Copy static constants
  (globalThis.WebSocket as any).CONNECTING = OriginalWebSocket.CONNECTING;
  (globalThis.WebSocket as any).OPEN = OriginalWebSocket.OPEN;
  (globalThis.WebSocket as any).CLOSING = OriginalWebSocket.CLOSING;
  (globalThis.WebSocket as any).CLOSED = OriginalWebSocket.CLOSED;

  // Log final initialization state
  console.log("[expo-air:hmr] Module initialized", {
    serverHttpUrl: serverHttpUrl ? "set" : "NOT SET",
    webSocketPatched: true,
  });
}
