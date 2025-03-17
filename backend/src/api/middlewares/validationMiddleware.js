// validationMiddleware.js - Request validation middleware
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const { logger } = require('../../utils/logger');
const sanitizeHtml = require('sanitize-html');

// Initialize JSON schema validator
const ajv = new Ajv({
    allErrors: true,
    coerceTypes: true,
    removeAdditional: false,
    useDefaults: true
});

// Add string formats like date-time, email, etc.
addFormats(ajv);

// Middleware to validate request body against schema
const validateRequestBody = (schema) => {
    const validate = ajv.compile(schema);

    return (req, res, next) => {
        const valid = validate(req.body);

        if (!valid) {
            logger.warn(`Request validation failed: ${ajv.errorsText(validate.errors)}`);

            return res.status(400).json({
                errors: validate.errors,
                message: 'Request validation failed'
            });
        }

        // Continue to next middleware
        next();
    };
};

// Middleware to validate request query parameters
const validateRequestQuery = (schema) => {
    const validate = ajv.compile(schema);

    return (req, res, next) => {
        const valid = validate(req.query);

        if (!valid) {
            logger.warn(`Query validation failed: ${ajv.errorsText(validate.errors)}`);

            return res.status(400).json({
                errors: validate.errors,
                message: 'Query validation failed'
            });
        }

        // Continue to next middleware
        next();
    };
};

// Middleware to validate request parameters
const validateRequestParams = (schema) => {
    const validate = ajv.compile(schema);

    return (req, res, next) => {
        const valid = validate(req.params);

        if (!valid) {
            logger.warn(`Params validation failed: ${ajv.errorsText(validate.errors)}`);

            return res.status(400).json({
                errors: validate.errors,
                message: 'Parameters validation failed'
            });
        }

        // Continue to next middleware
        next();
    };
};

// Sanitize HTML content in request body
const sanitizeRequestBody = (options = {}) => {
    // Default options for sanitize-html
    const defaultOptions = {
        allowedTags: [],  // No HTML tags allowed by default
        allowedAttributes: {},
        disallowedTagsMode: 'recursiveEscape',
    };

    // Merge with custom options if provided
    const sanitizeOptions = { ...defaultOptions, ...options };

    return (req, res, next) => {
        if (req.body) {
            // Function to recursively sanitize object properties
            const sanitizeObject = (obj) => {
                if (!obj || typeof obj !== 'object') {
                    return obj;
                }

                if (Array.isArray(obj)) {
                    return obj.map(item => sanitizeObject(item));
                }

                const result = {};

                for (const [key, value] of Object.entries(obj)) {
                    if (typeof value === 'string') {
                        result[key] = sanitizeHtml(value, sanitizeOptions);
                    } else if (typeof value === 'object') {
                        result[key] = sanitizeObject(value);
                    } else {
                        result[key] = value;
                    }
                }

                return result;
            };

            req.body = sanitizeObject(req.body);
        }

        next();
    };
};

// Sanitize query parameters
const sanitizeRequestQuery = (options = {}) => {
    // Default options for sanitize-html
    const defaultOptions = {
        allowedTags: [],  // No HTML tags allowed
        allowedAttributes: {},
        disallowedTagsMode: 'recursiveEscape',
    };

    // Merge with custom options if provided
    const sanitizeOptions = { ...defaultOptions, ...options };

    return (req, res, next) => {
        if (req.query) {
            for (const [key, value] of Object.entries(req.query)) {
                if (typeof value === 'string') {
                    req.query[key] = sanitizeHtml(value, sanitizeOptions);
                }
            }
        }

        next();
    };
};

// Rate limiting by IP for specific routes
const rateLimit = require('express-rate-limit');

const createRateLimiter = (options = {}) => {
    const defaultOptions = {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // Limit each IP to 100 requests per windowMs
        standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
        legacyHeaders: false, // Disable the `X-RateLimit-*` headers
        message: 'Too many requests from this IP, please try again later',
    };

    return rateLimit({
        ...defaultOptions,
        ...options
    });
};

// Input validation middleware to prevent common attacks
const securityValidation = () => {
    return (req, res, next) => {
        // Function to check for suspicious patterns
        const checkForSuspiciousPatterns = (value) => {
            if (typeof value !== 'string') return false;

            // Check for common SQL injection patterns
            const sqlPatterns = [
                /(\%27)|(\')|(\-\-)|(\%23)|(#)/i,  // Basic SQL meta-characters
                /((\%3D)|(=))[^\n]*((\%27)|(\')|(\-\-)|(\%3B)|(;))/i, // Basic SQL injection
                /\w*((\%27)|(\'))((\%6F)|o|(\%4F))((\%72)|r|(\%52))/i, // Basic SQL OR attacks
                /((\%27)|(\'))union/i // Basic SQL UNION attacks
            ];

            for (const pattern of sqlPatterns) {
                if (pattern.test(value)) {
                    logger.warn(`Suspicious SQL pattern detected: ${value}`);
                    return true;
                }
            }

            // Check for common XSS patterns
            const xssPatterns = [
                /((\%3C)|<)((\%2F)|\/)*[a-z0-9\%]+((\%3E)|>)/i, // Basic XSS
                /((\%3C)|<)((\%69)|i|(\%49))((\%6D)|m|(\%4D))((\%67)|g|(\%47))[^\n]+((\%3E)|>)/i, // Basic img tags
                /((\%3C)|<)[^\n]+((\%3E)|>)/i // Any HTML tags
            ];

            for (const pattern of xssPatterns) {
                if (pattern.test(value)) {
                    logger.warn(`Suspicious XSS pattern detected: ${value}`);
                    return true;
                }
            }

            return false;
        };

        // Check request parameters
        const checkObject = (obj) => {
            if (!obj || typeof obj !== 'object') {
                return false;
            }

            if (Array.isArray(obj)) {
                return obj.some(item =>
                    typeof item === 'string' ? checkForSuspiciousPatterns(item) : checkObject(item)
                );
            }

            return Object.values(obj).some(value =>
                typeof value === 'string' ? checkForSuspiciousPatterns(value) : checkObject(value)
            );
        };

        // Check all request components
        const suspicious =
            checkObject(req.params) ||
            checkObject(req.query) ||
            checkObject(req.body);

        if (suspicious) {
            return res.status(400).json({ message: 'Invalid input detected' });
        }

        next();
    };
};

module.exports = {
    validateRequestBody,
    validateRequestQuery,
    validateRequestParams,
    sanitizeRequestBody,
    sanitizeRequestQuery,
    createRateLimiter,
    securityValidation
};