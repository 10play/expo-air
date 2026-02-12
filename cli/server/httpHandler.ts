import http from "http";
import { parseMultipartAndSave } from "./multipartParser.js";
import { serverLog } from "./serverLogger.js";

export interface HttpHandlerDeps {
  port: number;
  secret: string | null;
  imageDir: string;
  retriggerHMR: () => void;
}

/**
 * Create an HTTP request handler for the prompt server.
 * Handles CORS, authentication, file uploads, and HMR retrigger.
 */
export function createHttpHandler(deps: HttpHandlerDeps): (req: http.IncomingMessage, res: http.ServerResponse) => void {
  return (req: http.IncomingMessage, res: http.ServerResponse) => {
    const reqUrl = new URL(req.url || "/", `http://localhost:${deps.port}`);

    // CORS headers for the widget
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Validate secret for all non-OPTIONS requests
    if (deps.secret && reqUrl.searchParams.get("secret") !== deps.secret) {
      serverLog("Rejected unauthorized HTTP request", "error");
      res.writeHead(401);
      res.end("Unauthorized");
      return;
    }

    if (req.method === "POST" && reqUrl.pathname === "/upload") {
      handleUpload(req, res, deps.imageDir);
      return;
    }

    if (reqUrl.pathname === "/hmr-retrigger" && req.method === "POST") {
      deps.retriggerHMR();
      res.writeHead(200);
      res.end("OK");
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  };
}

function handleUpload(req: http.IncomingMessage, res: http.ServerResponse, imageDir: string): void {
  const contentType = req.headers["content-type"] || "";

  if (!contentType.includes("multipart/form-data")) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Expected multipart/form-data" }));
    return;
  }

  const boundaryMatch = contentType.match(/boundary=(.+)/);
  if (!boundaryMatch) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "No boundary in content-type" }));
    return;
  }

  const boundary = boundaryMatch[1];
  const chunks: Buffer[] = [];

  req.on("data", (chunk: Buffer) => {
    chunks.push(chunk);
  });

  req.on("end", () => {
    try {
      const body = Buffer.concat(chunks);
      const paths = parseMultipartAndSave(body, boundary, imageDir);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ paths }));
      serverLog(`Uploaded ${paths.length} image(s)`, "info");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      serverLog(`Upload error: ${msg}`, "error");
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: msg }));
    }
  });

  req.on("error", (error) => {
    serverLog(`Upload stream error: ${error.message}`, "error");
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: error.message }));
  });
}
