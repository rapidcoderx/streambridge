// producer.js - Kafka producer implementation
const { publishMessage } = require('../../config/kafka');
const { logger, createTransactionLogger } = require('../../utils/logger');
const { recordMessagePublish, startMessageProcessingTimer } = require('../../metrics/prometheus');
const { validateMessage } = require('../../api/validators/messageValidator');
const { broadcast } = require('../../websocket/server');
const env = require('../../config/environment');

/**
 * Publish a message to a Kafka topic
 * @param {string} topic - Kafka topic
 * @param {any} message - Message to publish (object or string)
 * @param {object} options - Publication options
 * @returns {Promise<object>} - Publication result
 */
const produceMessage = async (topic, message, options = {}) => {
    // Create transaction ID
    const transactionId = options.transactionId || `kafka-${topic}-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    const txLogger = createTransactionLogger(transactionId, { source: 'kafka', topic });

    // Start timing message processing
    const endTimer = startMessageProcessingTimer('kafka', topic, options.messageType || 'unknown', 'publish');

    try {
        txLogger.debug(`Publishing message to Kafka topic ${topic}`);

        // Prepare headers
        const headers = {
            ...(options.headers || {}),
            'x-transaction-id': transactionId,
            'x-published-at': new Date().toISOString(),
            'x-published-by': options.userId || 'system',
            'x-message-type': options.messageType || 'default'
        };

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

        // Prepare key
        const key = options.key || null;

        // Publish message to Kafka
        const result = await publishMessage(topic, message, key, headers);

        // Record successful publish in metrics
        recordMessagePublish('kafka', topic, messageType);

        // End timing
        endTimer();

        // Broadcast to WebSocket clients if enabled
        if (options.broadcast !== false) {
            const broadcastTopics = options.broadcastTopics || [topic, 'kafka', 'all'];

            const wsMessage = {
                type: 'message',
                source: 'kafka',
                topic,
                timestamp: new Date().toISOString(),
                transactionId,
                headers,
                message
            };

            broadcast(wsMessage, broadcastTopics);
            txLogger.debug(`Message broadcast to WebSocket clients on topics: ${broadcastTopics.join(', ')}`);
        }

        txLogger.info(`Message successfully published to Kafka topic ${topic}`);

        // Return result with transaction ID
        return {
            success: true,
            transactionId,
            result
        };
    } catch (error) {
        txLogger.error(`Error publishing message to Kafka topic ${topic}:`, error);

        // Record failed publish in metrics
        recordMessagePublish('kafka', topic, options.messageType || 'unknown', 'error');

        // End timing with error
        endTimer(true);

        throw error;
    }
};

/**
 * Get information about Kafka topics
 * @returns {Promise<Array>} - List of topics
 */
const getTopics = async () => {
    try {
        // This is a placeholder. In a real implementation,
        // you would query Kafka for topic information.
        // For now, we'll return a static list.
        return [
            { name: 'messages', messageCount: 1250, partitions: 3 },
            { name: 'notifications', messageCount: 428, partitions: 2 },
            { name: 'events', messageCount: 3892, partitions: 5 },
            { name: 'logs', messageCount: 15783, partitions: 4 },
        ];
    } catch (error) {
        logger.error('Error getting Kafka topics:', error);
        throw error;
    }
};

module.exports = {
    produceMessage,
    getTopics
};