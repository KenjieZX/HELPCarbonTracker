const dotenv = require('dotenv');
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");

const parser = require('body-parser');
const cors = require('cors');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Database connection
mongoose.connect('mongodb://127.0.0.1:27017/carbontracker')
    .then(() => { console.log('DB Connected') })
    .catch(() => { console.log('Connection Error') });

// MIDDLEWARE
app.use(express.urlencoded({extended: false}));
app.use(express.json());

app.use(express.static(path.join(__dirname, '/')));



app.use(cors());
app.use(parser.json());

app.use("", require('./routes/routes'));

function logout() {
    localStorage.removeItem('authToken'); // Clear token
    window.location.href = '/'; // Redirect to login
}

app.listen(PORT, () => {
    console.log(`Server started at http://localhost:${PORT}`);
});

