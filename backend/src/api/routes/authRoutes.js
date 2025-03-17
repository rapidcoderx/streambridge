// authRoutes.js - Authentication routes
const express = require('express');
const router = express.Router();
const { jwtMiddleware } = require('../../auth/jwt');
const { validateRequestBody } = require('../middlewares/validationMiddleware');

// Import JWT authentication functions
const {
    generateToken,
    refreshAccessToken,
    revokeToken
} = require('../../auth/jwt');

// Import API key authentication functions
const {
    generateApiKey,
    revokeApiKey,
    getUserApiKeys
} = require('../../auth/apiKey');

// Mock user database (replace with actual DB in production)
const users = [
    { id: 'user-1', username: 'admin', password: 'admin123', roles: ['admin'] },
    { id: 'user-2', username: 'user', password: 'user123', roles: ['user'] }
];

// Validate login request
const validateLoginRequest = validateRequestBody({
    type: 'object',
    required: ['username', 'password'],
    properties: {
        username: { type: 'string', minLength: 1 },
        password: { type: 'string', minLength: 1 }
    }
});

// Login route
router.post('/login', validateLoginRequest, async (req, res) => {
    try {
        const { username, password } = req.body;

        // Find user
        const user = users.find(u => u.username === username && u.password === password);

        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Generate token
        const tokenData = await generateToken(user);

        // Return tokens
        res.status(200).json(tokenData);
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Authentication failed' });
    }
});

// Refresh token route
router.post('/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({ message: 'Refresh token is required' });
        }

        const result = await refreshAccessToken(refreshToken);

        if (!result.success) {
            return res.status(401).json({ message: result.error });
        }

        res.status(200).json(result);
    } catch (error) {
        console.error('Token refresh error:', error);
        res.status(500).json({ message: 'Failed to refresh token' });
    }
});

// Logout route
router.post('/logout', async (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({ message: 'Token is required' });
        }

        await revokeToken(token);

        res.status(200).json({ message: 'Logged out successfully' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ message: 'Failed to logout' });
    }
});

// Generate API key - requires JWT authentication
router.post('/apikey', jwtMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const { name, permissions = [] } = req.body;

        // Generate API key
        const apiKey = await generateApiKey(userId, {
            name: name || 'API Key',
            permissions,
            expiresAt: null // No expiration
        });

        res.status(200).json(apiKey);
    } catch (error) {
        console.error('API key generation error:', error);
        res.status(500).json({ message: 'Failed to generate API key' });
    }
});

// List API keys for user - requires JWT authentication
router.get('/apikey', jwtMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;

        // Get user API keys
        const apiKeys = await getUserApiKeys(userId);

        res.status(200).json(apiKeys);
    } catch (error) {
        console.error('API key list error:', error);
        res.status(500).json({ message: 'Failed to retrieve API keys' });
    }
});

// Revoke API key - requires JWT authentication
router.delete('/apikey/:keyId', jwtMiddleware, async (req, res) => {
    try {
        const { keyId } = req.params;

        // Revoke API key
        const result = await revokeApiKey(keyId);

        if (!result.success) {
            return res.status(404).json({ message: result.error });
        }

        res.status(200).json({ success: true });
    } catch (error) {
        console.error('API key revocation error:', error);
        res.status(500).json({ message: 'Failed to revoke API key' });
    }
});

module.exports = router;