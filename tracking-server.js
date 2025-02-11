const path = require('path');
const fs = require('fs');
require('dotenv').config();

function initializeTrackingServer(io, app, port) {
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

    // Funktion zum ersetzen der nextID in der JSON-Datei
    function replaceNextID(filePath, ID, nextID) {
        const data = safeReadJSON(filePath);
        const index = data.findIndex(item => item.id === ID);
        if (index !== -1) {
            data[index].nextID = nextID;
            safeWriteJSON(filePath, data);
        }
    }

    // Initialisiere heat-map.json, falls sie nicht existiert oder leer ist
    if (!fs.existsSync(heatMapFile) || fs.statSync(heatMapFile).size === 0) {
        safeWriteJSON(heatMapFile, []);
    }

    io.on('connection', (socket) => {

        socket.on('sessionID', (sessionID) => {
            socket.sessionID = sessionID;
            console.log('Ein Benutzer hat sich verbunden:', sessionID);
        });

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

        socket.on('replaceNextID', (ID, nextID) => {
            console.log('Replace nextID:', ID, nextID);
            replaceNextID(heatMapFile, ID, nextID);
        });

        socket.on('reportAccessibility', (report) => {
            console.log('Accessibility report received:', report);
            // Could store in DB or process further
        });

        socket.on('disconnect', () => {
            console.log('Ein Benutzer hat die Verbindung getrennt:', socket.sessionID);
        });

        socket.on('changeResolution', (resolution) => {
            console.log('Auflösung geändert zu:', resolution);
            if (trackConfig.resolution.includes(resolution)) {
                const filteredData = getHeatmapDataForResolution(resolution);
                socket.emit('heatmapUpdate', filteredData);
            }
        });
    });

    app.get('/heat-map', (req, res) => {
        const { widthMin, widthMax, heightMin, heightMax } = req.query;
        let heatMapData = safeReadJSON(heatMapFile);
        
        if (widthMin && widthMax && heightMin && heightMax) {
            heatMapData = heatMapData.filter(data => 
                data.resolution.width >= parseInt(widthMin) &&
                data.resolution.width <= parseInt(widthMax) &&
                data.resolution.height >= parseInt(heightMin) &&
                data.resolution.height <= parseInt(heightMax)
            );
        }
        
        res.json(heatMapData);
    });


    // Dynamisch generierte Monitoring-Seite
    app.get('/monitoring', (req, res) => {
        res.type('html');
        const html = fs.readFileSync('monitoring/index.html', 'utf8');
        const renderedHtml = html.replace('{PORT}', port);
        
        res.send(renderedHtml);
    });

    // Dynamisch generiertes Tracking-Skript
    app.get('/tracking.js', (req, res) => {
        const trackingScript = `
            const tracking_socket = io('http://localhost:${port}', {
                transports: ['websocket']
            });
            
            let lastClickTime = Date.now();
            let mousePath = [];
            let enabledButton = null;
            
            function trackMouseMovement(event) {
                mousePath.push({
                    x: event.clientX + window.scrollX,
                    y: event.clientY + window.scrollY,
                    time: Date.now()
                });
            }
                
            function getElementPath(element) {
                let path = [];
                while (element && element.tagName) {
                    let selector = element.tagName.toLowerCase();
                    if (element.id) {
                        selector += \`#\${element.id}\`;
                    } else if (element.className) {
                        selector += \`.\${element.className.split(' ').join('.')}\`;
                    }
                    path.unshift(selector);
                    element = element.parentElement;
                }
                return path.join(' > ');
            }

            function createID() {
                // Erstelle eine zufällige ID aus 36 Zeichen (0-9, a-z)
                const options = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
                let id = '';
                for (let i = 0; i < 36; i++) {
                    id += options[Math.floor(Math.random() * options.length)];
                }
                return id;
            }

            function cookiesGet(name) {
                const value = '; ' + document.cookie;
                const parts = value.split('; ' + name + '=');
                if (parts.length === 2) return parts.pop().split(';').shift();
                return null;
            }

            function cookiesSet(name, value, minutes) {
                const date = new Date();
                date.setTime(date.getTime() + (minutes * 60 * 1000));
                document.cookie = name + '=' + value + '; expires=' + date.toUTCString() + '; path=/';
            }

            function mouseMovementConvertToRelative(mousePath, lastElementPosition, clickedElementPosition) {
                // Wenn keine letzte Position vorhanden ist, starte bei 0,0
                const startX = lastElementPosition.x ? lastElementPosition.x : mousePath[0].x;
                const startY = lastElementPosition.y ? lastElementPosition.y : mousePath[0].y;
                
                // Konvertiere jeden Punkt des Pfades in relative Koordinaten
                return mousePath.map(point => {
                    // Berechne relative Position zwischen Start- und Endpunkt
                    const relativeX = (point.x - startX) / (clickedElementPosition.x - startX);
                    const relativeY = (point.y - startY) / (clickedElementPosition.y - startY);
                    
                    return {
                        x: point.x,
                        y: point.y,
                        xr: relativeX,
                        yr: relativeY,
                        time: point.time
                    };
                });
            }

            
            function trackClick(event) {
                const currentTime = Date.now();
                const pathDuration = currentTime - lastClickTime;
                const previousID = cookiesGet('previousClickedID') || null;
                const ID = createID();
                const offset = event.target.getBoundingClientRect();
                const previousClickedX = cookiesGet('previousClickedX') || 0;
                const previousClickedY = cookiesGet('previousClickedY') || 0;
                const lastElementPosition = {x: previousClickedX, y: previousClickedY};
                const clickedElementPosition = {x: event.clientX, y: event.clientY};
                const data = {
                    target: {
                        path: getElementPath(event.target),
                        tagName: event.target.tagName,
                        id: event.target.id,
                        className: event.target.className
                    },
                    path: mouseMovementConvertToRelative(mousePath, lastElementPosition, clickedElementPosition),
                    clickPosition: {
                        relativeClickPosition: {x: (event.clientX - offset.left) / offset.width, y: (event.clientY - offset.top) / offset.height}
                    },
                    pathDuration: pathDuration,
                    url: window.location.href.split('?')[0].split('#')[0],
                    resolution: {
                        width: window.innerWidth,
                        height: window.innerHeight
                    },
                    session_id: cookiesGet('sessionID'),
                    id: ID,
                    previousID: previousID,
                    nextID: null
                };

                if (previousID) tracking_socket.emit('replaceNextID', previousID, ID);
                tracking_socket.emit('trackData', data);
                cookiesSet('previousClickedID', ID, 5);
                cookiesSet('previousClickedX', event.clientX, 5);
                cookiesSet('previousClickedY', event.clientY, 5);
            
                // Reset for next path
                lastClickTime = currentTime;
                mousePath = [];
                trackMouseMovement(event);
            }
            
            document.addEventListener('mousemove', trackMouseMovement);
            document.addEventListener('click', trackClick);
            
            tracking_socket.on('connect', () => {
                const sessionID = cookiesGet('sessionID') || createID();
                cookiesSet('sessionID', sessionID, 999999999);
                // Send session ID to server
                tracking_socket.emit('sessionID', sessionID);
                console.log('Connected to server');
            });
            
            tracking_socket.on('connect_error', (error) => {
                console.error('Connection error:', error);
            });

            function disableTracking() {
                document.removeEventListener('mousemove', trackMouseMovement);
                document.removeEventListener('click', trackClick);
                document.getElementById('tracking-script').remove();
                tracking_socket.disconnect();
                console.log('Tracking disabled');
            }

            function addControlledClicking() {
                document.addEventListener('click', (event) => {
                    if (event.target !== enabledButton) {
                        enabledButton = event.target;
                        event.preventDefault();
                        event.stopImmediatePropagation();
                    }
                }, true);
            }

            function getClickedObject(event) {
                const clickedObject = {
                    path: getElementPath(event.target),
                    tagName: event.target.tagName,
                    id: event.target.id,
                    className: event.target.className
                };
            
                return clickedObject;
            }
            
            console.log('Tracking script loaded');
        `;

        res.type('application/javascript');
        res.send(trackingScript);
    });

    return {
        getHeatMapData: () => safeReadJSON(heatMapFile)
    };
}

module.exports = initializeTrackingServer;