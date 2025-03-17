// errorHandler.js - Error handling middleware
const { logger } = require('../../utils/logger');

// Custom error class that can be used throughout the application
class AppError extends Error {
    constructor(statusCode, message, details = {}) {
        super(message);
        this.statusCode = statusCode;
        this.details = details;
        this.isOperational = true; // Indicates this is an expected error

        // Capture stack trace
        Error.captureStackTrace(this, this.constructor);
    }
}

// Middleware to handle all errors
const errorHandler = (err, req, res, next) => {
    // Default status code and message
    let statusCode = err.statusCode || 500;
    let message = err.message || 'Internal Server Error';
    let details = err.details || {};

    // Determine if error is operational (expected) or programming error
    const isOperational = err.isOperational === true;

    // Handle specific error types
    if (err.name === 'ValidationError') {
        // Validation errors (e.g., from mongoose, ajv)
        statusCode = 400;
        message = 'Validation Error';
        details = { errors: err.errors || err.message };
    } else if (err.name === 'SyntaxError' && err.message.includes('JSON')) {
        // JSON parsing errors
        statusCode = 400;
        message = 'Invalid JSON in request';
    } else if (err.name === 'UnauthorizedError' || err.name === 'JsonWebTokenError') {
        // Authentication errors
        statusCode = 401;
        message = 'Authentication Error';
    } else if (err.name === 'ForbiddenError') {
        // Authorization errors
        statusCode = 403;
        message = 'Forbidden';
    } else if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET') {
        // Connection errors (e.g., Kafka, RabbitMQ)
        statusCode = 503;
        message = 'Service Unavailable';
        details = { service: err.service || 'Unknown' };
    }

    // Log error with appropriate level
    if (statusCode >= 500) {
        // Server errors
        logger.error(`${statusCode} - ${message}`, {
            error: err.message,
            stack: err.stack,
            path: req.path,
            method: req.method,
            requestId: req.id,
            isOperational
        });
    } else {
        // Client errors
        logger.warn(`${statusCode} - ${message}`, {
            error: err.message,
            path: req.path,
            method: req.method,
            requestId: req.id
        });
    }

    // Determine environment and adjust response accordingly
    const isProduction = process.env.NODE_ENV === 'production';

    // Create error response
    const errorResponse = {
        status: 'error',
        statusCode,
        message
    };

    // Add details for client errors or in development
    if (statusCode < 500 || !isProduction) {
        errorResponse.details = details;
    }

    // Add stack trace in development
    if (!isProduction && err.stack) {
        errorResponse.stack = err.stack.split('\n').map(line => line.trim());
    }

    // Send response
    res.status(statusCode).json(errorResponse);
};

// Middleware to handle 404 errors
const notFoundHandler = (req, res, next) => {
    const err = new AppError(404, 'Resource not found', {
        path: req.path,
        method: req.method
    });

    next(err);
};

// Middleware to handle async errors
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

module.exports = {
    AppError,
    errorHandler,
    notFoundHandler,
    asyncHandler
};