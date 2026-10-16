import { createRequire } from "node:module";
import pino, { type Logger as PinoInstance } from "pino";
import type { LogFields, Logger } from "../../application/ports/logger.js";

export function createPinoLogger(level: string): Logger {
  return new PinoLogger(pino({ level, transport: prettyTransport() }));
}

class PinoLogger implements Logger {
  constructor(private readonly pino: PinoInstance) {}

  debug(message: string, fields?: LogFields): void {
    this.pino.debug(serialize(fields), message);
  }
  info(message: string, fields?: LogFields): void {
    this.pino.info(serialize(fields), message);
  }
  warn(message: string, fields?: LogFields): void {
    this.pino.warn(serialize(fields), message);
  }
  error(message: string, fields?: LogFields): void {
    this.pino.error(serialize(fields), message);
  }
  child(fields: LogFields): Logger {
    return new PinoLogger(this.pino.child(fields));
  }
}

/** pino only serializes errors under the `err` key; accept them anywhere. */
function serialize(fields: LogFields | undefined): LogFields {
  if (!fields) return {};
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, value instanceof Error ? pino.stdSerializers.err(value) : value]),
  );
}

function prettyTransport(): pino.TransportSingleOptions | undefined {
  if (!process.stdout.isTTY) return undefined;
  try {
    createRequire(import.meta.url).resolve("pino-pretty");
    return { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" } };
  } catch {
    return undefined;
  }
}
