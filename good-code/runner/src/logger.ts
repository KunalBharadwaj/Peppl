// Minimal zero-dependency structured logger: one JSON object per line, so logs
// are machine-parseable and can be filtered/joined across services by shared
// fields (notably `replId`, the workspace's join key). `child()` binds fields
// once — e.g. a per-connection logger carrying replId — so every line for that
// workspace is tagged without repeating the field at each call site.

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogFields {
  [key: string]: unknown;
}

const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) || "info";

// Errors don't JSON.stringify usefully (they serialize to {}), so pull out the
// parts worth logging.
function serialize(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

function normalizeFields(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [k, v] of Object.entries(fields)) out[k] = serialize(v);
  return out;
}

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  child(bindings: LogFields): Logger;
}

function createLogger(service: string, base: LogFields = {}): Logger {
  const log = (level: LogLevel, msg: string, fields: LogFields = {}) => {
    if (LEVEL_RANK[level] < LEVEL_RANK[MIN_LEVEL]) return;
    const record = {
      ts: new Date().toISOString(),
      level,
      service,
      msg,
      ...base,
      ...normalizeFields(fields),
    };
    const line = JSON.stringify(record);
    if (level === "error" || level === "warn") console.error(line);
    else console.log(line);
  };

  return {
    debug: (msg, fields) => log("debug", msg, fields),
    info: (msg, fields) => log("info", msg, fields),
    warn: (msg, fields) => log("warn", msg, fields),
    error: (msg, fields) => log("error", msg, fields),
    child: (bindings) => createLogger(service, { ...base, ...normalizeFields(bindings) }),
  };
}

// Root logger for this service. Import and `.child({ replId })` per connection.
export const logger = createLogger(process.env.SERVICE_NAME || "runner");
