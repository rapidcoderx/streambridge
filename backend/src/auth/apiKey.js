// apiKey.js - API key authentication utilities
const crypto = require('crypto');
const { logger } = require('../utils/logger');
const { logAuditEvent } = require('../utils/logger');
const { hashString, verifyHash, generateRandomString } = require('../utils/encryption');

// In a real application, API keys would be stored in a database
// For this example, we'll use an in-memory store
const apiKeyStore = new Map();

// Generate a new API key for a user
const generateApiKey = async (userId, options = {}) => {
    try {
        // Generate a random API key
        const keyPrefix = options.prefix || 'mh';
        const apiKey = `${keyPrefix}_${generateRandomString(48)}`;

        // Hash the API key for storage
        const { hash, salt } = hashString(apiKey);

        // Create API key record
        const apiKeyRecord = {
            userId,
            keyId: `key_${generateRandomString(16)}`,
            hash,
            salt,
            name: options.name || 'API Key',
            permissions: options.permissions || [],
            createdAt: new Date(),
            expiresAt: options.expiresAt || null,
            lastUsedAt: null,
            isRevoked: false,
        };

        // Store API key (in a real app, this would go to a database)
        apiKeyStore.set(apiKeyRecord.keyId, apiKeyRecord);

        // Log API key generation
        logAuditEvent('AUTH',
            { userId },
            { resourceType: 'apiKey', apiKeyId: apiKeyRecord.keyId },
            'API key generated',
            true
        );

        // Return the API key (only time it's fully visible)
        return {
            apiKey,
            keyId: apiKeyRecord.keyId,
            expiresAt: apiKeyRecord.expiresAt,
        };
    } catch (error) {
        logger.error('Error generating API key:', error);
        throw new Error('Failed to generate API key');
    }
};

// Verify an API key
const verifyApiKey = async (apiKey) => {
    try {
        if (!apiKey) {
            return { valid: false, error: 'API key is required' };
        }

        // Find key in store (in a real app, you'd query a database)
        // This is inefficient for a large number of keys, but works for this example
        let matchingKeyRecord = null;

        for (const record of apiKeyStore.values()) {
            if (verifyHash(apiKey, record.hash, record.salt)) {
                matchingKeyRecord = record;
                break;
            }
        }

        // Check if key was found
        if (!matchingKeyRecord) {
            return { valid: false, error: 'Invalid API key' };
        }

        // Check if key is revoked
        if (matchingKeyRecord.isRevoked) {
            return { valid: false, error: 'API key has been revoked' };
        }

        // Check if key is expired
        if (matchingKeyRecord.expiresAt && new Date() > matchingKeyRecord.expiresAt) {
            return { valid: false, error: 'API key has expired' };
        }

        // Update last used timestamp
        matchingKeyRecord.lastUsedAt = new Date();

        // Key is valid
        return {
            valid: true,
            userId: matchingKeyRecord.userId,
            keyId: matchingKeyRecord.keyId,
            permissions: matchingKeyRecord.permissions,
        };
    } catch (error) {
        logger.error('Error verifying API key:', error);
        return { valid: false, error: 'API key verification failed' };
    }
};

// Revoke an API key
const revokeApiKey = async (keyId) => {
    try {
        // Find the key record
        const keyRecord = apiKeyStore.get(keyId);

        if (!keyRecord) {
            return { success: false, error: 'API key not found' };
        }

        // Revoke the key
        keyRecord.isRevoked = true;
        keyRecord.revokedAt = new Date();

        // Update the store
        apiKeyStore.set(keyId, keyRecord);

        // Log key revocation
        logAuditEvent('AUTH',
            { userId: keyRecord.userId },
            { resourceType: 'apiKey', apiKeyId: keyId },
            'API key revoked',
            true
        );

        return { success: true };
    } catch (error) {
        logger.error('Error revoking API key:', error);
        throw new Error('Failed to revoke API key');
    }
};

// Get API keys for a user
const getUserApiKeys = async (userId) => {
    try {
        // Find all keys for the user (in a real app, you'd query a database)
        const userKeys = [];

        for (const [keyId, record] of apiKeyStore.entries()) {
            if (record.userId === userId) {
                userKeys.push({
                    keyId,
                    name: record.name,
                    createdAt: record.createdAt,
                    expiresAt: record.expiresAt,
                    lastUsedAt: record.lastUsedAt,
                    isRevoked: record.isRevoked,
                    revokedAt: record.revokedAt,
                    // Don't include the hash or salt
                });
            }
        }

        return userKeys;
    } catch (error) {
        logger.error('Error getting user API keys:', error);
        throw new Error('Failed to retrieve API keys');
    }
};

// Middleware for API key authentication
const apiKeyMiddleware = async (req, res, next) => {
    try {
        // Get API key from header
        const apiKey = req.headers['x-api-key'];

        if (!apiKey) {
            return res.status(401).json({ message: 'API key is required' });
        }

        // Verify API key
        const result = await verifyApiKey(apiKey);

        if (!result.valid) {
            return res.status(401).json({ message: result.error });
        }

        // Attach user info to request
        req.user = {
            id: result.userId,
            keyId: result.keyId,
            permissions: result.permissions,
            authMethod: 'apiKey',
        };

        // Log API key usage
        logAuditEvent('AUTH',
            { userId: result.userId },
            { resourceType: 'apiKey', apiKeyId: result.keyId },
            `API key used to access ${req.method} ${req.originalUrl}`,
            true
        );

        // Proceed to next middleware
        next();
    } catch (error) {
        logger.error('Error in API key middleware:', error);
        res.status(500).json({ message: 'Authentication error' });
    }
};

// Seed some API keys for development/testing
const seedApiKeys = () => {
    if (process.env.NODE_ENV === 'development' || process.env.SEED_API_KEYS === 'true') {
        logger.info('Seeding API keys for development/testing');

        // Create a test API key
        const testApiKey = 'mh_test_key_123456789';
        const { hash, salt } = hashString(testApiKey);

        // Add to store
        apiKeyStore.set('key_test', {
            userId: 'test-user',
            keyId: 'key_test',
            hash,
            salt,
            name: 'Test API Key',
            permissions: ['read', 'write'],
            createdAt: new Date(),
            expiresAt: null,
            lastUsedAt: null,
            isRevoked: false,
        });

        logger.info('Test API key created: mh_test_key_123456789');
    }
};

// Call seed function on module load if enabled
seedApiKeys();

module.exports = {
    generateApiKey,
    verifyApiKey,
    revokeApiKey,
    getUserApiKeys,
    apiKeyMiddleware,
};