// logger.js - Logging configuration using Winston
const winston = require('winston');
const morgan = require('morgan');
const { format } = winston;

// Define log levels
const logLevels = {
    levels: {
        error: 0,
        warn: 1,
        info: 2,
        http: 3,
        debug: 4,
    },
    colors: {
        error: 'red',
        warn: 'yellow',
        info: 'green',
        http: 'magenta',
        debug: 'blue',
    },
};

// Add colors to Winston
winston.addColors(logLevels.colors);

// Determine log level based on environment
const getLogLevel = () => {
    const env = process.env.NODE_ENV || 'development';
    const isDevelopment = env === 'development';
    return isDevelopment ? 'debug' : 'info';
};

// Custom format for structured JSON logging in production
const structuredLogFormat = format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
);

// Custom format for readable logs in development
const readableLogFormat = format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    format.errors({ stack: true }),
    format.splat(),
    format.colorize({ all: true }),
    format.printf(({ level, message, timestamp, service, ...metadata }) => {
        let metaStr = '';

        if (Object.keys(metadata).length > 0 && metadata.stack) {
            // Format error stack
            metaStr = `\n${metadata.stack}`;
        } else if (Object.keys(metadata).length > 0) {
            // Format other metadata
            metaStr = Object.keys(metadata).length ? `\n${JSON.stringify(metadata, null, 2)}` : '';
        }

        const serviceName = service || 'streambridge';
        return `${timestamp} [${serviceName}] ${level}: ${message}${metaStr}`;
    })
);

// Create Winston logger
const logger = winston.createLogger({
    level: getLogLevel(),
    levels: logLevels.levels,
    defaultMeta: { service: process.env.SERVICE_NAME || 'streambridge' },
    format: process.env.NODE_ENV === 'production' ? structuredLogFormat : readableLogFormat,
    transports: [
        // Console transport
        new winston.transports.Console(),

        // File transports
        ...(process.env.LOG_TO_FILE === 'true' ? [
            // Error log file
            new winston.transports.File({
                filename: process.env.LOG_ERROR_FILE || 'logs/error.log',
                level: 'error',
                maxsize: 10 * 1024 * 1024, // 10MB
                maxFiles: 5,
                tailable: true,
            }),

            // Combined log file
            new winston.transports.File({
                filename: process.env.LOG_COMBINED_FILE || 'logs/combined.log',
                maxsize: 10 * 1024 * 1024, // 10MB
                maxFiles: 5,
                tailable: true,
            }),
        ] : [])
    ],
    // Exit on error
    exitOnError: false,
});

// Create HTTP request logger middleware using Morgan
const httpLogger = morgan(
    // Format string - combined format with response time
    ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" - :response-time ms',
    {
        // Stream logs through Winston
        stream: {
            write: (message) => logger.http(message.trim()),
        },
    }
);

// Create a child logger with additional metadata
const createChildLogger = (metadata) => {
    return logger.child(metadata);
};

// Function to create a transaction logger for tracking message flow
const createTransactionLogger = (transactionId, metadata = {}) => {
    return createChildLogger({
        transactionId,
        ...metadata,
    });
};

// Audit logger for security events
const auditLogger = createChildLogger({ type: 'audit' });

// Function to log audit events
const logAuditEvent = (eventType, userInfo, resourceInfo, actionDetails, success) => {
    auditLogger.info(`${eventType}: ${actionDetails}`, {
        eventType,
        user: userInfo,
        resource: resourceInfo,
        action: actionDetails,
        success,
        timestamp: new Date().toISOString(),
    });
};

module.exports = {
    logger,
    httpLogger,
    createChildLogger,
    createTransactionLogger,
    logAuditEvent,
};