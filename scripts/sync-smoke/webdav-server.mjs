// A small WebDAV server for the smoke: Basic auth, MKCOL/PUT/GET/HEAD/
// DELETE/MOVE/PROPFIND on a temporary folder. It is a test fixture, not a
// general DAV implementation; it exists so the harness can exercise the
// WebDAV transport without Docker or a third-party account.
import { createServer } from "node:http";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

const esc = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function hrefFor(relative) {
  return `/dav/${relative
    .split("/")
    .map(encodeURIComponent)
    .join("/")}${relative.endsWith("/") ? "" : ""}`;
}

export async function startWebdav({ root, username, password }) {
  await mkdir(root, { recursive: true });
  const server = createServer(async (request, response) => {
    const expected = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
    if (request.headers.authorization !== expected) {
      response.writeHead(401, {
        "WWW-Authenticate": 'Basic realm="sync-smoke"',
      });
      response.end();
      return;
    }
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    let relative;
    try {
      relative = decodeURIComponent(url.pathname);
    } catch {
      response.writeHead(400).end();
      return;
    }
    if (!relative.startsWith("/dav/")) {
      response.writeHead(404).end();
      return;
    }
    relative = relative.slice("/dav/".length).replace(/^\/+/, "");
    const target = resolve(root, relative);
    if (target !== root && !target.startsWith(root + sep)) {
      response.writeHead(403).end();
      return;
    }
    const method = request.method ?? "GET";
    try {
      if (method === "GET" || method === "HEAD") {
        const info = await stat(target);
        if (!info.isFile())
          throw Object.assign(new Error("not a file"), { code: "EISDIR" });
        const bytes = await readFile(target);
        response.writeHead(200, {
          "Content-Length": String(bytes.length),
          "Content-Type": "application/octet-stream",
        });
        response.end(method === "HEAD" ? undefined : bytes);
        return;
      }
      if (method === "PUT") {
        await mkdir(dirname(target), { recursive: true });
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        await writeFile(target, Buffer.concat(chunks));
        response.writeHead(201).end();
        return;
      }
      if (method === "MKCOL") {
        await mkdir(target);
        response.writeHead(201).end();
        return;
      }
      if (method === "DELETE") {
        await rm(target, { recursive: true });
        response.writeHead(204).end();
        return;
      }
      if (method === "MOVE") {
        const destination = request.headers.destination;
        if (!destination) {
          response.writeHead(400).end();
          return;
        }
        const path = decodeURIComponent(
          new URL(destination, "http://127.0.0.1").pathname,
        );
        if (!path.startsWith("/dav/")) {
          response.writeHead(403).end();
          return;
        }
        const to = resolve(root, path.slice("/dav/".length));
        if (to !== root && !to.startsWith(root + sep)) {
          response.writeHead(403).end();
          return;
        }
        if (request.headers.overwrite === "F") {
          try {
            await stat(to);
            response.writeHead(412).end();
            return;
          } catch {
            // The destination is free.
          }
        }
        await mkdir(dirname(to), { recursive: true });
        await rm(to, { recursive: true, force: true });
        await rename(target, to);
        response.writeHead(201).end();
        return;
      }
      if (method === "PROPFIND") {
        const info = await stat(target);
        const depth = request.headers.depth === "0" ? 0 : 1;
        const entries = [];
        const add = async (absolute, webRelative, isDirectory) => {
          const name = webRelative.endsWith("/")
            ? webRelative
            : `${webRelative}/`;
          entries.push(
            `<D:response><D:href>${esc(hrefFor(isDirectory ? name : webRelative))}</D:href>` +
              `<D:propstat><D:prop><D:resourcetype>${isDirectory ? "<D:collection/>" : ""}</D:resourcetype>` +
              `</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`,
          );
          void absolute;
        };
        if (info.isDirectory()) {
          await add(target, relative, true);
          if (depth === 1) {
            for (const entry of await readdir(target, {
              withFileTypes: true,
            })) {
              await add(
                join(target, entry.name),
                `${relative.replace(/\/$/, "")}/${entry.name}${entry.isDirectory() ? "/" : ""}`,
                entry.isDirectory(),
              );
            }
          }
        } else {
          await add(target, relative, false);
        }
        response.writeHead(207, { "Content-Type": "application/xml" });
        response.end(
          `<?xml version="1.0" encoding="utf-8"?><D:multistatus xmlns:D="DAV:">${entries.join("")}</D:multistatus>`,
        );
        return;
      }
      response.writeHead(405).end();
    } catch (error) {
      const missing = error?.code === "ENOENT";
      response.writeHead(missing ? 404 : 409).end();
    }
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const { port } = server.address();
  return {
    endpoint: `http://127.0.0.1:${port}/dav`,
    close: () =>
      new Promise((done) => {
        server.close(() => done());
      }),
  };
}
