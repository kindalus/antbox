export function getQuery(req: Request): Record<string, string> {
  const query = new URLSearchParams(req.url.split("?")[1]);
  const result: Record<string, string> = {};
  for (const [key, value] of query.entries()) {
    result[key] = value;
  }
  return result;
}
