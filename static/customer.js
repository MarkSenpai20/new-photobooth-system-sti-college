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

// Slideshow logic
async function loadSlideshow() {
    try {
        const res = await fetch('/api/slideshow');
        const data = await res.json();
        slideshowImages = data.images;
        if(slideshowImages.length > 0) {
            changeSlide();
            setInterval(changeSlide, 4000);
        }
    } catch (e) { console.error(e); }
}

function changeSlide() {
    if(slideshowImages.length === 0) return;
    const bg = document.getElementById('slideshow');
    bg.style.backgroundImage = `url(${slideshowImages[slideIdx]})`;
    slideIdx = (slideIdx + 1) % slideshowImages.length;
}

window.onload = loadSlideshow;

function switchScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

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

async function startCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 1920, height: 1080 } });
        document.getElementById('videoElement').srcObject = stream;
    } catch (err) {
        console.error(err);
        alert("Camera access denied or unavailable.");
    }
}

function stopCamera() {
    if(stream) {
        stream.getTracks().forEach(track => track.stop());
    }
}

function cancelSession() {
    playClick();
    stopCamera();
    sessionId = null;
    document.getElementById('customerName').value = '';
    document.getElementById('slideshow').style.display = 'block';
    switchScreen('screen-welcome');
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

async function loadLibrary() {
    if(!sessionId) return;
    const res = await fetch(`/api/session/${sessionId}/photos`);
    const data = await res.json();
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
        img.onclick = () => { playClick(); generateStrip(t); };
        grid.appendChild(img);
    });
}

async function generateStrip(templateName) {
    document.getElementById('templateSelectionArea').style.display = 'none';
    document.getElementById('generateTitle').style.display = 'block';
    document.getElementById('generateTitle').innerText = "Generating Magic... ✨";
    document.getElementById('generateLoader').style.display = 'block';
    
    const res = await fetch(`/api/session/${sessionId}/generate`, { 
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({template: templateName})
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
    sessionId = null;
    document.getElementById('customerName').value = '';
    document.getElementById('slideshow').style.display = 'block';
    loadSlideshow();
    switchScreen('screen-welcome');
}
