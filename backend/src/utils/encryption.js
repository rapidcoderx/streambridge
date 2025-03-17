// encryption.js - Utility for encrypting and decrypting data
const crypto = require('crypto');
const { logger } = require('./logger');

// Encryption configuration
const ENCRYPTION_ALGORITHM = process.env.ENCRYPTION_ALGORITHM || 'aes-256-gcm';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '01234567890123456789012345678901'; // 32 bytes key for AES-256
const IV_LENGTH = 16; // For AES, this is always 16 bytes
const AUTH_TAG_LENGTH = 16; // For GCM mode

// Validate encryption configuration
function validateEncryptionConfig() {
    // Ensure we have a strong enough key
    if (!ENCRYPTION_KEY || Buffer.from(ENCRYPTION_KEY).length < 32) {
        logger.warn('Encryption key is missing or not strong enough. Using a fallback key for development.');
        logger.warn('DO NOT USE THIS IN PRODUCTION!');
    }

    // Check if we're using a secure algorithm
    if (!ENCRYPTION_ALGORITHM.includes('gcm') && !ENCRYPTION_ALGORITHM.includes('ccm')) {
        logger.warn(`Using ${ENCRYPTION_ALGORITHM} which may not be as secure as authenticated encryption modes like GCM or CCM.`);
    }
}

// Call validation when module is loaded
validateEncryptionConfig();

/**
 * Encrypt data using the configured encryption algorithm
 * @param {string} data - Data to encrypt
 * @returns {string} - Encrypted data as Base64 string
 */
function encryptData(data) {
    try {
        // Generate a random initialization vector
        const iv = crypto.randomBytes(IV_LENGTH);

        // Create cipher using key and IV
        const cipher = crypto.createCipheriv(
            ENCRYPTION_ALGORITHM,
            Buffer.from(ENCRYPTION_KEY),
            iv
        );

        // Encrypt the data
        let encrypted = cipher.update(data, 'utf8', 'base64');
        encrypted += cipher.final('base64');

        // Get the authentication tag (for GCM and CCM modes)
        let authTag;
        if (ENCRYPTION_ALGORITHM.includes('gcm') || ENCRYPTION_ALGORITHM.includes('ccm')) {
            authTag = cipher.getAuthTag();
        }

        // Combine IV, encrypted data, and authentication tag (if any)
        // Format: base64(iv):base64(authTag):base64(encryptedData)
        let result = `${iv.toString('base64')}:`;

        if (authTag) {
            result += `${authTag.toString('base64')}:`;
        } else {
            result += ':'; // Empty auth tag placeholder
        }

        result += encrypted;

        return result;
    } catch (error) {
        logger.error('Encryption error:', error);
        throw new Error('Failed to encrypt data');
    }
}

/**
 * Decrypt data that was encrypted with encryptData
 * @param {string} encryptedData - Encrypted data string
 * @returns {string} - Decrypted data as UTF-8 string
 */
function decryptData(encryptedData) {
    try {
        // Split the components
        const parts = encryptedData.split(':');

        if (parts.length !== 3) {
            throw new Error('Invalid encrypted data format');
        }

        const iv = Buffer.from(parts[0], 'base64');
        const authTagStr = parts[1];
        const encrypted = parts[2];

        // Create decipher
        const decipher = crypto.createDecipheriv(
            ENCRYPTION_ALGORITHM,
            Buffer.from(ENCRYPTION_KEY),
            iv
        );

        // Set auth tag if present (for GCM and CCM modes)
        if (authTagStr && (ENCRYPTION_ALGORITHM.includes('gcm') || ENCRYPTION_ALGORITHM.includes('ccm'))) {
            const authTag = Buffer.from(authTagStr, 'base64');
            decipher.setAuthTag(authTag);
        }

        // Decrypt the data
        let decrypted = decipher.update(encrypted, 'base64', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (error) {
        logger.error('Decryption error:', error);
        throw new Error('Failed to decrypt data');
    }
}

/**
 * Generate a secure random string for tokens, keys, etc.
 * @param {number} length - Length of the random string
 * @returns {string} - Random string in hexadecimal format
 */
function generateRandomString(length = 32) {
    return crypto.randomBytes(Math.ceil(length / 2))
        .toString('hex')
        .slice(0, length);
}

/**
 * Hash a string using a secure one-way hash function
 * @param {string} data - String to hash
 * @param {string} salt - Optional salt to use
 * @returns {Object} - Object containing hash and salt
 */
function hashString(data, salt = null) {
    // Generate salt if not provided
    if (!salt) {
        salt = crypto.randomBytes(16).toString('hex');
    }

    // Hash the data
    const hash = crypto.pbkdf2Sync(
        data,
        salt,
        10000, // iterations
        64,    // key length
        'sha512'
    ).toString('hex');

    return {
        hash,
        salt
    };
}

/**
 * Verify a string against a hash
 * @param {string} data - String to verify
 * @param {string} hash - Stored hash
 * @param {string} salt - Salt used for hashing
 * @returns {boolean} - True if the string matches the hash
 */
function verifyHash(data, hash, salt) {
    const { hash: newHash } = hashString(data, salt);
    return newHash === hash;
}

/**
 * Create a HMAC signature for data
 * @param {string|Object} data - Data to sign
 * @param {string} key - Secret key for signing
 * @returns {string} - Signature as hex string
 */
function createSignature(data, key = ENCRYPTION_KEY) {
    const dataString = typeof data === 'object' ? JSON.stringify(data) : data.toString();
    return crypto
        .createHmac('sha256', key)
        .update(dataString)
        .digest('hex');
}

/**
 * Verify a HMAC signature
 * @param {string|Object} data - Data to verify
 * @param {string} signature - Signature to check
 * @param {string} key - Secret key used for signing
 * @returns {boolean} - True if signature is valid
 */
function verifySignature(data, signature, key = ENCRYPTION_KEY) {
    const computedSignature = createSignature(data, key);
    return crypto.timingSafeEqual(
        Buffer.from(computedSignature, 'hex'),
        Buffer.from(signature, 'hex')
    );
}

module.exports = {
    encryptData,
    decryptData,
    generateRandomString,
    hashString,
    verifyHash,
    createSignature,
    verifySignature
};