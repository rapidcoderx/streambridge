// jwt.js - JWT authentication utilities
const jwt = require('jsonwebtoken');
const { logger } = require('../utils/logger');
const { logAuditEvent } = require('../utils/logger');

// Secret key for JWT signing and verification
const JWT_SECRET = process.env.JWT_SECRET || 'message-hub-jwt-secret-key-change-in-production';
const JWT_EXPIRATION = process.env.JWT_EXPIRATION || '24h';
const JWT_REFRESH_EXPIRATION = process.env.JWT_REFRESH_EXPIRATION || '7d';
const JWT_ISSUER = process.env.JWT_ISSUER || 'message-hub';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE ? process.env.JWT_AUDIENCE.split(',') : ['message-hub-client'];

// Generate JWT token for authenticated user
const generateToken = async (user) => {
    try {
        // Token payload
        const payload = {
            sub: user.id.toString(),
            username: user.username,
            roles: user.roles || [],
            permissions: user.permissions || [],
        };

        // Token options
        const options = {
            expiresIn: JWT_EXPIRATION,
            issuer: JWT_ISSUER,
            audience: JWT_AUDIENCE,
            jwtid: generateTokenId(),
        };

        // Generate token
        const token = jwt.sign(payload, JWT_SECRET, options);

        // Generate refresh token if enabled
        let refreshToken = null;
        if (process.env.USE_REFRESH_TOKENS === 'true') {
            const refreshPayload = {
                sub: user.id.toString(),
                type: 'refresh',
            };

            const refreshOptions = {
                expiresIn: JWT_REFRESH_EXPIRATION,
                issuer: JWT_ISSUER,
                audience: JWT_AUDIENCE,
                jwtid: generateTokenId(),
            };

            refreshToken = jwt.sign(refreshPayload, JWT_SECRET, refreshOptions);
        }

        // Log token generation
        logAuditEvent('AUTH',
            { userId: user.id, username: user.username },
            { resourceType: 'jwt', tokenId: options.jwtid },
            'JWT token generated',
            true
        );

        return {
            token,
            refreshToken,
            expiresIn: getExpirationSeconds(JWT_EXPIRATION),
            tokenType: 'Bearer',
        };
    } catch (error) {
        logger.error('Error generating JWT token:', error);
        throw new Error('Failed to generate authentication token');
    }
};

// Verify JWT token
const verifyToken = async (token) => {
    try {
        if (!token) {
            return { valid: false, error: 'Token is required' };
        }

        // Verify the token
        const decoded = jwt.verify(token, JWT_SECRET, {
            issuer: JWT_ISSUER,
            audience: JWT_AUDIENCE,
        });

        // Check if token is a refresh token
        if (decoded.type === 'refresh') {
            return { valid: false, error: 'Cannot use refresh token for authentication' };
        }

        // Check token expiration
        if (decoded.exp <= Math.floor(Date.now() / 1000)) {
            return { valid: false, error: 'Token has expired' };
        }

        // Verify against token blacklist if implemented
        // ... (blacklist check would go here)

        // Token is valid
        return {
            valid: true,
            userId: decoded.sub,
            username: decoded.username,
            roles: decoded.roles || [],
            permissions: decoded.permissions || [],
            tokenId: decoded.jti,
            expires: new Date(decoded.exp * 1000),
        };
    } catch (error) {
        logger.warn('JWT verification failed:', error.message);

        // Return appropriate error
        if (error.name === 'TokenExpiredError') {
            return { valid: false, error: 'Token has expired' };
        } else if (error.name === 'JsonWebTokenError') {
            return { valid: false, error: 'Invalid token' };
        } else if (error.name === 'NotBeforeError') {
            return { valid: false, error: 'Token not yet active' };
        }

        return { valid: false, error: 'Token validation failed' };
    }
};

// Refresh access token using refresh token
const refreshAccessToken = async (refreshToken) => {
    try {
        // Verify refresh token
        const decoded = jwt.verify(refreshToken, JWT_SECRET, {
            issuer: JWT_ISSUER,
            audience: JWT_AUDIENCE,
        });

        // Ensure it's a refresh token
        if (decoded.type !== 'refresh') {
            return { success: false, error: 'Invalid refresh token' };
        }

        // Token is valid, generate new access token
        // In a real application, you would typically load the user from a database
        // Here we're creating a minimal user object from the token data
        const user = {
            id: decoded.sub,
            username: decoded.username || `user-${decoded.sub}`,
            roles: decoded.roles || [],
            permissions: decoded.permissions || [],
        };

        // Generate new tokens
        const tokens = await generateToken(user);

        // Log token refresh
        logAuditEvent('AUTH',
            { userId: user.id, username: user.username },
            { resourceType: 'jwt', tokenId: decoded.jti },
            'JWT token refreshed',
            true
        );

        return {
            success: true,
            ...tokens,
        };
    } catch (error) {
        logger.warn('Refresh token validation failed:', error.message);

        // Return appropriate error
        if (error.name === 'TokenExpiredError') {
            return { success: false, error: 'Refresh token has expired' };
        } else {
            return { success: false, error: 'Invalid refresh token' };
        }
    }
};

// Middleware for JWT authentication
const jwtMiddleware = async (req, res, next) => {
    try {
        // Get token from Authorization header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix

        // Verify token
        const result = await verifyToken(token);
        if (!result.valid) {
            return res.status(401).json({ message: result.error });
        }

        // Attach user info to request
        req.user = {
            id: result.userId,
            username: result.username,
            roles: result.roles,
            permissions: result.permissions,
            tokenId: result.tokenId,
        };

        // Proceed to next middleware
        next();
    } catch (error) {
        logger.error('Error in JWT middleware:', error);
        res.status(500).json({ message: 'Authentication error' });
    }
};

// Optional JWT middleware - doesn't require authentication but attaches user if token is valid
const optionalJwtMiddleware = async (req, res, next) => {
    try {
        // Get token from Authorization header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            // No token, continue as anonymous
            req.user = null;
            return next();
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix

        // Verify token
        const result = await verifyToken(token);
        if (result.valid) {
            // Attach user info to request
            req.user = {
                id: result.userId,
                username: result.username,
                roles: result.roles,
                permissions: result.permissions,
                tokenId: result.tokenId,
            };
        } else {
            // Invalid token, continue as anonymous
            req.user = null;
        }

        // Proceed to next middleware
        next();
    } catch (error) {
        logger.error('Error in optional JWT middleware:', error);
        // Don't fail the request, just continue as anonymous
        req.user = null;
        next();
    }
};

// Revoke token (add to blacklist)
const revokeToken = async (token) => {
    try {
        // Verify the token to get its payload
        const decoded = jwt.verify(token, JWT_SECRET, {
            ignoreExpiration: true, // Allow expired tokens to be blacklisted
        });

        // In a real application, you would add the token to a blacklist
        // This could be in Redis, a database, etc.
        // For this example, we'll just log that we would blacklist the token
        logger.info(`Token with ID ${decoded.jti} would be blacklisted until ${new Date(decoded.exp * 1000)}`);

        // Log token revocation
        logAuditEvent('AUTH',
            { userId: decoded.sub, username: decoded.username },
            { resourceType: 'jwt', tokenId: decoded.jti },
            'JWT token revoked',
            true
        );

        return { success: true };
    } catch (error) {
        logger.error('Error revoking token:', error);
        throw new Error('Failed to revoke token');
    }
};

// Generate unique token ID
const generateTokenId = () => {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
};

// Convert expiration time string to seconds
const getExpirationSeconds = (expirationString) => {
    const unit = expirationString.charAt(expirationString.length - 1);
    const value = parseInt(expirationString.substring(0, expirationString.length - 1));

    switch (unit) {
        case 's':
            return value;
        case 'm':
            return value * 60;
        case 'h':
            return value * 3600;
        case 'd':
            return value * 86400;
        default:
            return 3600; // Default to 1 hour if format is unrecognized
    }
};

module.exports = {
    generateToken,
    verifyToken,
    refreshAccessToken,
    revokeToken,
    jwtMiddleware,
    optionalJwtMiddleware,
};