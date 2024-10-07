// tracking.js
const socket = io('http://localhost:8000', {
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
  
  function trackClick(event) {
    const currentTime = Date.now();
    const pathDuration = currentTime - lastClickTime;
    
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
      url: window.location.href,
      resolution: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    };
  
    socket.emit('trackData', data);
  
    // Reset for next path
    lastClickTime = currentTime;
    mousePath = [];
  }
  
  document.addEventListener('mousemove', trackMouseMovement);
  document.addEventListener('click', trackClick);
  
  socket.on('connect', () => {
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
        if (event.target !== enabledButton) {
          event.preventDefault();
          enabledButton = event.target;
        }
      });
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