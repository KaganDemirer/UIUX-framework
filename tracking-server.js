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
                        path: getElementPath(event.target),
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

                if (previousID) tracking_socket.emit('replaceNextID', previousID, ID);
                tracking_socket.emit('trackData', data);
                cookiesSet('previousClickedID', ID, 5);
            
                // Reset for next path
                lastClickTime = currentTime;
                mousePath = [];
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

html_monitoring = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="Monitoring für UIUX-Framework">
    <style>
        * {
            font-family: Arial, sans-serif;
            color: #373D55;
        }

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
            background: #FFF;
            color: white;
            box-sizing: border-box;
            overflow-y: auto;
            border-left: 0.25em solid #373D55;
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
            font-size: 2em;
            width: 100%;
            text-align: center;
        }

        h2 {
            font-size: 1.25em;
            margin-top: 0;
            margin-bottom: 1em;
            width: 100%;
            border-bottom: 1px solid #6B6C6C;
        }

        .card {
            background: #f9f9f9;
            padding: 0.5em;
            margin: 1em;
            border-radius: 0.5em;
            box-shadow: 0 0 1em rgba(0, 0, 0, 0.2);
            transition: all 0.1s;
        }

        .card:hover {
            box-shadow: 0 0 1em rgba(0, 0, 0, 0.4);
            transition: all 0.2s;
        }

        .card_information {
            font-size: 0.5em;
            color: #a3a3a3;
            text-align: right;
            width: 100%;
        }


        .header {
            width: 100%;
            margin-bottom: 1em;
            margin-top: 0.5em;
        }

        .header img {
            width: 4em;
            height: 4em;
        }


    </style>
    <script>
        let clickedObject = null;
        let mostClickedBefore = null;
        let mostClickedAfter = null;
        let heatmapURL = "";
        let heatmapData = null;
        let grid = [];
        const gridSize = 5;
        let highlightElement = null;
        let highlightElementFrom = null;
        let highlightElementTo = null;
        let clicksStatistics = {};

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

            function matchUrlPattern(pattern, url) {
                // Escape special regex characters except *
                const escapeRegex = (str) => str.replace(/[.+?^$\{\}()|[\]\\\\]/g, '\\\\$&');
                
                // Convert pattern to regex
                // Replace * with regex pattern that requires at least one character except /
                const regexPattern = escapeRegex(pattern).replace(/\\*/g, '[^/]+');
                
                // Create RegExp object with ^$ to ensure full string match
                const regex = new RegExp(\`^\${regexPattern}$\`);
                
                // Zusätzliche Validierung: Prüfe ob die Anzahl der Pfadsegmente übereinstimmt
                const patternSegments = pattern.split('/').length;
                const urlSegments = url.split('/').length;
                
                if (patternSegments !== urlSegments) {
                    return false;
                }
                
                return regex.test(url);
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

            function countClicksOnElement(heatMapData) {
                // count the clicks on each element on the heatmapURL
                clicksStatistics = {};
                heatMapData.forEach(item => {
                    if (!matchUrlPattern(heatmapURL, item.url)) {
                        return;
                    }
                    const key = \`\${item.target.id}\`;
                    clicksStatistics[key] = {
                        "tagName": item.target.tagName,
                        "id": item.target.id,
                        "path": item.target.path,
                        "class": item.target.className,
                        "clicks": (clicksStatistics[key]?.clicks || 0) + 1
                    }
                });
            }


            async function updateInformation(target) {
                const clickedObjectMap = {
                    path: getElementPath(target),
                    tagName: target.tagName,
                    id: target.id,
                    className: target.className
                };
                const clickedObjectData = heatmapData.filter(item => {
                    return clickedObjectMap.path === item.target.path && clickedObjectMap.id === item.target.id && clickedObjectMap.tagName === item.target.tagName && matchUrlPattern(heatmapURL, item.url);
                });
                const times = clickedObjectData.map(item => item.pathDuration);
                const fastestTime = times.length ? Math.min(...times) : 0;
                const averageTime = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
                const slowestTime = times.length ? Math.max(...times) : 0;
                const clicks = clickedObjectData.length;
                mostClickedBefore = getMostClickedBefore(heatmapData, clickedObjectData);
                mostClickedAfter = getMostClickedAfter(heatmapData, clickedObjectData);


                
                // Update popup content and position
                document.getElementById('path').textContent = clickedObjectMap.path;
                document.getElementById('id').textContent = target.id || '-';
                document.getElementById('class').textContent = target.className || '-';
                document.getElementById('clicks').textContent = clicks;
                document.getElementById('fastest-time').textContent = (fastestTime / 1000).toFixed(2);
                document.getElementById('average-time').textContent = (averageTime / 1000).toFixed(2);
                document.getElementById('slowest-time').textContent = (slowestTime / 1000).toFixed(2);
                document.getElementById('most-clicked-before').textContent = mostClickedBefore ? \`\${mostClickedAfter.target.path}\` : 'Keine';
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
                document.getElementById('most-clicked-after').textContent = mostClickedAfter ? \`\${mostClickedAfter.target.path}\` : 'Keine';
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
                    if (clickedObject.path !== item.target.path || clickedObject.id !== item.target.id || clickedObject.tagName !== item.target.tagName || !matchUrlPattern(heatmapURL, item.url)) {
                        return;
                    }
                    const { clickPosition, resolution, path } = item;

                    drawPath(path, resolution, scrollX, scrollY);
                    
                    const x_click = (clickPosition.x / resolution.width) * heatmapCanvas.width;
                    const y_click = (clickPosition.y / resolution.height) * heatmapCanvas.height;

                    drawClicks(x_click, y_click, scrollX, scrollY);
                });
            }

            async function initHeatmap() {
                heatmapData = await fetchHeatmapData();
            }

            // Main function to initialize the heatmap
            async function updateHeatmap() {
                if (!heatmapData) {
                    return;
                }
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

            //get all elements with the class 'further_information'
            const further_information = document.querySelectorAll('.further_information');
            //hide all elements with the class 'further_information'
            further_information.forEach(info => {
                info.style.display = 'none';
            }
            );
            //get all elements with the class 'card'
            const cards = document.querySelectorAll('.card');
            //add click event listener to each card
            cards.forEach(card => {
                card.addEventListener('click', event => {
                    // if clicked on input in the card return
                    if (event.target.tagName === 'INPUT') {
                        return;
                    }
                    //get all elements inside the card with the class 'further_information'
                    const further_information = card.querySelectorAll('.further_information');
                    //toggle the display of the elements
                    further_information.forEach(info => {
                        if (info.style.display === 'none') {
                            info.style.display = 'block';
                        } else {
                            info.style.display = 'none';
                        }
                    });
                    //get the element with the class 'card_information'
                    const card_information = card.querySelector('.card_information');
                    //toggle the display of the element
                    if (card_information.style.display === 'none') {
                        card_information.style.display = 'block';
                    } else {
                        card_information.style.display = 'none';
                    }
                });
            });

            // event Listener on iframe url change
            iframe.addEventListener('load', () => {
                const iframeWindow = iframe.contentWindow;
                iframeWindow.document.addEventListener('click', event => {
                    const object = getClickedObject(event);
                    if (object) {
                        clickedObject = object;
                        updateInformation(event.target);
                    }
                }, true);
                if (iframeWindow.disableTracking) {
                    iframeWindow.disableTracking();
                }
                if (iframeWindow.addControlledClicking) {
                    iframeWindow.addControlledClicking();
                }
                document.getElementById('iframe_url').value = iframeWindow.location.href.split('?')[0].split('#')[0];
                document.getElementById('iframe_heatmap_url').value = iframeWindow.location.href.split('?')[0].split('#')[0];
                heatmapURL = iframeWindow.location.href.split('?')[0].split('#')[0];
                clearChart();
                countClicksOnElement(heatmapData);
                createBarChart(clicksStatistics);
            });

            document.getElementById('iframe_heatmap_url').addEventListener('change', () => {
                heatmapURL = document.getElementById('iframe_heatmap_url').value;
                clearChart();
                countClicksOnElement(heatmapData);
                createBarChart(clicksStatistics);
            });

            document.getElementById('iframe_url').addEventListener('change', () => {
                iframe.src = document.getElementById('iframe_url').value;
            });

            function clearChart() {
                const container = document.getElementById('chart');
                while (container.firstChild) {
                    container.removeChild(container.firstChild);
                }
            }

            function createBarChart(data) {
                const container = document.getElementById('chart');
                const maxValue = Math.max(...Object.values(data).map(item => item.clicks));
                
                // Sortieren der Daten nach Werten (absteigend)
                sortedData = Object.entries(data).sort((a, b) => b[1].clicks - a[1].clicks);
                
                sortedData.splice(5);
                sortedData.forEach(([key, value]) => {
                    const barContainer = document.createElement('div');
                    barContainer.className = 'bar-container';
                    
                    const bar = document.createElement('div');
                    const label = document.createElement('span');
                    const popup = document.createElement('div');
                    
                    bar.className = 'bar';
                    label.className = 'bar-label';
                    popup.className = 'popup';
                    
                    const percentage = (value.clicks / maxValue) * 100;
                    bar.style.width = \`\${percentage}%\`;
                    
                    label.textContent = key;
                    
                    // Popup Inhalt
                    popup.innerHTML = \`
                        <div class="popup-row">
                            <span class="popup-label">Path:</span>
                            <span class="popup-value">\${value.path}</span>
                        </div>
                        <div class="popup-row">
                            <span class="popup-label">ID:</span>
                            <span class="popup-value">\${value.id}</span>
                        </div>
                        <div>
                            <span class="popup-label">Class:</span>
                            <span class="popup-value">\${value.class}</span>
                        </div>
                        <div class="popup-row">
                            <span class="popup-label">ClicksAmount:</span>
                            <span class="popup-value">\${value.clicks}</span>
                        </div>
                    \`;
                    
                    // Event Listener für Hover
                    bar.addEventListener('mousemove', (e) => {
                        popup.style.display = 'block';
                        
                        // Position des Popups berechnen
                        const rect = bar.getBoundingClientRect();
                        const scrollTop = window.scrollY || document.documentElement.scrollTop;
                        
                        // Popup über dem Balken positionieren
                        popup.style.left = \`\${e.pageX - popup.offsetWidth/2}px\`;
                        popup.style.top = \`\${rect.top + scrollTop - popup.offsetHeight - 10}px\`;
                    });
                    
                    bar.addEventListener('mouseleave', () => {
                        popup.style.display = 'none';
                    });

                    bar.addEventListener('click', () => {
                        clickedObject = {
                            path: value.path,
                            tagName: value.tagName,
                            id: value.id,
                            className: value.class,
                        };
                        const element = iframe.contentWindow.document.querySelector(value.path);
                        updateInformation(element);
                        // scroll to elem
                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    });
                    
                    bar.appendChild(label);
                    barContainer.appendChild(bar);
                    barContainer.appendChild(popup);
                    container.appendChild(barContainer);
                });
            }

            createHighlight();
            initHeatmap();
            setInterval(updateHeatmap, 1);
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
            <div class="header">
                <h1>UIUX Monitoring</h1>
            </div>

            <div class="information_card card">
                <h2>Overview</h2>
                <input type="text" class="further_information text-input-url" id="iframe_url" value="">
                <input type="text" class="further_information text-input-url" id="iframe_heatmap_url" value="">

                <p class="card_information">click on card to get more information</p>
            </div>

            <div class="information_card card">
                <h2>Element Information</h2>
                <p><strong>Path:</strong> <span id="path">-</span></p>
                <p class="further_information"><strong>ID:</strong> <span id="id">-</span></p>
                <p class="further_information"><strong>Class:</strong> <span id="class">-</span></p>
                <p><strong>Clicks:</strong> <span id="clicks">-</span></p>
                <p class="further_information"><strong>Fastest time to click element:</strong> <span id="fastest-time">-</span> s</p>
                <p><strong>Average time to click element:</strong> <span id="average-time">-</span> s</p>
                <p class="further_information"><strong>Slowest time to click element:</strong> <span id="slowest-time">-</span> s</p>
                <p class="further_information"><strong>Most came from:</strong> <span id="most-clicked-before">-</span></p>
                <p class="further_information"><strong>Most go to:</strong> <span id="most-clicked-after">-</span></p>

                <p class="card_information">click on card to get more information</p>
            </div>

            <div class="information_card card">
                <h2>Clicks Statistics</h2>
                <div class="chart-container" id="chart"></div>
            </div>
        </div>
    </div>
</body>
<style>
* {
    font-family: Arial, sans-serif;
    color: #373D55;
}

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
    background: #FFF;
    color: white;
    box-sizing: border-box;
    overflow-y: auto;
    border-left: 0.25em solid #373D55;
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
    font-size: 2em;
    width: 100%;
    text-align: center;
}

h2 {
    font-size: 1.25em;
    margin-top: 0;
    margin-bottom: 1em;
    width: 100%;
    border-bottom: 1px solid #6B6C6C;
}

.card {
    background: #f9f9f9;
    padding: 0.5em;
    margin: 1em;
    border-radius: 0.5em;
    box-shadow: 0 0 1em rgba(0, 0, 0, 0.2);
}

.card_information {
    font-size: 0.5em;
    color: #6B6C6C;
    text-align: right;
    width: 100%;
}
.chart-container {
    font-family: Arial, sans-serif;
    padding: 20px;
    max-width: 800px;
}

.bar {
    height: 30px;
    background-color: #4CAF50;
    margin: 5px 0;
    transition: width 0.3s ease;
    position: relative;
    border-radius: 3px;
}

.bar-label {
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    color: white;
    font-size: 14px;
}

.bar-value {
    position: absolute;
    right: -40px;
    top: 50%;
    transform: translateY(-50%);
    color: #333;
    font-size: 14px;
}

.popup {
    position: absolute;
    background: white;
    border: 1px solid #ccc;
    border-radius: 4px;
    padding: 10px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    display: none;
    z-index: 100;
    min-width: 200px;
    pointer-events: none;
}

.popup-row {
    margin: 5px 0;
    display: flex;
    justify-content: space-between;
}

.popup-label {
    color: #666;
    font-weight: bold;
}

.popup-value {
    color: #333;
}

.bar {
    cursor: pointer;
}


.header {
    width: 100%;
    margin-bottom: 1em;
}

</style>
</html>`;