let sessionId = null;
let stream = null;
let currentPhoto = null;
let slideshowImages = [];
let slideIdx = 0;

// SFX Engine
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playClick() {
    if(audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.1);
}

function playShutter() {
    if(audioCtx.state === 'suspended') audioCtx.resume();
    const bufferSize = audioCtx.sampleRate * 0.1;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    const noiseFilter = audioCtx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = 1000;
    const noiseGain = audioCtx.createGain();
    noiseGain.gain.setValueAtTime(1, audioCtx.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(audioCtx.destination);
    noise.start();
    
    const osc = audioCtx.createOscillator();
    const oscGain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(100, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.05);
    oscGain.gain.setValueAtTime(0.5, audioCtx.currentTime);
    oscGain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);
    osc.connect(oscGain);
    oscGain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.05);
}

let gridCells = [];
let slideshowInterval = null;

// Slideshow logic
async function loadSlideshow() {
    try {
        const res = await fetch('/api/slideshow');
        const data = await res.json();
        slideshowImages = data.images;
        if(slideshowImages.length > 0) {
            initGridSlideshow();
        }
    } catch (e) { console.error(e); }
}

function initGridSlideshow() {
    const bg = document.getElementById('slideshow');
    bg.innerHTML = ''; // Clear existing
    bg.style.backgroundImage = 'none'; // Remove old logic
    
    // Create roughly enough cells to fill a 1920x1080 screen (e.g. 8x5 = 40)
    const numCells = 40; 
    gridCells = [];
    
    for(let i=0; i<numCells; i++) {
        const img = document.createElement('img');
        img.src = slideshowImages[Math.floor(Math.random() * slideshowImages.length)];
        bg.appendChild(img);
        gridCells.push(img);
    }
    
    if (slideshowInterval) clearInterval(slideshowInterval);
    
    slideshowInterval = setInterval(() => {
        if(slideshowImages.length === 0 || gridCells.length === 0) return;
        
        // Pick 2 random cells to change at a time to make it feel alive
        for(let i=0; i<2; i++) {
            const randomCellIndex = Math.floor(Math.random() * gridCells.length);
            const randomImage = slideshowImages[Math.floor(Math.random() * slideshowImages.length)];
            const cell = gridCells[randomCellIndex];
            
            // Fade out
            cell.style.opacity = 0;
            setTimeout(() => {
                cell.src = randomImage;
                // Fade in
                cell.style.opacity = 1;
            }, 500); 
        }
    }, 2000);
}

window.onload = loadSlideshow;

function switchScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

// Design State
let currentBgColor = '#ffffff';
let currentShape = 'rectangle';
let overlays = []; // { id, type: 'sticker'|'text', content, x, y, width, height, color, font }
let overlayCounter = 0;

async function startSession() {
    playClick();
    const name = document.getElementById('customerName').value;
    if(!name) return alert("Please enter a name!");
    
    const res = await fetch('/api/session/start', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({name})
    });
    const data = await res.json();
    if(data.success) {
        sessionId = data.session_id;
        document.getElementById('slideshow').style.display = 'none';
        switchScreen('screen-camera');
        startCamera();
        loadLibrary();
    }
}

let currentFacingMode = 'user';

async function startCamera() {
    try {
        if(stream) {
            stream.getTracks().forEach(track => track.stop());
        }
        stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                facingMode: currentFacingMode, 
                width: { ideal: 1920 }, 
                height: { ideal: 1080 } 
            } 
        });
        document.getElementById('videoElement').srcObject = stream;
    } catch (err) {
        console.error(err);
        alert("Camera access denied or unavailable.");
    }
}

function flipCamera() {
    playClick();
    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    startCamera();
}

function stopCamera() {
    if(stream) {
        stream.getTracks().forEach(track => track.stop());
    }
}

function cancelSession() {
    playClick();
    setTimeout(() => {
        window.location.reload();
    }, 100);
}

async function takePhoto() {
    const btn = document.getElementById('captureBtn');
    const overlay = document.getElementById('countdownOverlay');
    btn.disabled = true;
    playClick();
    
    // Countdown
    overlay.style.display = 'block';
    for(let i=3; i>0; i--) {
        overlay.innerText = i;
        playClick();
        await new Promise(r => setTimeout(r, 1000));
    }
    overlay.innerText = "📸";
    playShutter();
    
    // Capture
    const video = document.getElementById('videoElement');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    
    overlay.style.display = 'none';
    
    canvas.toBlob(async (blob) => {
        const formData = new FormData();
        formData.append('photo', blob, 'capture.jpg');
        await fetch(`/api/session/${sessionId}/capture`, { method: 'POST', body: formData });
        btn.disabled = false;
        loadLibrary();
    }, 'image/jpeg', 0.95);
}

let libraryPhotos = [];

async function loadLibrary() {
    if(!sessionId) return;
    const res = await fetch(`/api/session/${sessionId}/photos`);
    const data = await res.json();
    libraryPhotos = data.photos;
    const lib = document.getElementById('photoLibrary');
    lib.innerHTML = '';
    data.photos.forEach(p => {
        const img = document.createElement('img');
        img.src = `/api/session/${sessionId}/photos/${p}?t=${Date.now()}`;
        img.onclick = () => { playClick(); openModal(p, img.src); };
        lib.appendChild(img);
    });
}

function openModal(filename, src) {
    currentPhoto = filename;
    document.getElementById('modalImg').src = src;
    document.getElementById('photoModal').classList.add('active');
}

function closeModal() {
    playClick();
    document.getElementById('photoModal').classList.remove('active');
    currentPhoto = null;
}

document.getElementById('modalDeleteBtn').onclick = async () => {
    playClick();
    if(!currentPhoto) return;
    await fetch(`/api/session/${sessionId}/photos/${currentPhoto}`, { method: 'DELETE' });
    closeModal();
    loadLibrary();
};

async function finishCapture() {
    playClick();
    stopCamera();
    switchScreen('screen-review');
    
    document.getElementById('templateSelectionArea').style.display = 'block';
    document.getElementById('generateTitle').style.display = 'none';
    document.getElementById('generateLoader').style.display = 'none';
    document.getElementById('finalStrip').style.display = 'none';
    document.getElementById('finishControls').style.display = 'none';
    
    const res = await fetch('/api/templates');
    const data = await res.json();
    const grid = document.getElementById('templateGrid');
    grid.innerHTML = '';
    data.templates.forEach(t => {
        const img = document.createElement('img');
        img.src = `/api/templates/${t}`;
        img.style.width = '120px';
        img.style.border = '4px solid var(--border-pink)';
        img.style.borderRadius = '8px';
        img.style.cursor = 'pointer';
        img.onclick = () => { playClick(); selectTemplate(t); };
        grid.appendChild(img);
    });
}

let selectedTemplateName = "";
let arrangementSlots = [];
let maxSlots = 0;

async function selectTemplate(tName) {
    selectedTemplateName = tName;
    document.getElementById('templateSelectionArea').style.display = 'none';
    
    try {
        const res = await fetch(`/api/templates/${tName}/config`);
        const data = await res.json();
        maxSlots = data.slots ? data.slots.length : 1;
    } catch(e) {
        maxSlots = 1;
    }

    if (maxSlots === 0) maxSlots = 1;

    if (libraryPhotos.length === 1) {
        arrangementSlots = new Array(maxSlots).fill(libraryPhotos[0]);
        generateFromArrangement();
        return;
    }

    arrangementSlots = new Array(maxSlots).fill(null);
    document.getElementById('arrangementArea').style.display = 'block';
    renderArrangementUI();
}

function renderArrangementUI() {
    const slotsContainer = document.getElementById('arrangementSlots');
    slotsContainer.innerHTML = '';
    
    arrangementSlots.forEach((photoName, idx) => {
        const box = document.createElement('div');
        box.style.width = '100px';
        box.style.height = '100px';
        box.style.border = '2px dashed #999';
        box.style.borderRadius = '8px';
        box.style.display = 'flex';
        box.style.alignItems = 'center';
        box.style.justifyContent = 'center';
        box.style.background = '#eee';
        box.style.cursor = 'pointer';
        box.style.overflow = 'hidden';
        
        box.draggable = true;
        box.ondragstart = (e) => { e.dataTransfer.setData('text/plain', idx); };
        box.ondragover = (e) => { e.preventDefault(); };
        box.ondrop = (e) => {
            e.preventDefault();
            const fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
            const temp = arrangementSlots[fromIdx];
            arrangementSlots[fromIdx] = arrangementSlots[idx];
            arrangementSlots[idx] = temp;
            playClick();
            renderArrangementUI();
        };

        if (photoName) {
            const img = document.createElement('img');
            img.src = `/api/session/${sessionId}/photos/${photoName}?t=${Date.now()}`;
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'cover';
            box.appendChild(img);
            box.onclick = () => {
                playClick();
                arrangementSlots[idx] = null;
                renderArrangementUI();
            };
        } else {
            box.innerText = `Slot ${idx+1}`;
        }
        slotsContainer.appendChild(box);
    });

    const libContainer = document.getElementById('arrangementLibrary');
    libContainer.innerHTML = '';
    libraryPhotos.forEach(p => {
        const img = document.createElement('img');
        img.src = `/api/session/${sessionId}/photos/${p}?t=${Date.now()}`;
        img.style.width = '80px';
        img.style.height = '80px';
        img.style.objectFit = 'cover';
        img.style.cursor = 'pointer';
        img.style.borderRadius = '4px';
        img.onclick = () => {
            playClick();
            const emptyIdx = arrangementSlots.indexOf(null);
            if (emptyIdx !== -1) {
                arrangementSlots[emptyIdx] = p;
                renderArrangementUI();
            }
        };
        libContainer.appendChild(img);
    });

    const btn = document.getElementById('generateArrangementBtn');
    btn.disabled = arrangementSlots.includes(null);
}

function backToTemplateSelection() {
    playClick();
    document.getElementById('arrangementArea').style.display = 'none';
    document.getElementById('templateSelectionArea').style.display = 'block';
}

function setBgColor(hex) {
    currentBgColor = hex;
    document.getElementById('designCanvasWrapper').style.backgroundColor = hex;
}

async function setPhotoShape(shape) {
    playClick();
    currentShape = shape;
    // Re-generate preview with new shape
    await generatePreview();
}

function backToArrangementFromDesign() {
    playClick();
    switchScreen('screen-review');
    document.getElementById('arrangementArea').style.display = 'block';
}

function switchDesignTab(tabId) {
    playClick();
    document.querySelectorAll('.design-tab').forEach(t => t.style.display = 'none');
    document.getElementById(tabId).style.display = 'block';
}

async function generatePreview() {
    document.getElementById('generateTitle').style.display = 'block';
    document.getElementById('generateTitle').innerText = "Loading Canvas... 🎨";
    document.getElementById('generateLoader').style.display = 'block';
    switchScreen('screen-result');

    const isPlain = selectedTemplateName.startsWith('plain_');
    const res = await fetch(`/api/session/${sessionId}/generate_preview`, { 
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            template: selectedTemplateName,
            selected_photos: arrangementSlots,
            shape: currentShape,
            bg_color: isPlain ? "transparent" : "#ffffff"
        })
    });
    const data = await res.json();
    
    if(data.success) {
        document.getElementById('generateLoader').style.display = 'none';
        document.getElementById('generateTitle').style.display = 'none';
        
        document.getElementById('designPreviewImg').src = data.preview_url + "?t=" + Date.now();
        switchScreen('screen-design');
    } else {
        alert("Error: " + data.error);
        backToCamera();
    }
}

async function goToDesign() {
    playClick();
    document.getElementById('arrangementArea').style.display = 'none';
    
    // Check if Premade or Plain
    const isPlain = selectedTemplateName.startsWith('plain_');
    if (isPlain) {
        document.getElementById('bgToolsContainer').style.display = 'block';
        document.getElementById('premadeNotice').style.display = 'none';
    } else {
        document.getElementById('bgToolsContainer').style.display = 'none';
        document.getElementById('premadeNotice').style.display = 'block';
    }

    // reset design state
    overlays = [];
    document.getElementById('stickerLayer').innerHTML = '';
    setBgColor('#ffffff');
    currentShape = 'rectangle';
    renderLayersList();
    switchDesignTab('tab-bg');
    
    await generatePreview();
    loadStickers();
}

async function loadStickers() {
    const drawer = document.getElementById('stickerDrawer');
    if (drawer.children.length > 0) return; // already loaded
    try {
        const res = await fetch('/api/stickers');
        const data = await res.json();
        data.stickers.forEach(s => {
            const img = document.createElement('img');
            img.src = `/api/stickers/${s}`;
            img.className = 'sticker-item';
            img.onclick = () => { playClick(); addStickerToCanvas(s); };
            drawer.appendChild(img);
        });
    } catch(e) { console.error(e); }
}

function addStickerToCanvas(stickerFilename) {
    const layer = document.getElementById('stickerLayer');
    const img = document.createElement('img');
    img.src = `/api/stickers/${stickerFilename}`;
    img.className = 'canvas-sticker';
    
    const id = 'overlay_' + overlayCounter++;
    img.id = id;
    
    // Default size and center position
    img.style.width = '100px';
    img.style.left = '50%';
    img.style.top = '50%';
    img.style.transform = 'translate(-50%, -50%)';
    
    overlays.push({ id, type: 'sticker', content: stickerFilename, element: img });
    renderLayersList();
    makeDraggable(img);
    
    layer.appendChild(img);
}

function addTextToCanvas() {
    playClick();
    const text = document.getElementById('textOverlayInput').value.trim();
    if (!text) return;
    const color = document.getElementById('textOverlayColor').value;
    const font = document.getElementById('textOverlayFont').value;
    
    const layer = document.getElementById('stickerLayer');
    const div = document.createElement('div');
    div.className = 'canvas-sticker';
    
    const id = 'overlay_' + overlayCounter++;
    div.id = id;
    
    div.innerText = text;
    div.style.color = color;
    div.style.fontFamily = `"${font}", sans-serif`;
    div.style.fontSize = '40px'; // base visual size
    div.style.fontWeight = 'bold';
    div.style.whiteSpace = 'nowrap';
    
    div.style.left = '50%';
    div.style.top = '50%';
    div.style.transform = 'translate(-50%, -50%)';
    
    overlays.push({ id, type: 'text', content: text, color, font, element: div });
    renderLayersList();
    makeDraggable(div);
    
    layer.appendChild(div);
    document.getElementById('textOverlayInput').value = ''; // clear input
}

function renderLayersList() {
    const list = document.getElementById('layersList');
    list.innerHTML = '';
    // Reverse so top layer is at the top of the list
    [...overlays].reverse().forEach((overlay, idx) => {
        const item = document.createElement('div');
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';
        item.style.background = '#f9f9f9';
        item.style.padding = '10px';
        item.style.borderRadius = '8px';
        item.style.border = '1px solid #ddd';
        
        const name = document.createElement('span');
        name.innerText = overlay.type === 'sticker' ? `Sticker: ${overlay.content}` : `Text: "${overlay.content}"`;
        name.style.flex = '1';
        name.style.overflow = 'hidden';
        name.style.textOverflow = 'ellipsis';
        name.style.whiteSpace = 'nowrap';
        
        const controls = document.createElement('div');
        controls.style.display = 'flex';
        controls.style.gap = '5px';
        
        const upBtn = document.createElement('button');
        upBtn.innerText = '↑';
        upBtn.style.padding = '5px';
        upBtn.style.margin = '0';
        upBtn.onclick = () => moveLayerUp(overlay.id);
        
        const downBtn = document.createElement('button');
        downBtn.innerText = '↓';
        downBtn.style.padding = '5px';
        downBtn.style.margin = '0';
        downBtn.onclick = () => moveLayerDown(overlay.id);
        
        const delBtn = document.createElement('button');
        delBtn.innerText = '🗑️';
        delBtn.style.padding = '5px';
        delBtn.style.margin = '0';
        delBtn.style.background = '#ffb3c6';
        delBtn.onclick = () => deleteLayer(overlay.id);
        
        controls.appendChild(upBtn);
        controls.appendChild(downBtn);
        controls.appendChild(delBtn);
        
        item.appendChild(name);
        item.appendChild(controls);
        list.appendChild(item);
    });
}

function moveLayerUp(id) {
    playClick();
    const idx = overlays.findIndex(o => o.id === id);
    if (idx < overlays.length - 1) {
        const temp = overlays[idx];
        overlays[idx] = overlays[idx + 1];
        overlays[idx + 1] = temp;
        reorderDOM();
        renderLayersList();
    }
}

function moveLayerDown(id) {
    playClick();
    const idx = overlays.findIndex(o => o.id === id);
    if (idx > 0) {
        const temp = overlays[idx];
        overlays[idx] = overlays[idx - 1];
        overlays[idx - 1] = temp;
        reorderDOM();
        renderLayersList();
    }
}

function deleteLayer(id) {
    playClick();
    overlays = overlays.filter(o => o.id !== id);
    const el = document.getElementById(id);
    if(el) el.remove();
    renderLayersList();
}

function reorderDOM() {
    const layer = document.getElementById('stickerLayer');
    overlays.forEach(o => {
        if(o.element) layer.appendChild(o.element);
    });
}

function makeDraggable(el) {
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;
    const layer = document.getElementById('stickerLayer');
    
    el.onmousedown = (e) => {
        e.preventDefault();
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        
        // bring to front logically and visually
        const idx = overlays.findIndex(o => o.id === el.id);
        if (idx !== -1 && idx < overlays.length - 1) {
            const item = overlays.splice(idx, 1)[0];
            overlays.push(item);
            reorderDOM();
            renderLayersList();
        }
        
        const rect = el.getBoundingClientRect();
        const layerRect = layer.getBoundingClientRect();
        el.style.left = (rect.left - layerRect.left + rect.width/2) + 'px';
        el.style.top = (rect.top - layerRect.top + rect.height/2) + 'px';
        
        initialLeft = parseFloat(el.style.left);
        initialTop = parseFloat(el.style.top);
        
        document.onmousemove = (ev) => {
            if (!isDragging) return;
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            el.style.left = (initialLeft + dx) + 'px';
            el.style.top = (initialTop + dy) + 'px';
        };
        
        document.onmouseup = () => {
            isDragging = false;
            document.onmousemove = null;
            document.onmouseup = null;
        };
    };
}

async function finishDesign() {
    playClick();
    
    // Collect stickers BEFORE switching screens, otherwise getBoundingClientRect() returns 0!
    const layer = document.getElementById('stickerLayer');
    const previewImg = document.getElementById('designPreviewImg');
    
    // If the image hasn't loaded fully, naturalWidth could be 0, but by this point it should be loaded.
    const scaleX = previewImg.naturalWidth / previewImg.width;
    const scaleY = previewImg.naturalHeight / previewImg.height;
    
    const finalOverlays = [];
    overlays.forEach(o => {
        const el = o.element;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const layerRect = layer.getBoundingClientRect();
        
        const cxVisual = (rect.left - layerRect.left) + (rect.width / 2);
        const cyVisual = (rect.top - layerRect.top) + (rect.height / 2);
        
        finalOverlays.push({
            type: o.type,
            content: o.content,
            color: o.color,
            font: o.font,
            cx: cxVisual * scaleX,
            cy: cyVisual * scaleY,
            width: rect.width * scaleX,
            height: rect.height * scaleY,
            rotation: 0 
        });
    });

    switchScreen('screen-result');
    document.getElementById('generateTitle').style.display = 'block';
    document.getElementById('generateTitle').innerText = "Generating Magic... ✨";
    document.getElementById('generateLoader').style.display = 'block';
    document.getElementById('finishControls').style.display = 'none';
    document.getElementById('finalStrip').style.display = 'none';
    
    
    const res = await fetch(`/api/session/${sessionId}/generate`, { 
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            template: selectedTemplateName,
            selected_photos: arrangementSlots,
            bg_color: currentBgColor,
            shape: currentShape,
            overlays: finalOverlays
        })
    });
    const data = await res.json();
    
    if(data.success) {
        document.getElementById('generateLoader').style.display = 'none';
        document.getElementById('finalStrip').src = data.strip_url;
        document.getElementById('finalStrip').style.display = 'block';
        document.getElementById('finishControls').style.display = 'block';
        document.getElementById('generateTitle').innerText = "Here's your photostrip! 📸";
    } else {
        alert("Error: " + data.error);
        backToCamera();
    }
}

function backToCamera() {
    playClick();
    switchScreen('screen-camera');
    startCamera();
}

function completeSession() {
    playClick();
    setTimeout(() => {
        window.location.reload();
    }, 100); // Give the click sound a tiny moment to play before reload
}
