// producer.js - RabbitMQ producer implementation
const { publishMessage, publishToQueue } = require('../../config/rabbitmq');
const { logger, createTransactionLogger } = require('../../utils/logger');
const { recordMessagePublish, startMessageProcessingTimer } = require('../../metrics/prometheus');
const { validateMessage } = require('../../api/validators/messageValidator');
const { broadcast } = require('../../websocket/server');
const env = require('../../config/environment');

/**
 * Publish a message to a RabbitMQ exchange
 * @param {string} exchange - RabbitMQ exchange
 * @param {string} routingKey - Routing key
 * @param {any} message - Message to publish
 * @param {object} options - Publication options
 * @returns {Promise<object>} - Publication result
 */
const produceToExchange = async (exchange, routingKey, message, options = {}) => {
    // Create transaction ID
    const transactionId = options.transactionId || `rabbitmq-${exchange}-${routingKey}-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    const txLogger = createTransactionLogger(transactionId, { source: 'rabbitmq', exchange, routingKey });

    // Start timing message processing
    const endTimer = startMessageProcessingTimer('rabbitmq', exchange, options.messageType || 'unknown', 'publish');

    try {
        txLogger.debug(`Publishing message to RabbitMQ exchange ${exchange} with routing key ${routingKey}`);

        // Extract message type for validation
        const messageType = options.messageType || 'default';

        // Validate message schema if enabled
        if (env.VALIDATE_MESSAGES) {
            const validationResult = await validateMessage(messageType, message);

            if (!validationResult.valid) {
                txLogger.warn(`Message validation failed: ${validationResult.error}`);

                if (options.requireValidation) {
                    throw new Error(`Message validation failed: ${validationResult.error}`);
                }
            }
        }

        // Prepare message options
        const messageOptions = {
            persistent: options.persistent !== false,
            contentType: options.contentType || 'application/json',
            contentEncoding: options.contentEncoding || (env.ENCRYPT_MESSAGES ? 'encrypted' : 'utf8'),
            messageId: options.messageId || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`,
            timestamp: options.timestamp || Math.floor(Date.now() / 1000),
            type: messageType,
            headers: {
                ...(options.headers || {}),
                'x-transaction-id': transactionId,
                'x-published-at': new Date().toISOString(),
                'x-published-by': options.userId || 'system',
                'x-message-type': messageType
            }
        };

        // Publish message to RabbitMQ exchange
        const result = await publishMessage(
            exchange,
            routingKey,
            message,
            {
                exchangeType: options.exchangeType || 'topic',
                exchangeOptions: options.exchangeOptions,
                messageOptions
            }
        );

        // Record successful publish in metrics
        recordMessagePublish('rabbitmq', exchange, messageType);

        // End timing
        endTimer();

        // Broadcast to WebSocket clients if enabled
        if (options.broadcast !== false) {
            const broadcastTopics = options.broadcastTopics || [exchange, routingKey, 'rabbitmq', 'all'];

            const wsMessage = {
                type: 'message',
                source: 'rabbitmq',
                exchange,
                routingKey,
                timestamp: new Date().toISOString(),
                transactionId,
                headers: messageOptions.headers,
                message
            };

            broadcast(wsMessage, broadcastTopics);
            txLogger.debug(`Message broadcast to WebSocket clients on topics: ${broadcastTopics.join(', ')}`);
        }

        txLogger.info(`Message successfully published to RabbitMQ exchange ${exchange} with routing key ${routingKey}`);

        // Return result with transaction ID
        return {
            success: true,
            transactionId,
            result
        };
    } catch (error) {
        txLogger.error(`Error publishing message to RabbitMQ exchange ${exchange} with routing key ${routingKey}:`, error);

        // Record failed publish in metrics
        recordMessagePublish('rabbitmq', exchange, options.messageType || 'unknown', 'error');

        // End timing with error
        endTimer(true);

        throw error;
    }
};

/**
 * Publish a message directly to a RabbitMQ queue
 * @param {string} queue - RabbitMQ queue
 * @param {any} message - Message to publish
 * @param {object} options - Publication options
 * @returns {Promise<object>} - Publication result
 */
const produceToQueue = async (queue, message, options = {}) => {
    // Create transaction ID
    const transactionId = options.transactionId || `rabbitmq-queue-${queue}-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    const txLogger = createTransactionLogger(transactionId, { source: 'rabbitmq', queue });

    // Start timing message processing
    const endTimer = startMessageProcessingTimer('rabbitmq', queue, options.messageType || 'unknown', 'publish');

    try {
        txLogger.debug(`Publishing message directly to RabbitMQ queue ${queue}`);

        // Extract message type for validation
        const messageType = options.messageType || 'default';

        // Validate message schema if enabled
        if (env.VALIDATE_MESSAGES) {
            const validationResult = await validateMessage(messageType, message);

            if (!validationResult.valid) {
                txLogger.warn(`Message validation failed: ${validationResult.error}`);

                if (options.requireValidation) {
                    throw new Error(`Message validation failed: ${validationResult.error}`);
                }
            }
        }

        // Prepare message options
        const messageOptions = {
            persistent: options.persistent !== false,
            contentType: options.contentType || 'application/json',
            contentEncoding: options.contentEncoding || (env.ENCRYPT_MESSAGES ? 'encrypted' : 'utf8'),
            messageId: options.messageId || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`,
            timestamp: options.timestamp || Math.floor(Date.now() / 1000),
            type: messageType,
            headers: {
                ...(options.headers || {}),
                'x-transaction-id': transactionId,
                'x-published-at': new Date().toISOString(),
                'x-published-by': options.userId || 'system',
                'x-message-type': messageType
            }
        };

        // Publish message directly to RabbitMQ queue
        const result = await publishToQueue(
            queue,
            message,
            {
                queueOptions: options.queueOptions,
                messageOptions
            }
        );

        // Record successful publish in metrics
        recordMessagePublish('rabbitmq', queue, messageType);

        // End timing
        endTimer();

        // Broadcast to WebSocket clients if enabled
        if (options.broadcast !== false) {
            const broadcastTopics = options.broadcastTopics || [queue, 'rabbitmq', 'all'];

            const wsMessage = {
                type: 'message',
                source: 'rabbitmq',
                queue,
                timestamp: new Date().toISOString(),
                transactionId,
                headers: messageOptions.headers,
                message
            };

            broadcast(wsMessage, broadcastTopics);
            txLogger.debug(`Message broadcast to WebSocket clients on topics: ${broadcastTopics.join(', ')}`);
        }

        txLogger.info(`Message successfully published directly to RabbitMQ queue ${queue}`);

        // Return result with transaction ID
        return {
            success: true,
            transactionId,
            result
        };
    } catch (error) {
        txLogger.error(`Error publishing message directly to RabbitMQ queue ${queue}:`, error);

        // Record failed publish in metrics
        recordMessagePublish('rabbitmq', queue, options.messageType || 'unknown', 'error');

        // End timing with error
        endTimer(true);

        throw error;
    }
};

/**
 * Get information about RabbitMQ queues
 * @returns {Promise<Array>} - List of queues
 */
const getQueues = async () => {
    try {
        // This is a placeholder. In a real implementation,
        // you would query RabbitMQ Management API for queue information.
        // For now, we'll return a static list.
        return [
            { name: 'tasks', messageCount: 42, consumers: 2 },
            { name: 'notifications', messageCount: 0, consumers: 1 },
            { name: 'emails', messageCount: 13, consumers: 0 },
        ];
    } catch (error) {
        logger.error('Error getting RabbitMQ queues:', error);
        throw error;
    }
};

/**
 * Get information about RabbitMQ exchanges
 * @returns {Promise<Array>} - List of exchanges
 */
const getExchanges = async () => {
    try {
        // This is a placeholder. In a real implementation,
        // you would query RabbitMQ Management API for exchange information.
        // For now, we'll return a static list.
        return [
            { name: 'events', type: 'topic', queues: ['tasks', 'notifications'] },
            { name: 'direct-exchange', type: 'direct', queues: ['emails'] },
        ];
    } catch (error) {
        logger.error('Error getting RabbitMQ exchanges:', error);
        throw error;
    }
};

module.exports = {
    produceToExchange,
    produceToQueue,
    getQueues,
    getExchanges
};