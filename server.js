const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const fs = require('fs');
const initializeTrackingServer = require('./tracking-server');
require('dotenv').config();

const PORT = process.env.PORT || 8000;
const resolutionsFile = path.join(__dirname, 'resolutions.json');

app.use(express.json());

// Initialisiere den Tracking-Server
initializeTrackingServer(io, app, PORT);

// Statische Dateien aus dem 'website' Ordner bereitstellen
app.use(express.static(path.join(__dirname, 'website')));

// GET alle gespeicherten Auflösungen
app.get('/saved-resolutions', (req, res) => {
    fs.readFile(resolutionsFile, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ error: 'Could not read file' });
        res.json(JSON.parse(data));
    });
});

// POST neue Auflösung speichern
app.post('/save-resolution', (req, res) => {
    const { width, height } = req.body;
    if (!width || !height) {
        return res.status(400).json({ error: 'Width and height are required' });
    }
    fs.readFile(resolutionsFile, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ error: 'Could not read file' });
        const resolutions = JSON.parse(data);
        resolutions.push({ width, height });
        fs.writeFile(resolutionsFile, JSON.stringify(resolutions, null, 2), err => {
            if (err) return res.status(500).json({ error: 'Could not save resolution' });
            res.json({ success: true });
        });
    });
});

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