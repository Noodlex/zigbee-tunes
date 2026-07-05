import winston from 'winston';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export function createLogger(level: LogLevel = 'info') {
  return winston.createLogger({
    level,
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.colorize(),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
        return `${timestamp} ${level} ${message}${metaStr}`;
      }),
    ),
    transports: [new winston.transports.Console()],
  });
}

export type Logger = ReturnType<typeof createLogger>;
