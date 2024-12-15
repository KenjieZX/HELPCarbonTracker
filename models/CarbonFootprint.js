const mongoose = require('mongoose');

const CarbonFootprintSchema = new mongoose.Schema({

    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    transportDistance: {
        type: Number,
        required: true,
    },
    transportMode: {
        type: String,
        required: true,
    },
    electricityUsage: {
        type: Number,
        required: true,
    },
    diet: {
        type: String,
        required: true,
    },
    carbonFootprint: {
        type: Number,
        required: true,
    },
    date: {
        type: Date,
        default: Date.now,
    },
    });

module.exports = mongoose.model('CarbonFootprint', CarbonFootprintSchema);