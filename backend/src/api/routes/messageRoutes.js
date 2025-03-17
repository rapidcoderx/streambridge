// messageRoutes.js - Routes for message operations
const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const { jwtMiddleware } = require('../../auth/jwt');
const { apiKeyMiddleware } = require('../../auth/apiKey');
const { validateRequestBody } = require('../middlewares/validationMiddleware');

// Authentication middleware - either JWT or API key
const authMiddleware = (req, res, next) => {
    // Check for API key first
    const apiKey = req.headers['x-api-key'];
    if (apiKey) {
        return apiKeyMiddleware(req, res, next);
    }

    // Fall back to JWT
    return jwtMiddleware(req, res, next);
};

// Validate message publish request
const validatePublishRequest = validateRequestBody({
    type: 'object',
    required: ['destination', 'message'],
    properties: {
        destination: { type: 'string', minLength: 1 },
        message: {
            oneOf: [
                { type: 'object' },
                { type: 'string' },
                { type: 'array' },
                { type: 'number' },
                { type: 'boolean' }
            ]
        },
        messageType: { type: 'string' },
        routingKey: { type: 'string' },
        headers: { type: 'object' },
        options: { type: 'object' }
    }
});

// Routes
// Publish a message
router.post('/', authMiddleware, validatePublishRequest, messageController.publishMessage);

// Get message history
router.get('/history', authMiddleware, messageController.getMessageHistory);

// Get available destinations
router.get('/destinations', authMiddleware, messageController.getDestinations);

// Get message schemas
router.get('/schemas', authMiddleware, messageController.getMessageSchemas);

// Delete messages (admin only)
router.delete('/:destination', authMiddleware, messageController.deleteMessages);

module.exports = router;