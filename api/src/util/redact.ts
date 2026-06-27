const SECRET_NAME = /(api[_-]?key|token|secret|password|passwd|private[_-]?key|client[_-]?secret|access[_-]?key)/i;
const LONG_TOKEN = /(["'=:\s])([A-Za-z0-9_\-./+=]{28,})(["'\s,;)}\]]?)/g;

export function redactSecrets(input: string): string {
  return input
    .split("\n")
    .map((line) => {
      if (SECRET_NAME.test(line)) {
        return line.replace(/(["']?)([A-Za-z0-9_./-]{8,})(["']?)(\s*[,;)]?\s*)$/g, "$1[REDACTED]$3$4");
      }
      return line.replace(LONG_TOKEN, "$1[REDACTED]$3");
    })
    .join("\n");
}

export function compactForPrompt(input: unknown, maxChars: number): string {
  const text = typeof input === "string" ? input : JSON.stringify(input, null, 2);
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n...[truncated ${text.length - maxChars} chars]`;
}
