let clickedObject = null;
let grid = [];
const gridSize = 5;

// Wait for the DOM to be loaded
document.addEventListener('DOMContentLoaded', () => {
    const iframe = document.querySelector('iframe');
    const heatmapCanvas = document.getElementById('heatmap');
    const heatmapCtx = heatmapCanvas.getContext('2d');

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
            const response = await fetch('../heat-map.json');
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
        // get scroll position of the iframe
        const scrollX = iframe.contentWindow.scrollX;
        const scrollY = iframe.contentWindow.scrollY;

        heatmapCtx.clearRect(0, 0, heatmapCanvas.width, heatmapCanvas.height);
        initGrid(); // Reset the grid for each redraw

        data.forEach(item => {
            if (clickedObject === null) {
                return;
            }
            if (clickedObject.id !== item.target.id || clickedObject.tagName !== item.target.tagName) {
                return;
            }
            const { clickPosition, resolution, path } = item;

            // Draw the path
            drawPath(path, resolution, scrollX, scrollY);
            
            // Calculate the position relative to the current iframe size
            const x_click = (clickPosition.x / resolution.width) * heatmapCanvas.width;
            const y_click = (clickPosition.y / resolution.height) * heatmapCanvas.height;

            drawClicks(x_click, y_click, scrollX, scrollY);
        });
    }

    // Main function to initialize the heatmap
    async function initHeatmap() {
        const heatmapData = await fetchHeatmapData();
        drawHeatmap(heatmapData);
    }

    function getClickedObject(event) {
        const iframeWindow = iframe.contentWindow;
        if (iframeWindow.getClickedObject) {
            return iframeWindow.getClickedObject(event);
        }
    }

    // Add click event listener to the iframe
    iframe.contentWindow.addEventListener('click', event => {
        const object = getClickedObject(event);
        if (object) {
            clickedObject = object;
            console.log('Clicked object:', object);
        }
    });

    disableTracking();
    addControlledClicking();
    setInterval(initHeatmap, 1);
});