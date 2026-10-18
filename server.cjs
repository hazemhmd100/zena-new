const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname);
const port = Number(process.env.PORT || 5509);
const host = process.env.HOST || "127.0.0.1";
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};
const backupDir = path.join(root, "backups");
const maxBackupBytes = 20 * 1024 * 1024;

function sendText(res, status, body) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(body);
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function safeBackupFileName(value) {
  const cleaned = String(value || "backup.json")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  const base = path.basename(cleaned || "backup.json");
  return base.toLowerCase().endsWith(".json") ? base : `${base}.json`;
}

function handleBackupRequest(req, res) {
  let size = 0;
  const chunks = [];

  req.on("data", (chunk) => {
    size += chunk.length;
    if (size > maxBackupBytes) {
      sendJson(res, 413, { ok: false, error: "Backup is too large" });
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });

  req.on("end", () => {
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      const payload = typeof body.payload === "string" ? body.payload : "";
      if (!payload) {
        sendJson(res, 400, { ok: false, error: "Missing backup payload" });
        return;
      }

      const fileName = safeBackupFileName(body.fileName);
      fs.mkdir(backupDir, { recursive: true }, (mkdirError) => {
        if (mkdirError) {
          sendJson(res, 500, { ok: false, error: "Could not create backups folder" });
          return;
        }

        const target = path.join(backupDir, fileName);
        fs.writeFile(target, payload, "utf8", (writeError) => {
          if (writeError) {
            sendJson(res, 500, { ok: false, error: "Could not write backup" });
            return;
          }
          sendJson(res, 200, { ok: true, fileName, path: target });
        });
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: "Invalid backup request" });
    }
  });
}

function resolveRequestPath(reqUrl) {
  const pathname = (reqUrl || "/").split("?")[0] || "/";
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch (error) {
    return { error: "Bad request", status: 400 };
  }

  if (decoded.includes("\0")) return { error: "Bad request", status: 400 };

  const requested = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const file = path.resolve(root, requested);
  const relative = path.relative(root, file);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return { error: "Forbidden", status: 403 };
  }

  return { file };
}

const server = http.createServer((req, res) => {
  if (req.method === "POST" && (req.url || "").split("?")[0] === "/api/backup") {
    handleBackupRequest(req, res);
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    sendText(res, 405, "Method not allowed");
    return;
  }

  const resolved = resolveRequestPath(req.url);
  if (resolved.error) {
    sendText(res, resolved.status, resolved.error);
    return;
  }

  const file = resolved.file;

  fs.readFile(file, (error, data) => {
    if (error) {
      sendText(res, 404, "Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": types[path.extname(file)] || "text/plain; charset=utf-8" });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    res.end(data);
  });
});

function getNetworkUrls() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((address) => address && address.family === "IPv4" && !address.internal)
    .map((address) => `http://${address.address}:${port}/`);
}

server.listen(port, host, () => {
  console.log(`Cafe POS is running locally at http://localhost:${port}/`);
  if (host === "0.0.0.0") {
    getNetworkUrls().forEach((url) => console.log(`Cafe POS is available on your network at ${url}`));
  }
});
