import { createHash, randomUUID } from "node:crypto";

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}

export function stableId(...parts: Array<string | number | undefined | null>): string {
  const body = parts
    .filter((part) => part !== undefined && part !== null && String(part).length > 0)
    .map((part) => String(part).toLowerCase().replace(/[^a-z0-9._:/@-]+/g, "-"))
    .join("__");
  const hash = createHash("sha1").update(body).digest("hex").slice(0, 10);
  const base = body.slice(0, 86).replace(/^-+|-+$/g, "");
  return `${base || "id"}__${hash}`;
}
