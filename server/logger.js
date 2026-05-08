// Structured logger built on pino. In dev, output is pretty-printed for
// readability. In prod, output is line-delimited JSON to stdout — PM2 captures
// it; pipe through `jq` or `pino-pretty` when reading back.
//
// Usage: const logger = require('./logger'); logger.info({ email }, 'Login');
// First arg = structured fields, second arg = human message.

const pino = require('pino');
const config = require('./config');

const isDev = config.nodeEnv !== 'production';

const logger = pino({
    level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
    ...(isDev && {
        transport: {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'HH:MM:ss.l',
                ignore: 'pid,hostname',
            },
        },
    }),
});

module.exports = logger;
