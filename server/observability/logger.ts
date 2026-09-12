type LogLevel = "debug" | "info" | "warn" | "error";

const sensitiveKey =
  /authorization|cookie|secret|password|token|database_url|connection_string/i;

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(
        ([key, nestedValue]) => [
          key,
          sensitiveKey.test(key) ? "[REDACTED]" : redact(nestedValue),
        ],
      ),
    );
  }
  return value;
}

export function log(
  level: LogLevel,
  event: string,
  context: Record<string, unknown> = {},
) {
  const output = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...(redact(context) as Record<string, unknown>),
  };
  const method =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : console.info;
  method(JSON.stringify(output));
}
