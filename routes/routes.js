const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const router = express.Router();


// Authentication Middleware
const auth = (req, res, next) => {

    // Extract token from the Authorization header
    const token = req.headers.authorization?.split(' ')[1]; 

    if (!token) return res.status(401).json({ message: 'Token needed' });

    jwt.verify(token, process.env.JWT_SECRET, (error, user) => {
        if (error) return res.status(403).json({ message: 'Invalid or expired token' });
        req.user = user; // Add user info to the request object
        next();
    });
};

// Default endpoint
router.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, '../index.html'));
});


module.exports = router;
