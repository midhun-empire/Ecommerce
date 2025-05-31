




const errorHandler = (err, req, res, next) => {
    console.error('Error:', err.stack);
    const statusCode = err.statusCode || 500;
    const errorMessage = err.message || 'An unexpected error occurred';

    // For AJAX requests, return JSON
    if (req.xhr || req.headers.accept.includes('json')) {
        return res.status(statusCode).json({ success: false, message: errorMessage });
    }

    // For non-AJAX requests, redirect to error page
    res.status(statusCode).redirect('/pageNotFound');
};

module.exports = errorHandler;