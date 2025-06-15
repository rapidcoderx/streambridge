// errorQueue.js - Handler for failed message processing
const { publishToQueue } = require('../config/rabbitmq');
const { publishMessage: publishToKafka } = require('../config/kafka');
const { logger } = require('../utils/logger');

// Error queue configuration
const ERROR_QUEUE = process.env.ERROR_QUEUE || 'streambridge.error';
const ERROR_TOPIC = process.env.ERROR_TOPIC || 'streambridge.errors';
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || '3');

// Handle failed message processing
const handleFailedMessage = async (source, messageData) => {
    try {
        // Create error message with metadata
        const errorMessage = {
            source,
            timestamp: new Date().toISOString(),
            error: messageData.error,
            retryCount: messageData.retryCount || 0,
            originalMessage: source === 'kafka'
                ? {
                    topic: messageData.topic,
                    partition: messageData.message.partition,
                    offset: messageData.message.offset,
                    key: messageData.message.key ? messageData.message.key.toString() : null,
                    value: messageData.message.value ? messageData.message.value.toString() : null,
                    headers: messageData.message.headers || {}
                }
                : {
                    queue: messageData.queue,
                    content: messageData.message.content ? messageData.message.content.toString() : null,
                    properties: messageData.message.properties || {},
                    fields: messageData.message.fields || {}
                }
        };

        logger.warn(`Moving failed message to error queue: ${JSON.stringify({
            source,
            error: messageData.error,
            retryCount: errorMessage.retryCount
        })}`);

        // Determine if message should be retried or sent to dead letter queue
        if (errorMessage.retryCount < MAX_RETRIES) {
            await sendToRetryQueue(source, { ...errorMessage, retryCount: errorMessage.retryCount + 1 });
            logger.info(`Message scheduled for retry ${errorMessage.retryCount + 1}/${MAX_RETRIES}`);
            return true;
        } else {
            await sendToDeadLetterQueue(source, errorMessage);
            logger.warn(`Message moved to dead letter queue after ${MAX_RETRIES} failed attempts`);
            return true;
        }
    } catch (error) {
        logger.error('Error handling failed message:', error);
        return false;
    }
};

// Send message to retry queue with exponential backoff
const sendToRetryQueue = async (source, errorMessage) => {
    try {
        // Calculate delay using exponential backoff
        const retryDelayMs = Math.pow(2, errorMessage.retryCount) * 1000; // 2^n seconds
        const retryAt = new Date(Date.now() + retryDelayMs).toISOString();

        // Add retry metadata
        const retryMessage = {
            ...errorMessage,
            retryAt,
            retryDelay: retryDelayMs
        };

        // Send to appropriate retry mechanism based on source
        if (source === 'kafka') {
            const retryTopic = process.env.RETRY_TOPIC || 'streambridge.retry';
            await publishToKafka(retryTopic, retryMessage);
            logger.debug(`Failed message sent to Kafka retry topic ${retryTopic}`);
        } else {
            const retryQueue = process.env.RETRY_QUEUE || 'streambridge.retry';
            const retryExchange = process.env.RETRY_EXCHANGE || 'streambridge.retry';

            // Use message TTL for delayed retry if supported
            await publishToQueue(retryQueue, retryMessage, {
                queueOptions: {
                    deadLetterExchange: '',
                    deadLetterRoutingKey: errorMessage.originalMessage.queue, // Route back to original queue
                    messageTtl: retryDelayMs // Message TTL for delayed retry
                },
                messageOptions: {
                    expiration: retryDelayMs.toString()
                }
            });

            logger.debug(`Failed message sent to RabbitMQ retry queue ${retryQueue}`);
        }

        return true;
    } catch (error) {
        logger.error('Error sending message to retry queue:', error);
        throw error;
    }
};

// Send message to dead letter queue for permanent failures
const sendToDeadLetterQueue = async (source, errorMessage) => {
    try {
        // Add dead letter metadata
        const dlqMessage = {
            ...errorMessage,
            movedToDLQ: new Date().toISOString(),
            finalStatus: 'failed'
        };

        // Send to appropriate DLQ based on source
        if (source === 'kafka') {
            const dlqTopic = process.env.DLQ_TOPIC || 'streambridge.dlq';
            await publishToKafka(dlqTopic, dlqMessage);
            logger.debug(`Failed message sent to Kafka DLQ topic ${dlqTopic}`);
        } else {
            const dlqQueue = process.env.DLQ_QUEUE || 'streambridge.dlq';
            const dlqExchange = process.env.DLQ_EXCHANGE || 'streambridge.dlq';

            await publishToQueue(dlqQueue, dlqMessage, {
                queueOptions: {
                    durable: true,
                    // Typically DLQ messages should not expire
                }
            });

            logger.debug(`Failed message sent to RabbitMQ DLQ ${dlqQueue}`);
        }

        return true;
    } catch (error) {
        logger.error('Error sending message to dead letter queue:', error);
        throw error;
    }
};

// Process messages from the retry queue
const processRetryQueue = async () => {
    // This function would be implemented to read from retry queue
    // and republish messages to their original destinations when retryAt time is reached
};

module.exports = {
    handleFailedMessage,
    sendToRetryQueue,
    sendToDeadLetterQueue,
    processRetryQueue
};