// environment.js - Environment configuration
const dotenv = require('dotenv');
const path = require('path');
const { logger } = require('../utils/logger');

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Define environment variables with defaults
const environment = {
    // Application
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: parseInt(process.env.PORT || '5045', 10),
    SERVICE_NAME: process.env.SERVICE_NAME || 'streambridge',
    VERSION: process.env.VERSION || '1.0.0',

    // HTTPS/SSL
    USE_HTTPS: process.env.USE_HTTPS === 'true',
    SSL_KEY_PATH: process.env.SSL_KEY_PATH,
    SSL_CERT_PATH: process.env.SSL_CERT_PATH,

    // CORS
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['*'],

    // Authentication
    JWT_SECRET: process.env.JWT_SECRET || 'streambridge-jwt-secret-key-change-in-production',
    JWT_EXPIRATION: process.env.JWT_EXPIRATION || '24h',
    JWT_REFRESH_EXPIRATION: process.env.JWT_REFRESH_EXPIRATION || '7d',
    JWT_ISSUER: process.env.JWT_ISSUER || 'streambridge',
    JWT_AUDIENCE: process.env.JWT_AUDIENCE ? process.env.JWT_AUDIENCE.split(',') : ['streambridge-client'],
    USE_REFRESH_TOKENS: process.env.USE_REFRESH_TOKENS === 'true',

    // Rate limiting
    RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes

    // Encryption
    ENCRYPT_MESSAGES: process.env.ENCRYPT_MESSAGES === 'true',
    ENCRYPTION_ALGORITHM: process.env.ENCRYPTION_ALGORITHM || 'aes-256-gcm',
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || '01234567890123456789012345678901', // 32 bytes for AES-256

    // WebSocket
    WEBSOCKET_PATH: process.env.WEBSOCKET_PATH || '/ws',
    WEBSOCKET_AUTH_REQUIRED: process.env.WEBSOCKET_AUTH_REQUIRED === 'true',
    ALLOWED_WEBSOCKET_ORIGINS: process.env.ALLOWED_WEBSOCKET_ORIGINS ?
        process.env.ALLOWED_WEBSOCKET_ORIGINS.split(',') : undefined,

    // Kafka
    KAFKA_BROKERS: process.env.KAFKA_BROKERS ? process.env.KAFKA_BROKERS.split(',') : ['localhost:9092'],
    KAFKA_CLIENT_ID: process.env.KAFKA_CLIENT_ID || 'streambridge',
    KAFKA_USE_SSL: process.env.KAFKA_USE_SSL === 'true',
    KAFKA_REJECT_UNAUTHORIZED: process.env.KAFKA_REJECT_UNAUTHORIZED !== 'false',
    KAFKA_CA_CERT: process.env.KAFKA_CA_CERT,
    KAFKA_CLIENT_KEY: process.env.KAFKA_CLIENT_KEY,
    KAFKA_CLIENT_CERT: process.env.KAFKA_CLIENT_CERT,
    KAFKA_USE_SASL: process.env.KAFKA_USE_SASL === 'true',
    KAFKA_SASL_MECHANISM: process.env.KAFKA_SASL_MECHANISM || 'plain',
    KAFKA_SASL_USERNAME: process.env.KAFKA_SASL_USERNAME,
    KAFKA_SASL_PASSWORD: process.env.KAFKA_SASL_PASSWORD,
    KAFKA_CONNECTION_TIMEOUT: parseInt(process.env.KAFKA_CONNECTION_TIMEOUT || '30000', 10),
    KAFKA_REQUEST_TIMEOUT: parseInt(process.env.KAFKA_REQUEST_TIMEOUT || '30000', 10),
    KAFKA_AUTO_CREATE_TOPICS: process.env.KAFKA_AUTO_CREATE_TOPICS === 'true',
    KAFKA_READ_FROM_BEGINNING: process.env.KAFKA_READ_FROM_BEGINNING === 'true',
    KAFKA_PARTITIONS_CONSUMED_CONCURRENTLY: parseInt(process.env.KAFKA_PARTITIONS_CONSUMED_CONCURRENTLY || '1', 10),
    KAFKA_SESSION_TIMEOUT: parseInt(process.env.KAFKA_SESSION_TIMEOUT || '30000', 10),
    KAFKA_HEARTBEAT_INTERVAL: parseInt(process.env.KAFKA_HEARTBEAT_INTERVAL || '3000', 10),
    KAFKA_TRANSACTIONAL_ID: process.env.KAFKA_TRANSACTIONAL_ID,

    // RabbitMQ
    RABBITMQ_HOST: process.env.RABBITMQ_HOST || 'localhost',
    RABBITMQ_PORT: parseInt(process.env.RABBITMQ_PORT || '5672', 10),
    RABBITMQ_USERNAME: process.env.RABBITMQ_USERNAME || 'guest',
    RABBITMQ_PASSWORD: process.env.RABBITMQ_PASSWORD || 'guest',
    RABBITMQ_VHOST: process.env.RABBITMQ_VHOST || '/',
    RABBITMQ_USE_SSL: process.env.RABBITMQ_USE_SSL === 'true',
    RABBITMQ_REJECT_UNAUTHORIZED: process.env.RABBITMQ_REJECT_UNAUTHORIZED !== 'false',
    RABBITMQ_CA_CERT: process.env.RABBITMQ_CA_CERT,
    RABBITMQ_CLIENT_CERT: process.env.RABBITMQ_CLIENT_CERT,
    RABBITMQ_CLIENT_KEY: process.env.RABBITMQ_CLIENT_KEY,
    RABBITMQ_CERT_PASSPHRASE: process.env.RABBITMQ_CERT_PASSPHRASE,
    RABBITMQ_HEARTBEAT: parseInt(process.env.RABBITMQ_HEARTBEAT || '60', 10),
    RABBITMQ_PREFETCH_COUNT: parseInt(process.env.RABBITMQ_PREFETCH_COUNT || '10', 10),
    RABBITMQ_PREFETCH_GLOBAL: process.env.RABBITMQ_PREFETCH_GLOBAL === 'true',
    RABBITMQ_PUBLISHER_CONFIRMS: process.env.RABBITMQ_PUBLISHER_CONFIRMS === 'true',

    // Error Handling
    ERROR_QUEUE: process.env.ERROR_QUEUE || 'streambridge.error',
    ERROR_TOPIC: process.env.ERROR_TOPIC || 'streambridge.errors',
    RETRY_QUEUE: process.env.RETRY_QUEUE || 'streambridge.retry',
    RETRY_TOPIC: process.env.RETRY_TOPIC || 'streambridge.retry',
    DLQ_QUEUE: process.env.DLQ_QUEUE || 'streambridge.dlq',
    DLQ_TOPIC: process.env.DLQ_TOPIC || 'streambridge.dlq',
    MAX_RETRIES: parseInt(process.env.MAX_RETRIES || '3', 10),
    REQUEUE_FAILED_MESSAGES: process.env.REQUEUE_FAILED_MESSAGES === 'true',

    // Logging
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    LOG_TO_FILE: process.env.LOG_TO_FILE === 'true',
    LOG_ERROR_FILE: process.env.LOG_ERROR_FILE || 'logs/error.log',
    LOG_COMBINED_FILE: process.env.LOG_COMBINED_FILE || 'logs/combined.log',

    // Message Validation
    VALIDATE_MESSAGES: process.env.VALIDATE_MESSAGES === 'true',

    // Prometheus metrics
    METRICS_ENABLED: process.env.METRICS_ENABLED !== 'false',

    // Development and Testing
    SEED_API_KEYS: process.env.SEED_API_KEYS === 'true',
};

// Validate critical configuration
const validateConfig = () => {
    // Warn about insecure defaults in production
    if (environment.NODE_ENV === 'production') {
        if (environment.JWT_SECRET === 'streambridge-jwt-secret-key-change-in-production') {
            logger.warn('WARNING: Using default JWT_SECRET in production environment!');
        }

        if (environment.ENCRYPTION_KEY === '01234567890123456789012345678901') {
            logger.warn('WARNING: Using default ENCRYPTION_KEY in production environment!');
        }

        if (environment.ALLOWED_ORIGINS.includes('*')) {
            logger.warn('WARNING: CORS is configured to allow all origins (*) in production environment!');
        }
    }

    // Check for minimal required configuration
    if (environment.USE_HTTPS && (!environment.SSL_KEY_PATH || !environment.SSL_CERT_PATH)) {
        logger.error('HTTPS is enabled but SSL_KEY_PATH or SSL_CERT_PATH is not set!');
        process.exit(1);
    }

    // Check SASL configuration
    if (environment.KAFKA_USE_SASL && (!environment.KAFKA_SASL_USERNAME || !environment.KAFKA_SASL_PASSWORD)) {
        logger.error('Kafka SASL is enabled but KAFKA_SASL_USERNAME or KAFKA_SASL_PASSWORD is not set!');
        process.exit(1);
    }
};

// Validate configuration
validateConfig();

// Export environment configuration
module.exports = environment;