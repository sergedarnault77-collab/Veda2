/** Node/VercelResponse version */
export function setTraceHeaders(req: any, res: any) {
  const rid = (req.headers?.["x-veda-request-id"] as string) || "";
  if (rid) res.setHeader("x-veda-request-id", rid);
  res.setHeader("x-veda-handler-entered", "1");
  res.setHeader("content-type", "application/json; charset=utf-8");
}

/** Edge Runtime version — extracts request ID and returns headers to merge into Response */
export function traceHeadersEdge(req: Request): Record<string, string> {
  const rid = req.headers.get("x-veda-request-id") || "";
  const h: Record<string, string> = {
    "x-veda-handler-entered": "1",
    "content-type": "application/json; charset=utf-8",
  };
  if (rid) h["x-veda-request-id"] = rid;
  return h;
}
