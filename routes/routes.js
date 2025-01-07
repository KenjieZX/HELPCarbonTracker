const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const router = express.Router();

const User = require('../models/User.js');
const Educational = require('../models/Education.js');
const CarbonFootprint = require('../models/CarbonFootprint.js');

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

// Show recent activities in profile section
router.get('/profile', auth, async (req, res) => {
    try {
        const userId = req.user.id;

        // Fetch user profile data
        const user = await User.findById(userId).select('-password');
        if (!user) return res.status(404).json({ error: 'User not found.' });

        // Fetch recent activities (last 5 activities, sorted by date)
        const recentActivities = await CarbonFootprint.find({ userId: req.user.id })
            .sort({ date: -1 })
            .limit(5);

        res.json({
            username: user.username,
            activities: recentActivities.map(activity => ({
                transportType: activity.transportMode,
                transportDistance: activity.transportDistance,
                date: activity.date,
                dietary: activity.diet,
                electricUsage: activity.electricityUsage,
                carbonImpact: activity.carbonFootprint

            }))
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error.' });
    }
});

// Update profile
router.post('/update-profile', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { username, password } = req.body;

        // Fetch user from database
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'User not found.' });

        // Update username if provided
        if (username) {
            user.username = username;
        }

        // Update password if provided
        if (password) {
            const salt = await bcrypt.genSalt(10);
            user.password = await bcrypt.hash(password, salt);
        }

        // Save updated user to database
        await user.save();

        res.json({ message: 'Profile updated successfully.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error.' });
    }
});

// Endpoint to calculate user carbon footprint
router.post('/calculate-carbon', auth, (req, res) => {
    try {
        const { transportDistance, transportMode, electricityUsage, diet } = req.body;

        let carbonFootprint = 0;
        const transportEmissions = { car: 0.15, bus: 0.08, train: 0.045, bike: 0.0 };
        const electricityEmissionFactor = 0.65; // kg CO2 per kWh
        const dietEmissions = { vegan: 1.0, vegetarian: 2.0, omnivore: 6.0 };

        carbonFootprint += (transportDistance || 0) * (transportEmissions[transportMode] || 0);
        carbonFootprint += (electricityUsage || 0) * electricityEmissionFactor;
        carbonFootprint += dietEmissions[diet] || 0;

        res.json({ carbonFootprint });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to calculate carbon footprint.' });
    }
});

// Endpoint to save carbon footprint history
router.post('/save-carbon-history', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { transportDistance, transportMode, electricityUsage, diet, carbonFootprint } = req.body;

        const historyEntry = new CarbonFootprint({
            userId,
            transportDistance,
            transportMode,
            electricityUsage,
            diet,
            carbonFootprint,
            date: req.body.date,
        });

        await historyEntry.save();

        // Update the user's lifetimeCarbonFootprint
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const transportEmissions = { car: 0.15, bus: 0.08, train: 0.045, bike: 0.0 };

        // Update transport data
        if (transportMode && user.lifetimeCarbonFootprint.breakdown.transport[transportMode]) {
            const transportEmissionFinal = (transportDistance || 0) * (transportEmissions[transportMode] || 0);
            user.lifetimeCarbonFootprint.breakdown.transport[transportMode].value += transportEmissionFinal;
            user.lifetimeCarbonFootprint.breakdown.transport[transportMode].count += 1;
        }

        // Update electricity data
        if (electricityUsage) {
            user.lifetimeCarbonFootprint.breakdown.electricity.value += electricityUsage * 0.65;
            user.lifetimeCarbonFootprint.breakdown.electricity.count += 1;
        }

        // Update diet data
        if (diet) {
            const dietEmissions = { vegan: 1.0, vegetarian: 2.0, omnivore: 6.0 };
            const dietEmission = dietEmissions[diet] || 0;
            user.lifetimeCarbonFootprint.breakdown.diet.value += dietEmission;
            user.lifetimeCarbonFootprint.breakdown.diet.count += 1;
        }

        // Update the total carbon footprint
        user.lifetimeCarbonFootprint.total += carbonFootprint;

        // Save the updated user data
        await user.save();


        res.json({ message: 'History saved successfully.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to save history.' });
    }
});


// Endpoint to show recommendation based on user carbon footprint
router.get('/recommendations', auth, async (req, res) => {
    try {
        const userId = req.user.id;

        // Fetch the user's lifetime carbon footprint
        const user = await User.findById(userId, 'lifetimeCarbonFootprint');

        if (!user || !user.lifetimeCarbonFootprint) {
            return res.status(404).json({ message: 'No carbon footprint data found for recommendations.' });
        }

        const { breakdown } = user.lifetimeCarbonFootprint;

        // Define thresholds (these could be dynamic or based on external data)
        const thresholds = {
            car: 5,  // Average CO2 for car use
            bus: 3,  // Average CO2 for bus use
            bike: 0.5,  // Average CO2 for bike
            train: 2,  // Average CO2 for train
            electricity: 10,
            diet: 20,
        };

        const recommendations = [];

        // Transport-specific recommendations
        if (breakdown.transport) {
            const transportModes = breakdown.transport;
            let totalTransportEmissions = 0;
            let totalTransportCount = 0;

            Object.keys(transportModes).forEach((mode) => {
                const { value = 0, count = 0 } = transportModes[mode];
                const average = count > 0 ? value / count : 0;

                totalTransportEmissions += value;
                totalTransportCount += count;

                // Recommendation based on individual transport mode
                if (average > thresholds[mode]) {
                    recommendations.push(
                        `Your average ${mode} usage (${average.toFixed(2)} kg CO₂) is above normal. Consider reducing usage or switching to a more eco-friendly mode.`
                    );
                } else if (count === 0) {
                    recommendations.push(`You haven't used ${mode} yet. Consider trying it for an eco-friendly alternative.`);
                } else {
                    recommendations.push(`Your ${mode} usage (${average.toFixed(2)} kg CO₂) is within an acceptable range. Keep it up!`);
                }
            });

            // Calculate overall transport average and provide additional advice
            const overallTransportAverage = totalTransportCount > 0 ? totalTransportEmissions / totalTransportCount : 0;

            if (overallTransportAverage > Math.max(...Object.values(thresholds).slice(0, 4))) {
                recommendations.push(
                    `Your overall transport emissions (${overallTransportAverage.toFixed(2)} kg CO₂ per trip) are high. Explore carpooling, public transport, or biking to reduce emissions.`
                );
            } else {
                recommendations.push("Your overall transport emissions are within a sustainable range. Great job!");
            }
        }

        // Helper function for general recommendations for other categories (electricity, diet)
        const calculateCategoryRecommendations = (category) => {
            const { value = 0, count = 0 } = breakdown[category] || {};
            const average = count > 0 ? value / count : 0;

            if (average > thresholds[category]) {
                return `Your average ${category} usage (${average.toFixed(2)} kg CO₂) is above normal. Consider reducing usage.`;
            } else {
                return `Your ${category} usage (${average.toFixed(2)} kg CO₂) is within the acceptable range. Keep it up!`;
            }
        };

        // Adding electricity and diet recommendations
        recommendations.push(calculateCategoryRecommendations('electricity'));
        recommendations.push(calculateCategoryRecommendations('diet'));

        // If no recommendations, provide a message
        if (recommendations.length === 0) {
            recommendations.push("Great job! Your carbon footprint is already low. Keep up the good work!");
        }

        res.json({ recommendations });
    } catch (error) {
        console.error('Error generating recommendations:', error);
        res.status(500).json({ message: 'An error occurred while generating recommendations.' });
    }
});


// Search users
router.get("/users/search", async (req, res) => {
    try {
        const query = req.query.q;
        const users = await User.find({ username: { $regex: query, $options: "i" } }).select("username");
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: "Error searching users." });
    }
});

// Get friend list
router.get('/friends', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).populate('friends', 'username');

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.status(200).json(user.friends);
    } catch (error) {
        console.error("Error fetching friends:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Add friend
router.post('/addfriend', auth, async (req, res) => {

    try {
        const user = await User.findById(req.user.id);
        // console.log("Found user:", user); // Log the found user
        
        if (!user) {
            return res.status(404).json({ error: "User not found." });
        }

        const friend = await User.findById(req.body.friendId);
        // console.log("Found friend:", friend); // Log the found friend
        
        if (!friend) {
            return res.status(404).json({ error: "Friend not found." });
        }

        if (user.friends.includes(req.body.friendId)) {
            return res.status(400).json({ error: "Already friends." });
        }

        user.friends.push(req.body.friendId);
        await user.save();

        res.status(200).json({ message: "Friend added successfully." });
    } catch (error) {
        console.error("Error adding friend:", error);
        res.status(500).json({ error: "Internal server error." });
    }
});


// Historical tracking endpoint
router.get("/history", auth, async (req, res) => {
    try {
        const activities = await CarbonFootprint.find({ userId: req.user.id });
        res.json(activities);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching history', error: err });
    }
});

// Upload educational content
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


// Lifetime carbon footprint
router.get('/lifetime-carbon', auth, async (req, res) => {
    try {
        const userId = req.user.id;

        // Fetch the user's data from the users collection
        const user = await User.findById(userId, 'lifetimeCarbonFootprint');

        if (!user || !user.lifetimeCarbonFootprint) {
            return res.status(404).json({ message: 'No lifetime carbon footprint data found.' });
        }

        const { total, breakdown } = user.lifetimeCarbonFootprint;

        res.json({
            totalCarbonFootprint: total || 0,
            breakdown,
        });
    } catch (error) {
        console.error('Error fetching lifetime carbon data:', error);
        res.status(500).json({ message: 'An error occurred while fetching the data.' });
    }
});

router.get("/main", auth, (req, res) => {
    res.sendFile(path.join(__dirname, '../main.html'));
});

module.exports = router;
