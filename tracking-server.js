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

        socket.on('disconnect', () => {
            console.log('Ein Benutzer hat die Verbindung getrennt:', socket.sessionID);
        });
    });

    app.get('/heat-map', (req, res) => {
        const heatMapData = safeReadJSON(heatMapFile);
        res.json(heatMapData);
    });


    // Dynamisch generierte Monitoring-Seite
    app.get('/monitoring', (req, res) => {
        res.type('html');

        res.send(html_monitoring.replace('{PORT}', port));
    });

    // Dynamisch generiertes Tracking-Skript
    app.get('/tracking.js', (req, res) => {
        const trackingScript = `
            const socket = io('http://localhost:${port}', {
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

            function createID() {
                // Erstelle eine zufällige ID aus 36 Zeichen (0-9, a-z)
                const options = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
                let id = '';
                for (let i = 0; i < 9; i++) {
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

            
            function trackClick(event) {
                const currentTime = Date.now();
                const pathDuration = currentTime - lastClickTime;
                const previousID = cookiesGet('previousClickedID') || null;
                const ID = createID();
                const data = {
                    target: {
                        tagName: event.target.tagName,
                        id: event.target.id,
                        className: event.target.className
                    },
                    path: mousePath,
                    clickPosition: {
                        x: event.clientX,
                        y: event.clientY
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

                if (previousID) socket.emit('replaceNextID', previousID, ID);
                socket.emit('trackData', data);
                cookiesSet('previousClickedID', ID, 5);
            
                // Reset for next path
                lastClickTime = currentTime;
                mousePath = [];
            }
            
            document.addEventListener('mousemove', trackMouseMovement);
            document.addEventListener('click', trackClick);
            
            socket.on('connect', () => {
                const sessionID = cookiesGet('sessionID') || createID();
                cookiesSet('sessionID', sessionID, 999999999);
                // Send session ID to server
                socket.emit('sessionID', sessionID);
                console.log('Connected to server');
            });
            
            socket.on('connect_error', (error) => {
                console.error('Connection error:', error);
            });

            function disableTracking() {
                document.removeEventListener('mousemove', trackMouseMovement);
                document.removeEventListener('click', trackClick);
                document.getElementById('tracking-script').remove();
                socket.disconnect();
                console.log('Tracking disabled');
            }

            function addControlledClicking() {
                document.addEventListener('click', (event) => {
                    console.log('Click event enabled');
                    if (event.target !== enabledButton) {
                        console.log('Click event disabled');
                        enabledButton = event.target;
                        event.preventDefault();
                        event.stopImmediatePropagation();
                    }
                }, true);
            }

            function getClickedObject(event) {
                const clickedObject = {
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

html_monitoring = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="Monitoring für UIUX-Framework">
    <style>
        body, html {
            margin: 0;
            padding: 0;
            height: 100%;
            overflow: hidden;
        }

        .uiux {
            display: flex;
            height: 100vh;
            width: 100vw;
        }

        #uiux-frame {
            flex: 4;
            position: relative;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
        }

        #uiux-frame iframe {
            width: 100%;
            height: 100%;
            border: none;
        }

        #uiux-controls {
            flex: 1;
            background: rgba(0, 0, 0, 0.5);
            color: white;
            padding: 20px;
            box-sizing: border-box;
            overflow-y: auto;
        }

        .linked {
            color: lightblue;
            cursor: pointer;
        }

        .linked:hover {
            text-decoration: underline;
        }

        #heatmap {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 1;
        }

        .element-highlight {
            position: absolute;
            border: 2px solid rgba(128, 128, 128, 0.8);
            background: rgba(128, 128, 128, 0.1);
            pointer-events: none;
            z-index: 2;
        }

        .element-highlight-before {
            position: absolute;
            border: 2px solid rgba(0, 255, 0, 0.8);
            background: rgba(0, 255, 0, 0.1);
            pointer-events: none;
            z-index: 2;
        }

        .element-highlight-after {
            position: absolute;
            border: 2px solid rgba(255, 0, 0, 0.8);
            background: rgba(255, 0, 0, 0.1);
            pointer-events: none;
            z-index: 2;
        }

        .element-popup {
            position: absolute;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 10px;
            border-radius: 5px;
            font-size: 12px;
            pointer-events: none;
            z-index: 3;
            max-width: 300px;
            word-wrap: break-word;
        }

        .element-popup::before {
            content: '';
            position: absolute;
            top: -10px;
            left: 50%;
            transform: translateX(-50%);
            border-width: 0 10px 10px 10px;
            border-style: solid;
            border-color: transparent transparent rgba(0, 0, 0, 0.8) transparent;
        }

        h1 {
            margin-top: 0;
            font-size: 1.5em;
        }
    </style>
    <script>
        let clickedObject = null;
        let mostClickedBefore = null;
        let mostClickedAfter = null;
        let grid = [];
        const gridSize = 5;
        let highlightElement = null;
        let highlightElementFrom = null;
        let highlightElementTo = null;

        // Wait for the DOM to be loaded
        document.addEventListener('DOMContentLoaded', () => {
            const iframe = document.querySelector('iframe');
            const heatmapCanvas = document.getElementById('heatmap');
            const heatmapCtx = heatmapCanvas.getContext('2d');

            function createHighlight() {
                highlightElement = document.createElement('div');
                highlightElement.className = 'element-highlight';
                document.body.appendChild(highlightElement);
                highlightElementFrom = document.createElement('div');
                highlightElementFrom.className = 'element-highlight-before';
                document.body.appendChild(highlightElementFrom);
                highlightElementTo = document.createElement('div');
                highlightElementTo.className = 'element-highlight-after';
                document.body.appendChild(highlightElementTo);
            }

            function getMostClickedBefore(heatMapData, clickedObjectData) {
                const previousIDs = clickedObjectData.map(item => item.previousID);
                const before = heatMapData.filter(item => previousIDs.includes(item.id));
                if (before.length === 0) {
                    return null;
                }
                const counts = before.reduce((acc, item) => {
                    acc[item.id] = (acc[item.id] || 0) + 1;
                    return acc;
                }, {});
                counts[null] = previousIDs.filter(id => id === null).length;
                const mostClickedID = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
                const mostClicked = before.find(item => item.id === mostClickedID);
                return mostClicked;
            }

            function getMostClickedAfter(heatMapData, clickedObjectData) {
                const nextIDs = clickedObjectData.map(item => item.nextID);
                const after = heatMapData.filter(item => nextIDs.includes(item.id));
                if (after.length === 0) {
                    return null;
                }
                const counts = after.reduce((acc, item) => {
                    acc[item.id] = (acc[item.id] || 0) + 1;
                    return acc;
                }, {});
                const mostClickedID = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
                const mostClicked = after.find(item => item.id === mostClickedID);
                return mostClicked;
            }


            async function updateInformation(target) {

                const iframe_url = iframe.contentWindow.location.href.split('?')[0].split('#')[0];
                const heatmapData = await fetchHeatmapData();
                const clickedObjectMap = {
                    tagName: target.tagName,
                    id: target.id,
                    className: target.className
                };
                const clickedObjectData = heatmapData.filter(item => {
                    return clickedObjectMap.id === item.target.id && clickedObjectMap.tagName === item.target.tagName && iframe_url === item.url;
                });
                const times = clickedObjectData.map(item => item.pathDuration);
                const fastestTime = Math.min(...times);
                const averageTime = times.reduce((a, b) => a + b, 0) / times.length;
                const slowestTime = Math.max(...times);
                const clicks = clickedObjectData.length;
                mostClickedBefore = getMostClickedBefore(heatmapData, clickedObjectData);
                mostClickedAfter = getMostClickedAfter(heatmapData, clickedObjectData);


                
                // Update popup content and position
                const path = getElementPath(target);
                document.getElementById('path').textContent = path;
                document.getElementById('id').textContent = target.id || '-';
                document.getElementById('class').textContent = target.className || '-';
                document.getElementById('clicks').textContent = clicks;
                document.getElementById('fastest-time').textContent = (fastestTime / 1000).toFixed(2);
                document.getElementById('average-time').textContent = (averageTime / 1000).toFixed(2);
                document.getElementById('slowest-time').textContent = (slowestTime / 1000).toFixed(2);
                document.getElementById('most-clicked-before').textContent = mostClickedBefore ? \`\${mostClickedBefore.target.tagName} #\${mostClickedBefore.target.id}\` : 'Keine';
                if (mostClickedBefore) {
                    document.getElementById('most-clicked-before').classList.add('linked');
                } else {
                    document.getElementById('most-clicked-before').classList.remove('linked');
                }
                document.getElementById('most-clicked-before').onclick = function(event) {
                    if (!document.getElementById('most-clicked-before').classList.contains('linked')) {
                        return;
                    }
                    clickedObject = mostClickedBefore.target;
                    let element = iframe.contentWindow.document.querySelector(getElementPath(mostClickedBefore.target));
                    updateInformation(element);
                };
                document.getElementById('most-clicked-after').textContent = mostClickedAfter ? \`\${mostClickedAfter.target.tagName} #\${mostClickedAfter.target.id}\` : 'Keine';
                if (mostClickedAfter) {
                    document.getElementById('most-clicked-after').classList.add('linked');
                } else {
                    document.getElementById('most-clicked-after').classList.remove('linked');
                }
                document.getElementById('most-clicked-after').onclick = function(event) {
                    if (!document.getElementById('most-clicked-after').classList.contains('linked')) {
                        return;
                    }
                    clickedObject = mostClickedAfter.target;
                    let element = iframe.contentWindow.document.querySelector(getElementPath(mostClickedAfter.target));
                    updateInformation(element);
                };
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

            // Set the canvas size to match the iframe size
            function resizeCanvas() {
                heatmapCanvas.width = iframe.offsetWidth;
                heatmapCanvas.height = iframe.offsetHeight;
                initGrid();
            }

            // Initialize the grid
            function initGrid() {
                grid = new Array(Math.ceil(heatmapCanvas.width / gridSize))
                    .fill()
                    .map(() => new Array(Math.ceil(heatmapCanvas.height / gridSize)).fill(0));
            }

            // Call resizeCanvas initially and on window resize
            resizeCanvas();
            window.addEventListener('resize', resizeCanvas);

            // Function to disable tracking.js in the iframe
            function disableTracking() {
                iframe.addEventListener('load', () => {
                    const iframeWindow = iframe.contentWindow;
                    if (iframeWindow.disableTracking) {
                        iframeWindow.disableTracking();
                    }
                });
            }

            function addControlledClicking() {
                iframe.addEventListener('load', () => {
                    const iframeWindow = iframe.contentWindow;
                    if (iframeWindow.addControlledClicking) {
                        iframeWindow.addControlledClicking();
                    }
                });
            }

            // Function to fetch heat-map data
            async function fetchHeatmapData() {
                try {
                    const response = await fetch('../heat-map');
                    return await response.json();
                } catch (error) {
                    console.error('Error fetching heat-map data:', error);
                    return [];
                }
            }

            // Function to draw yellow outlined circle for each click
            function drawClicks(x_click, y_click, scrollX, scrollY) {
                heatmapCtx.lineWidth = 2;
                heatmapCtx.beginPath();
                heatmapCtx.arc(x_click - scrollX, y_click - scrollY, 10, 0, 2 * Math.PI);
                heatmapCtx.strokeStyle = 'yellow';
                heatmapCtx.stroke();
            }

            // Function to get color based on count
            function getColor(count) {
                if (count === 1) return 'blue';
                if (count === 2) return 'yellow';
                if (count === 3) return 'orange';
                if (count >= 4) return 'red';
                return 'green';
            }

            function drawPath(path, resolution, scrollX, scrollY) {
                heatmapCtx.lineWidth = 10;
                path.forEach((point, index) => {
                    const x = (point.x / resolution.width) * heatmapCanvas.width - scrollX;
                    const y = (point.y / resolution.height) * heatmapCanvas.height - scrollY;

                    const gridX = Math.floor(x / gridSize);
                    const gridY = Math.floor(y / gridSize);

                    if (gridX >= 0 && gridX < grid.length && gridY >= 0 && gridY < grid[0].length) {
                        grid[gridX][gridY]++;
                        let count = grid[gridX][gridY];
                        count = Math.floor(count / 10);
                        heatmapCtx.strokeStyle = getColor(count);
                        heatmapCtx.globalAlpha = 0.3 + count/10;
                    } else {
                        heatmapCtx.strokeStyle = 'green';
                        heatmapCtx.globalAlpha = 0.3;
                    }

                    if (index === 0) {
                        heatmapCtx.beginPath();
                        heatmapCtx.moveTo(x, y);
                    } else {
                        heatmapCtx.lineTo(x, y);
                        heatmapCtx.stroke();
                        heatmapCtx.beginPath();
                        heatmapCtx.moveTo(x, y);
                    }
                });
            }

            // Function to draw the heatmap
            function drawHeatmap(data) {
                const scrollX = iframe.contentWindow.scrollX;
                const scrollY = iframe.contentWindow.scrollY;

                heatmapCtx.clearRect(0, 0, heatmapCanvas.width, heatmapCanvas.height);
                initGrid();

                data.forEach(item => {
                    if (clickedObject === null) {
                        return;
                    }
                    const iframe_url = iframe.contentWindow.location.href.split('?')[0].split('#')[0];
                    if (clickedObject.id !== item.target.id || clickedObject.tagName !== item.target.tagName || item.url !== iframe_url) {
                        return;
                    }
                    const { clickPosition, resolution, path } = item;

                    drawPath(path, resolution, scrollX, scrollY);
                    
                    const x_click = (clickPosition.x / resolution.width) * heatmapCanvas.width;
                    const y_click = (clickPosition.y / resolution.height) * heatmapCanvas.height;

                    drawClicks(x_click, y_click, scrollX, scrollY);
                });
            }

            // Main function to initialize the heatmap
            async function initHeatmap() {
                const heatmapData = await fetchHeatmapData();
                drawHeatmap(heatmapData);

                if (!clickedObject) {
                    return;
                }
                const iframeRect = iframe.getBoundingClientRect();

                const target = iframe.contentWindow.document.querySelector(getElementPath(clickedObject));
                if (target) {
                    const targetRect = target.getBoundingClientRect();
                    highlightElement.style.left = \`\${iframeRect.left + targetRect.left}px\`;
                    highlightElement.style.top = \`\${iframeRect.top + targetRect.top}px\`;
                    highlightElement.style.width = \`\${targetRect.width}px\`;
                    highlightElement.style.height = \`\${targetRect.height}px\`;
                }

                if (mostClickedBefore) {
                    // Update highlight position for most clicked before
                    const targetBefore = iframe.contentWindow.document.querySelector(getElementPath(mostClickedBefore?.target));
                    if (targetBefore) {
                        const targetRectBefore = targetBefore.getBoundingClientRect();
                        highlightElementFrom.style.left = \`\${iframeRect.left + targetRectBefore.left}px\`;
                        highlightElementFrom.style.top = \`\${iframeRect.top + targetRectBefore.top}px\`;
                        highlightElementFrom.style.width = \`\${targetRectBefore.width}px\`;
                        highlightElementFrom.style.height = \`\${targetRectBefore.height}px\`;
                    }
                } else {
                    // remove highlight for most clicked before
                    highlightElementFrom.style.left = '-1000px';
                    highlightElementFrom.style.top = '-1000px';
                    highlightElementFrom.style.width = '0';
                    highlightElementFrom.style.height = '0';
                }

                if (mostClickedAfter) {
                    // Update highlight position for most clicked after
                    const targetAfter = iframe.contentWindow.document.querySelector(getElementPath(mostClickedAfter?.target));
                    if (targetAfter) {
                        const targetRectAfter = targetAfter.getBoundingClientRect();
                        highlightElementTo.style.left = \`\${iframeRect.left + targetRectAfter.left}px\`;
                        highlightElementTo.style.top = \`\${iframeRect.top + targetRectAfter.top}px\`;
                        highlightElementTo.style.width = \`\${targetRectAfter.width}px\`;
                        highlightElementTo.style.height = \`\${targetRectAfter.height}px\`;
                    }
                } else {
                    // remove highlight for most clicked after
                    highlightElementTo.style.left = '-1000px';
                    highlightElementTo.style.top = '-1000px';
                    highlightElementTo.style.width = '0';
                    highlightElementTo.style.height = '0';
                }
            }

            function getClickedObject(event) {
                const iframeWindow = iframe.contentWindow;
                if (iframeWindow.getClickedObject) {
                    return iframeWindow.getClickedObject(event);
                }
            }

            // Create highlight elements
            createHighlight();

            // Add click event listener to the iframe
            iframe.addEventListener('load', () => {
                iframe.contentWindow.document.addEventListener('click', event => {
                    const object = getClickedObject(event);
                    if (object) {
                        clickedObject = object;
                        updateInformation(event.target);
                    }
                }, true);
            });

            disableTracking();
            addControlledClicking();
            setInterval(initHeatmap, 1);
        });
    </script>
    <title>Monitoring für UIUX-Framework</title>
</head>
<body>
    <div class="uiux">
        <div id="uiux-frame">
            <iframe src="http://localhost:{PORT}" title="Monitoring"></iframe>
            <canvas id="heatmap"></canvas>
        </div>
        <div id="uiux-controls">
            <h1>UIUX Monitoring</h1>
            <p><strong>Path:</strong> <span id="path">-</span></p>
            <p><strong>ID:</strong> <span id="id">-</span></p>
            <p><strong>Class:</strong> <span id="class">-</span></p>
            <p><strong>Clicks:</strong> <span id="clicks">-</span></p>
            <p><strong>Fastest time to click element:</strong> <span id="fastest-time">-</span> s</p>
            <p><strong>Average time to click element:</strong> <span id="average-time">-</span> s</p>
            <p><strong>Slowest time to click element:</strong> <span id="slowest-time">-</span> s</p>
            <p><strong>Most came from:</strong> <span id="most-clicked-before">-</span></p>
            <p><strong>Most go to:</strong> <span id="most-clicked-after">-</span></p>
        </div>
    </div>
</body>
</html>`;