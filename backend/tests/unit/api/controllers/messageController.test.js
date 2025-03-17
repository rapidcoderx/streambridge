// messageController.test.js - Unit tests for the message controller
const { jest } = require('@jest/globals');
const messageController = require('../../../../src/api/controllers/messageController');

// Mock dependencies
jest.mock('../../../../src/config/kafka', () => ({
    publishMessage: jest.fn().mockResolvedValue({ success: true })
}));

jest.mock('../../../../src/config/rabbitmq', () => ({
    publishMessage: jest.fn().mockResolvedValue({ success: true }),
    publishToQueue: jest.fn().mockResolvedValue({ success: true })
}));

jest.mock('../../../../src/utils/logger', () => ({
    logger: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn()
    },
    createTransactionLogger: jest.fn().mockReturnValue({
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn()
    }),
    logAuditEvent: jest.fn()
}));

jest.mock('../../../../src/websocket/server', () => ({
    broadcast: jest.fn()
}));

jest.mock('../../../../src/api/validators/messageValidator', () => ({
    validateMessage: jest.fn().mockResolvedValue({ valid: true })
}));

// Mock request and response objects
const mockRequest = () => {
    const req = {};
    req.body = {};
    req.params = {};
    req.query = {};
    req.user = { id: 'test-user', roles: ['user'] };
    return req;
};

const mockResponse = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
};

describe('Message Controller', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('publishMessage', () => {
        it('should return 400 if destination is missing', async () => {
            // Arrange
            const req = mockRequest();
            req.body = { message: { test: 'data' } };
            const res = mockResponse();

            // Act
            await messageController.publishMessage(req, res);

            // Assert
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                message: expect.stringContaining('Destination is required')
            }));
        });

        it('should return 400 if message is missing', async () => {
            // Arrange
            const req = mockRequest();
            req.body = { destination: 'kafka://test-topic' };
            const res = mockResponse();

            // Act
            await messageController.publishMessage(req, res);

            // Assert
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                message: expect.stringContaining('Message content is required')
            }));
        });

        it('should publish to Kafka if destination starts with kafka://', async () => {
            // Arrange
            const req = mockRequest();
            req.body = {
                destination: 'kafka://test-topic',
                message: { test: 'data' },
                messageType: 'test-type'
            };
            const res = mockResponse();
            const { publishMessage } = require('../../../../src/config/kafka');

            // Act
            await messageController.publishMessage(req, res);

            // Assert
            expect(publishMessage).toHaveBeenCalledWith(
                'test-topic',
                { test: 'data' },
                null,
                expect.objectContaining({
                    'x-message-type': 'test-type'
                })
            );
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true,
                destination: 'kafka://test-topic'
            }));
        });

        it('should publish to RabbitMQ if destination starts with rabbitmq://', async () => {
            // Arrange
            const req = mockRequest();
            req.body = {
                destination: 'rabbitmq://test-exchange',
                message: { test: 'data' },
                messageType: 'test-type',
                routingKey: 'test.key'
            };
            const res = mockResponse();
            const { publishMessage } = require('../../../../src/config/rabbitmq');

            // Act
            await messageController.publishMessage(req, res);

            // Assert
            expect(publishMessage).toHaveBeenCalledWith(
                'test-exchange',
                'test.key',
                { test: 'data' },
                expect.objectContaining({
                    messageOptions: expect.objectContaining({
                        headers: expect.objectContaining({
                            'x-message-type': 'test-type'
                        })
                    })
                })
            );
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true,
                destination: 'rabbitmq://test-exchange'
            }));
        });

        it('should publish to RabbitMQ queue directly if directQueue option is true', async () => {
            // Arrange
            const req = mockRequest();
            req.body = {
                destination: 'rabbitmq://test-queue',
                message: { test: 'data' },
                messageType: 'test-type',
                options: { directQueue: true }
            };
            const res = mockResponse();
            const { publishToQueue } = require('../../../../src/config/rabbitmq');

            // Act
            await messageController.publishMessage(req, res);

            // Assert
            expect(publishToQueue).toHaveBeenCalledWith(
                'test-queue',
                { test: 'data' },
                expect.objectContaining({
                    messageOptions: expect.objectContaining({
                        headers: expect.objectContaining({
                            'x-message-type': 'test-type'
                        })
                    })
                })
            );
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true,
                destination: 'rabbitmq://test-queue'
            }));
        });

        it('should broadcast to WebSocket clients if broadcast option is not false', async () => {
            // Arrange
            const req = mockRequest();
            req.body = {
                destination: 'kafka://test-topic',
                message: { test: 'data' },
                options: { broadcast: true }
            };
            const res = mockResponse();
            const { broadcast } = require('../../../../src/websocket/server');

            // Act
            await messageController.publishMessage(req, res);

            // Assert
            expect(broadcast).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'message',
                    source: 'kafka',
                    destination: 'test-topic',
                    message: { test: 'data' }
                }),
                expect.any(Array)
            );
        });

        it('should return 500 if publishing fails', async () => {
            // Arrange
            const req = mockRequest();
            req.body = {
                destination: 'kafka://test-topic',
                message: { test: 'data' }
            };
            const res = mockResponse();
            const { publishMessage } = require('../../../../src/config/kafka');
            publishMessage.mockRejectedValueOnce(new Error('Test error'));

            // Act
            await messageController.publishMessage(req, res);

            // Assert
            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                message: 'Failed to publish message',
                error: 'Test error'
            }));
        });
    });

    describe('getMessageHistory', () => {
        it('should return message history for specified destination', async () => {
            // Arrange
            const req = mockRequest();
            req.query = { destination: 'kafka://test-topic', limit: '10', offset: '0' };
            const res = mockResponse();

            // Act
            await messageController.getMessageHistory(req, res);

            // Assert
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                messages: expect.any(Array),
                pagination: expect.objectContaining({
                    limit: 10,
                    offset: 0
                })
            }));
        });
    });

    describe('getDestinations', () => {
        it('should return available destinations', async () => {
            // Arrange
            const req = mockRequest();
            const res = mockResponse();

            // Act
            await messageController.getDestinations(req, res);

            // Assert
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                kafka: expect.any(Array),
                rabbitmq: expect.objectContaining({
                    queues: expect.any(Array),
                    exchanges: expect.any(Array)
                })
            }));
        });
    });

    describe('getMessageSchemas', () => {
        it('should return available message schemas', async () => {
            // Arrange
            const req = mockRequest();
            const res = mockResponse();

            // Act
            await messageController.getMessageSchemas(req, res);

            // Assert
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(expect.any(Object));
        });
    });

    describe('deleteMessages', () => {
        it('should delete messages from specified destination', async () => {
            // Arrange
            const req = mockRequest();
            req.params = { destination: 'kafka://test-topic' };
            const res = mockResponse();

            // Act
            await messageController.deleteMessages(req, res);

            // Assert
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true,
                message: expect.stringContaining('test-topic')
            }));
        });
    });
});