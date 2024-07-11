require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const winston = require('winston');
const path = require('path');

const app = express();
const upload = multer({ dest: 'uploads/' });

// Create the Logs folder if it doesn't exist
if (!fs.existsSync('logs')) {
  fs.mkdirSync('logs');
}

const logFileName = `logs/log_${Date.now()}.log`;
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) => `${timestamp} ${level}: ${message}`)
  ),
  transports: [
    new winston.transports.File({ filename: logFileName })
  ]
});

// Import endpoint handlers
const renameKwgHandler = require('./endpoints/rename-kwg');
const deleteKwgHandler = require('./endpoints/delete-kwg');
const renamePageGroupHandler = require('./endpoints/rename-page-group');
const deletePageGroupHandler = require('./endpoints/delete-page-group');

// Middleware to attach logger to request
app.use((req, res, next) => {
  req.logger = logger;
  next();
});

// Define routes
app.post('/rename-kwg', upload.single('csvFile'), renameKwgHandler);
app.post('/delete-kwg', upload.single('csvFile'), deleteKwgHandler);
app.post('/rename-page-group', upload.single('csvFile'), renamePageGroupHandler);
// app.post('/delete-page-group', upload.single('csvFile'), deletePageGroupHandler);

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
  console.log(`Server is running on port ${PORT}`)
});
