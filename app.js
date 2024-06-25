require('dotenv').config();
const express = require('express');
const multer = require('multer');

const app = express();
const upload = multer({ dest: 'uploads/' });

// Import endpoint handlers
const renameKwgHandler = require('./endpoints/rename-kwg');
const deleteKwgHandler = require('./endpoints/delete-kwg');
const renamePageGroupHandler = require('./endpoints/rename-page-group');
const deletePageGroupHandler = require('./endpoints/delete-page-group');

// Define routes
app.post('/rename-kwg', upload.single('csvFile'), renameKwgHandler);
app.post('/delete-kwg', upload.single('csvFile'), deleteKwgHandler); 
app.post('/rename-page-group', upload.single('csvFile'), renamePageGroupHandler);
// app.post('/delete-page-group', upload.single('csvFile'), deletePageGroupHandler);

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
