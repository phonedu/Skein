// Minimal S3 client for the smoke harness: reads the remote head, lists the
// test prefix and deletes it, so verification and cleanup do not depend on
// the app or on an external plugin checkout.
import { createHash, createHmac } from "node:crypto";

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const hmac = (key, data) => createHmac("sha256", key).update(data).digest();
const rfc3986 = (value) =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
const xmlText = (value) =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

export function providerFrom(value, source) {
  const required = ["endpoint", "region", "bucket", "accessKey", "secretKey"];
  for (const key of required) {
    if (!value?.[key]) throw new Error(`${source}: missing ${key}`);
  }
  return {
    transport: "s3",
    endpoint: String(value.endpoint).replace(/\/+$/, ""),
    region: value.region,
    bucket: value.bucket,
    accessKey: value.accessKey,
    secretKey: value.secretKey,
    pathStyle: value.pathStyle !== false,
  };
}

export function providerFromWebdav(value, source) {
  for (const key of ["endpoint", "username", "password"]) {
    if (!value?.[key]) throw new Error(`${source}: missing ${key}`);
  }
  return {
    transport: "dav",
    endpoint: String(value.endpoint).replace(/\/+$/, ""),
    username: value.username,
    password: value.password,
    prefix: value.prefix ?? "",
  };
}

function signed(provider, { method = "GET", key = "", query = {}, body }) {
  const endpoint = new URL(`${provider.endpoint}/`);
  const path =
    `/${rfc3986(provider.bucket)}` +
    (key ? `/${key.split("/").map(rfc3986).join("/")}` : "");
  const url = new URL(endpoint);
  url.pathname = new URL(`https://x${path}`).pathname;
  const entries = Object.entries(query).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  url.search = entries
    .map(([name, value]) => `${rfc3986(name)}=${rfc3986(String(value))}`)
    .join("&");

  const payload = body ?? Buffer.alloc(0);
  const payloadHash = sha256(payload);
  const now = new Date();
  const amzDate = now
    .toISOString()
    .replace(/[:-]|\.\d{3}/g, "")
    .replace("Z", "Z");
  const date = amzDate.slice(0, 8);
  const headers = {
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.entries(headers)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([name, value]) => `${name}:${String(value).trim()}\n`)
    .join("");
  const canonicalRequest = [
    method,
    url.pathname,
    url.search.slice(1),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const scope = `${date}/${provider.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256(canonicalRequest),
  ].join("\n");
  const kDate = hmac(`AWS4${provider.secretKey}`, date);
  const kRegion = hmac(kDate, provider.region);
  const kService = hmac(kRegion, "s3");
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning)
    .update(stringToSign)
    .digest("hex");
  headers.authorization =
    `AWS4-HMAC-SHA256 Credential=${provider.accessKey}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return fetch(url, {
    method,
    headers,
    body: body ?? undefined,
  });
}

function davAuthorization(provider) {
  return `Basic ${Buffer.from(`${provider.username}:${provider.password}`).toString("base64")}`;
}

function davUrl(provider, key) {
  const base = provider.endpoint.replace(/\/+$/, "");
  return `${base}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

async function davRequest(provider, method, key, { headers = {}, body } = {}) {
  return fetch(davUrl(provider, key), {
    method,
    headers: {
      Authorization: davAuthorization(provider),
      ...headers,
    },
    body,
  });
}

async function davGet(provider, key) {
  const response = await davRequest(provider, "GET", key);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GET ${key}: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function davList(provider, prefix) {
  const keys = [];
  const seen = new Set();
  const base = new URL(`${provider.endpoint.replace(/\/+$/, "")}/`).pathname;
  const wanted = prefix.replace(/\/+$/, "");
  const walk = async (dir) => {
    if (seen.has(dir)) return;
    seen.add(dir);
    const response = await davRequest(provider, "PROPFIND", dir, {
      headers: { Depth: "1", "Content-Type": "application/xml" },
      body:
        '<?xml version="1.0"?><D:propfind xmlns:D="DAV:"><D:prop>' +
        "<D:resourcetype/></D:prop></D:propfind>",
    });
    if (response.status === 404) return;
    if (!response.ok && response.status !== 207) {
      throw new Error(`PROPFIND ${dir}: ${response.status}`);
    }
    const xml = await response.text();
    const hrefs = [
      ...xml.matchAll(/<[^>]*href[^>]*>([^<]*)<\/[^>]*href>/gi),
    ].map((match) => xmlText(match[1]));
    for (const href of hrefs) {
      const path = decodeURIComponent(
        new URL(href, `${provider.endpoint.replace(/\/+$/, "")}/`).pathname,
      );
      if (!path.startsWith(base)) continue;
      const relative = path.slice(base.length).replace(/\/+$/, "");
      if (!relative || relative === dir) continue;
      if (wanted && relative !== wanted && !relative.startsWith(`${wanted}/`)) {
        continue;
      }
      if (href.endsWith("/")) await walk(relative);
      else keys.push(relative);
    }
  };
  await walk(wanted);
  return keys;
}

export async function getObject(provider, key) {
  if (provider.transport === "dav") return davGet(provider, key);
  const response = await signed(provider, { key });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`GET ${key}: ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  return bytes;
}

export async function getHead(provider, prefix) {
  const bytes = await getObject(provider, `${prefix}/v1/head.json`);
  if (!bytes) return null;
  return JSON.parse(bytes.toString("utf8"));
}

export async function listKeys(provider, prefix) {
  if (provider.transport === "dav") return davList(provider, prefix);
  const keys = [];
  let token;
  do {
    const query = {
      "list-type": "2",
      prefix,
      "max-keys": "1000",
      ...(token ? { "continuation-token": token } : {}),
    };
    const response = await signed(provider, { query });
    if (!response.ok) {
      throw new Error(`LIST ${prefix}: ${response.status}`);
    }
    const xml = await response.text();
    for (const match of xml.matchAll(/<Key>([^<]*)<\/Key>/g)) {
      keys.push(xmlText(match[1]));
    }
    token = xml.match(
      /<NextContinuationToken>([^<]*)<\/NextContinuationToken>/,
    )?.[1];
  } while (token);
  return keys;
}

export async function putObject(provider, key, bytes) {
  if (provider.transport === "dav") {
    const response = await davRequest(provider, "PUT", key, { body: bytes });
    if (!response.ok) throw new Error(`PUT ${key}: ${response.status}`);
    return;
  }
  const response = await signed(provider, { method: "PUT", key, body: bytes });
  if (!response.ok) {
    throw new Error(`PUT ${key}: ${response.status}`);
  }
}

export async function deleteKey(provider, key) {
  if (provider.transport === "dav") {
    const response = await davRequest(provider, "DELETE", key);
    if (!response.ok && response.status !== 404) {
      throw new Error(`DELETE ${key}: ${response.status}`);
    }
    return;
  }
  const response = await signed(provider, { method: "DELETE", key });
  if (!response.ok && response.status !== 404) {
    throw new Error(`DELETE ${key}: ${response.status}`);
  }
}

export async function deletePrefix(provider, prefix) {
  const keys = await listKeys(provider, prefix);
  for (const key of keys) await deleteKey(provider, key);
  return keys;
}
