const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const fs = require('fs');

// Statische Dateien aus dem 'website' Ordner bereitstellen
app.use(express.static(path.join(__dirname, 'website')));

const heatMapFile = path.join(__dirname, 'heat-map.json');

// Funktion zum sicheren Lesen der JSON-Datei
function safeReadJSON(filePath) {
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        fs.writeFileSync(filePath, '[]');
        return [];
    }
}

// Funktion zum sicheren Schreiben der JSON-Datei
function safeWriteJSON(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Fehler beim Schreiben der JSON-Datei:', error);
    }
}

// Initialisiere heat-map.json, falls sie nicht existiert oder leer ist
if (!fs.existsSync(heatMapFile) || fs.statSync(heatMapFile).size === 0) {
    safeWriteJSON(heatMapFile, []);
}

io.on('connection', (socket) => {
    console.log('Ein Benutzer hat sich verbunden');
  
    socket.on('trackData', (data) => {
        console.log('Tracking-Daten empfangen:', data);
      
        // Lese bestehende Daten
        let heatMapData = safeReadJSON(heatMapFile);
      
        // Füge neue Daten hinzu
        heatMapData.push({
            timestamp: new Date().toISOString(),
            ...data
        });
      
        // Schreibe aktualisierte Daten zurück in die Datei
        safeWriteJSON(heatMapFile, heatMapData);
    });
});

// Socket.IO Client-Bibliothek bereitstellen
app.get('/socket.io/socket.io.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'node_modules', 'socket.io', 'client-dist', 'socket.io.js'));
});

const PORT = process.env.PORT || 8000;
http.listen(PORT, () => {
    console.log(`Server läuft auf Port ${PORT}`);
});
