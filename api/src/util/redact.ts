const SECRET_KEY_WORD = "api[_-]?key|token|secret|password|passwd|private[_-]?key|client[_-]?secret|access[_-]?key";
const SECRET_NAME = new RegExp(SECRET_KEY_WORD, "i");
const LONG_TOKEN = /(["'=:\s])([A-Za-z0-9_\-./+=]{28,})(["'\s,;)}\]]?)/g;
const KNOWN_TOKEN_PREFIX = /\b((?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9_]{8,}|gh[pousr]_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})\b/g;
const SECRET_ASSIGNMENT = new RegExp(
  `((?:${SECRET_KEY_WORD})\\w*["']?\\s*[:=]\\s*["'])([^"'\\n;,)]+)(["'])`,
  "gi",
);
const SECRET_OBJECT_VALUE = new RegExp(
  `(["']?(?:${SECRET_KEY_WORD})\\w*["']?\\s*:\\s*["'])([^"'\\n;,)]+)(["'])`,
  "gi",
);

export function redactSecrets(input: string): string {
  return input
    .split("\n")
    .map((line) => {
      const knownRedacted = line.replace(KNOWN_TOKEN_PREFIX, "[REDACTED]");
      const assignmentRedacted = knownRedacted
        .replace(SECRET_ASSIGNMENT, "$1[REDACTED]$3")
        .replace(SECRET_OBJECT_VALUE, "$1[REDACTED]$3");
      if (/^\s*["']name["']\s*:/.test(assignmentRedacted)) {
        return assignmentRedacted;
      }
      if (SECRET_NAME.test(assignmentRedacted)) {
        return assignmentRedacted
          .replace(/(["']?)([A-Za-z0-9_./+=-]{16,})(["']?)(\s*[,;)}\]]?\s*)$/g, "$1[REDACTED]$3$4")
          .replace(LONG_TOKEN, "$1[REDACTED]$3");
      }
      return assignmentRedacted.replace(LONG_TOKEN, "$1[REDACTED]$3");
    })
    .join("\n");
}

export function compactForPrompt(input: unknown, maxChars: number): string {
  const text = redactSecrets(typeof input === "string" ? input : JSON.stringify(input, null, 2));
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n...[truncated ${text.length - maxChars} chars]`;
}
