const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const fs = require('fs');
const initializeTrackingServer = require('./tracking-server');
require('dotenv').config();

const PORT = process.env.PORT || 8000;

// Initialisiere den Tracking-Server
initializeTrackingServer(io, app, PORT);

// Statische Dateien aus dem 'website' Ordner bereitstellen
app.use(express.static(path.join(__dirname, 'website')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'website', 'index.html'));
});

app.get('/about', (req, res) => {
    res.sendFile(path.join(__dirname, 'website', 'secondpage', 'index.html'));
});

app.get('/contact', (req, res) => {
    res.sendFile(path.join(__dirname, 'website', 'thirdpage', 'index.html'));
});

// Socket.IO Client-Bibliothek bereitstellen
app.get('/socket.io/socket.io.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'node_modules', 'socket.io', 'client-dist', 'socket.io.js'));
});

http.listen(PORT, () => {
    console.log(`Server läuft auf Port ${PORT}`);
});