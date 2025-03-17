// rabbitmq.js - RabbitMQ configuration and connection management
const amqp = require('amqplib');
const { logger } = require('../utils/logger');
const { encryptData, decryptData } = require('../utils/encryption');

// RabbitMQ connection configuration
const getRabbitMQUrl = () => {
    const protocol = process.env.RABBITMQ_USE_SSL === 'true' ? 'amqps' : 'amqp';
    const username = encodeURIComponent(process.env.RABBITMQ_USERNAME || 'guest');
    const password = encodeURIComponent(process.env.RABBITMQ_PASSWORD || 'guest');
    const host = process.env.RABBITMQ_HOST || 'localhost';
    const port = process.env.RABBITMQ_PORT || '5672';
    const vhost = encodeURIComponent(process.env.RABBITMQ_VHOST || '/');

    return `${protocol}://${username}:${password}@${host}:${port}/${vhost}`;
};

// Connection options
const getConnectionOptions = () => {
    const options = {
        heartbeat: parseInt(process.env.RABBITMQ_HEARTBEAT || '60'),
    };

    // SSL configuration
    if (process.env.RABBITMQ_USE_SSL === 'true') {
        options.ca = process.env.RABBITMQ_CA_CERT ? [Buffer.from(process.env.RABBITMQ_CA_CERT)] : undefined;
        options.cert = process.env.RABBITMQ_CLIENT_CERT ? Buffer.from(process.env.RABBITMQ_CLIENT_CERT) : undefined;
        options.key = process.env.RABBITMQ_CLIENT_KEY ? Buffer.from(process.env.RABBITMQ_CLIENT_KEY) : undefined;
        options.passphrase = process.env.RABBITMQ_CERT_PASSPHRASE || undefined;
        options.rejectUnauthorized = process.env.RABBITMQ_REJECT_UNAUTHORIZED !== 'false';
    }

    return options;
};

// Global connection and channel variables
let connection = null;
let producerChannel = null;
let consumerChannels = [];

// Connect to RabbitMQ
const connectRabbitMQ = async () => {
    try {
        if (!connection) {
            const url = getRabbitMQUrl();
            const options = getConnectionOptions();

            connection = await amqp.connect(url, options);
            logger.info('Connected to RabbitMQ');

            // Handle connection errors and recovery
            connection.on('error', async (error) => {
                logger.error('RabbitMQ connection error:', error);
                // Close connection to trigger reconnect
                await disconnectRabbitMQ();

                // Reconnect after delay
                setTimeout(async () => {
                    try {
                        await connectRabbitMQ();
                    } catch (reconnectError) {
                        logger.error('Failed to reconnect to RabbitMQ:', reconnectError);
                    }
                }, 5000); // 5 seconds delay
            });

            connection.on('close', () => {
                logger.info('RabbitMQ connection closed');
            });
        }

        // Create producer channel
        if (!producerChannel) {
            producerChannel = await connection.createChannel();
            logger.info('RabbitMQ producer channel created');

            // Set channel prefetch (QoS)
            await producerChannel.prefetch(
                parseInt(process.env.RABBITMQ_PREFETCH_COUNT || '10'),
                process.env.RABBITMQ_PREFETCH_GLOBAL === 'true'
            );

            // Handle channel errors
            producerChannel.on('error', (error) => {
                logger.error('RabbitMQ producer channel error:', error);
                producerChannel = null;
            });

            producerChannel.on('close', () => {
                logger.info('RabbitMQ producer channel closed');
                producerChannel = null;
            });
        }

        return true;
    } catch (error) {
        logger.error('Failed to connect to RabbitMQ:', error);
        throw error;
    }
};

// Disconnect from RabbitMQ
const disconnectRabbitMQ = async () => {
    try {
        // Close all consumer channels
        if (consumerChannels.length > 0) {
            await Promise.all(
                consumerChannels.map(async (channel) => {
                    try {
                        if (channel && channel.close) {
                            await channel.close();
                        }
                    } catch (error) {
                        logger.error('Error closing consumer channel:', error);
                    }
                })
            );
            consumerChannels = [];
            logger.info('All RabbitMQ consumer channels closed');
        }

        // Close producer channel
        if (producerChannel) {
            await producerChannel.close();
            producerChannel = null;
            logger.info('RabbitMQ producer channel closed');
        }

        // Close connection
        if (connection) {
            await connection.close();
            connection = null;
            logger.info('RabbitMQ connection closed');
        }

        return true;
    } catch (error) {
        logger.error('Error disconnecting from RabbitMQ:', error);
        throw error;
    }
};

// Create and configure exchange
const assertExchange = async (channel, exchange, type, options = {}) => {
    try {
        await channel.assertExchange(exchange, type, {
            durable: true,
            autoDelete: false,
            ...options
        });
        logger.debug(`Exchange ${exchange} asserted`);
    } catch (error) {
        logger.error(`Error asserting exchange ${exchange}:`, error);
        throw error;
    }
};

// Create and configure queue
const assertQueue = async (channel, queue, options = {}) => {
    try {
        const result = await channel.assertQueue(queue, {
            durable: true,
            ...options
        });
        logger.debug(`Queue ${queue} asserted`);
        return result;
    } catch (error) {
        logger.error(`Error asserting queue ${queue}:`, error);
        throw error;
    }
};

// Bind queue to exchange
const bindQueue = async (channel, queue, exchange, routingKey) => {
    try {
        await channel.bindQueue(queue, exchange, routingKey);
        logger.debug(`Queue ${queue} bound to exchange ${exchange} with routing key ${routingKey}`);
    } catch (error) {
        logger.error(`Error binding queue ${queue} to exchange ${exchange}:`, error);
        throw error;
    }
};

// Create a consumer channel and set up message handling
const createConsumer = async (queue, messageHandler, options = {}) => {
    try {
        if (!connection) {
            throw new Error('RabbitMQ connection not established');
        }

        // Create a dedicated channel for the consumer
        const channel = await connection.createChannel();

        // Set channel prefetch (QoS)
        await channel.prefetch(
            options.prefetchCount || parseInt(process.env.RABBITMQ_PREFETCH_COUNT || '10'),
            options.prefetchGlobal || process.env.RABBITMQ_PREFETCH_GLOBAL === 'true'
        );

        // Assert queue
        await assertQueue(channel, queue, {
            durable: true,
            ...options.queueOptions
        });

        // Set up consumer
        await channel.consume(queue, async (msg) => {
            if (!msg) return; // null message indicates consumer cancelled by server

            try {
                // Decrypt message if encryption is enabled
                let content;
                if (process.env.ENCRYPT_MESSAGES === 'true') {
                    content = decryptData(msg.content.toString());
                } else {
                    content = msg.content.toString();
                }

                // Parse JSON if content is JSON
                try {
                    content = JSON.parse(content);
                } catch (e) {
                    // Content is not JSON, use it as is
                }

                // Process message
                const processed = await messageHandler({
                    content,
                    fields: msg.fields,
                    properties: msg.properties,
                    queue
                });

                // Acknowledge or reject message based on processing result
                if (processed) {
                    channel.ack(msg);
                } else if (options.requeue !== false) {
                    channel.nack(msg, false, true); // Requeue
                } else {
                    channel.nack(msg, false, false); // Don't requeue
                }
            } catch (error) {
                logger.error(`Error processing RabbitMQ message from ${queue}:`, error);

                // Handle message processing error (e.g., send to error queue)
                try {
                    const errorQueueHandler = require('../messaging/errorQueue');
                    await errorQueueHandler.handleFailedMessage('rabbitmq', {
                        queue,
                        message: msg,
                        error: error.message
                    });

                    // Acknowledge the message since it's been moved to error queue
                    channel.ack(msg);
                } catch (errorQueueError) {
                    logger.error('Error handling failed message:', errorQueueError);

                    // Decide whether to requeue or discard based on configuration
                    if (process.env.REQUEUE_FAILED_MESSAGES === 'true') {
                        channel.nack(msg, false, true); // Requeue
                    } else {
                        channel.nack(msg, false, false); // Don't requeue
                    }
                }
            }
        }, { noAck: false, ...options.consumeOptions });

        // Handle channel errors
        channel.on('error', (error) => {
            logger.error(`RabbitMQ consumer channel for queue ${queue} error:`, error);
            // Remove from channels list
            consumerChannels = consumerChannels.filter(ch => ch !== channel);

            // Recreate consumer after delay
            setTimeout(async () => {
                try {
                    await createConsumer(queue, messageHandler, options);
                } catch (recreateError) {
                    logger.error(`Failed to recreate consumer for queue ${queue}:`, recreateError);
                }
            }, 5000); // 5 seconds delay
        });

        channel.on('close', () => {
            logger.info(`RabbitMQ consumer channel for queue ${queue} closed`);
            // Remove from channels list
            consumerChannels = consumerChannels.filter(ch => ch !== channel);
        });

        // Add to channels list
        consumerChannels.push(channel);
        logger.info(`Consumer created for queue ${queue}`);

        return channel;
    } catch (error) {
        logger.error(`Error creating consumer for queue ${queue}:`, error);
        throw error;
    }
};

// Publish message to RabbitMQ
const publishMessage = async (exchange, routingKey, message, options = {}) => {
    try {
        if (!producerChannel) {
            throw new Error('RabbitMQ producer channel not initialized');
        }

        // Assert exchange if specified
        if (exchange && exchange !== '') {
            await assertExchange(
                producerChannel,
                exchange,
                options.exchangeType || 'topic',
                options.exchangeOptions
            );
        }

        // Convert message to buffer if needed
        let msgContent;
        if (Buffer.isBuffer(message)) {
            msgContent = message;
        } else if (typeof message === 'object') {
            msgContent = Buffer.from(JSON.stringify(message));
        } else {
            msgContent = Buffer.from(message.toString());
        }

        // Encrypt message if encryption is enabled
        if (process.env.ENCRYPT_MESSAGES === 'true') {
            msgContent = Buffer.from(encryptData(msgContent.toString()));
        }

        // Default message options
        const msgOptions = {
            persistent: true, // Make messages persistent (survive broker restart)
            contentType: 'application/json',
            contentEncoding: process.env.ENCRYPT_MESSAGES === 'true' ? 'encrypted' : 'utf8',
            messageId: options.messageId || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`,
            timestamp: options.timestamp || Math.floor(Date.now() / 1000),
            ...options.messageOptions
        };

        // Publish message
        const publishResult = producerChannel.publish(
            exchange || '',
            routingKey,
            msgContent,
            msgOptions
        );

        logger.debug(`Message published to ${exchange || 'default exchange'} with routing key ${routingKey}`);

        // Handle publisher confirmations if enabled
        if (process.env.RABBITMQ_PUBLISHER_CONFIRMS === 'true') {
            return new Promise((resolve, reject) => {
                producerChannel.waitForConfirms()
                    .then(() => {
                        logger.debug(`Message to ${exchange || 'default exchange'} with routing key ${routingKey} confirmed`);
                        resolve(true);
                    })
                    .catch((error) => {
                        logger.error(`Message to ${exchange || 'default exchange'} with routing key ${routingKey} rejected:`, error);
                        reject(error);
                    });
            });
        }

        return publishResult;
    } catch (error) {
        logger.error(`Error publishing message to ${exchange || 'default exchange'} with routing key ${routingKey}:`, error);
        throw error;
    }
};

// Set up a direct queue for publishing (convenience method)
const publishToQueue = async (queue, message, options = {}) => {
    try {
        if (!producerChannel) {
            throw new Error('RabbitMQ producer channel not initialized');
        }

        // Assert queue
        await assertQueue(producerChannel, queue, options.queueOptions);

        // Publish to the default exchange with the queue name as routing key
        return await publishMessage('', queue, message, options);
    } catch (error) {
        logger.error(`Error publishing to queue ${queue}:`, error);
        throw error;
    }
};

module.exports = {
    connectRabbitMQ,
    disconnectRabbitMQ,
    createConsumer,
    publishMessage,
    publishToQueue,
    assertExchange,
    assertQueue,
    bindQueue,
    getConnection: () => connection,
    getProducerChannel: () => producerChannel
};