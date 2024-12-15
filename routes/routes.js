const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const router = express.Router();

const User = require('../models/User.js');


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

router.get("/signup", (req, res) => {
    res.sendFile(path.join(__dirname, '../signup.html'));
});

router.post('/signup', (req, res) => {
    console.log('Request Body:', req.body);
    bcrypt.hash(req.body.password, 10)
        .then(hash => {
            const newUser = new User({
                username: req.body.username,
                password: hash,
                role: req.body.role || 'user'
            });

            newUser.save()
                .then(result => {
                    res.status(201).json({
                        message: 'User created successfully',
                        result: result
                    });
                })
                .catch(err => {
                    if (err.code === 11000 && err.keyPattern.username === 1) {
                        res.status(400).json({ error: 'Username already exists' });
                    } else {
                        res.status(500).json({ error: err });
                    }
                });
        })
        .catch(hashError => {
            res.status(500).json({ error: hashError });
        });
});

router.get("/login", (req, res) => {
    res.sendFile(path.join(__dirname, '../login.html'));
});

router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // Find the user by username
        const user = await User.findOne({ username });

        if (!user) return res.status(404).json({ error: 'User not found' });

        // Check the password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

        // Generate a token
        const token = jwt.sign(
            {id: user._id, username: user.username, role: user.role}, 
            process.env.JWT_SECRET, 
            // { expiresIn: 60 * 60 * 1});
            { expiresIn: '1h'});

            console.log('Generated Token:', token);

        // Send the token to the frontend
        res.json({ token });
    } catch (err) {
        console.error('Error in /login:', err);
        res.status(500).json({ error: 'Server error' });
    }

});



// Upload content
router.post('/upload-content', auth, async (req, res) => {
    const { title, text } = req.body;

    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ message: 'You are not authorized to perform this action.' });
    }

    if (!title || !text) {
        return res.status(400).json({ message: 'Title and content are required.' });
    }

    try {
        const newContent = new Educational({ title, text });
        await newContent.save();
        res.status(201).json({ message: 'Content uploaded successfully!', content: newContent });
    } catch (err) {
        console.error('Error saving content:', err);
        res.status(500).json({ message: 'Failed to upload content', error: err.message });
    }
});

// Educational content view
router.get('/educational-content', auth, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1; // Current page
        const limit = 5; // Entries per page
        const skip = (page - 1) * limit;

        const content = await Educational.find()
            // Sort by newest first
            .sort({ createdAt: -1 }) 
            .skip(skip)
            .limit(limit)
            .select('title text createdAt');

        const totalCount = await Educational.countDocuments();
        const totalPages = Math.ceil(totalCount / limit);

        res.json({ content, totalPages, currentPage: page });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch educational content.' });
    }
});

router.get("/main", auth, (req, res) => {
    res.sendFile(path.join(__dirname, '../main.html'));
});

module.exports = router;
