export type LogLevel = "debug" | "info" | "warn" | "error";

const severity: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/** Set once at startup from `LOG_LEVEL`; events below it are dropped. */
let threshold: LogLevel = "info";

export function setLogLevel(level: LogLevel): void {
  threshold = level;
}

export function currentLogLevel(): LogLevel {
  return threshold;
}

export function isLogLevelEnabled(level: LogLevel): boolean {
  return severity[level] >= severity[threshold];
}

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

/**
 * One JSON line per event. Keys that look like credentials are redacted
 * before serialisation, whatever the caller passed.
 */
export function log(
  level: LogLevel,
  event: string,
  context: Record<string, unknown> = {},
) {
  if (!isLogLevelEnabled(level)) return;
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
