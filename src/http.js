export async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

export function sendJson(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

export function sendXml(res, status, xml) {
  res.writeHead(status, {
    "content-type": "text/xml; charset=utf-8",
    "content-length": Buffer.byteLength(xml)
  });
  res.end(xml);
}

export function parseJson(rawBody) {
  if (!rawBody) return {};
  return JSON.parse(rawBody);
}

export function parseForm(rawBody) {
  return Object.fromEntries(new URLSearchParams(rawBody));
}

export function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
