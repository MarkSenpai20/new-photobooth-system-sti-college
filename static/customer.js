let sessionId = null;
let stream = null;
let currentPhoto = null;
let slideshowImages = [];
let slideIdx = 0;

// Slideshow logic for Welcome Screen
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
        document.getElementById('slideshow').style.display = 'none'; // hide bg
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
    
    // Countdown
    overlay.style.display = 'block';
    for(let i=3; i>0; i--) {
        overlay.innerText = i;
        await new Promise(r => setTimeout(r, 1000));
    }
    overlay.innerText = "📸";
    
    // Capture
    const video = document.getElementById('videoElement');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    
    overlay.style.display = 'none';
    
    // Upload
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
        img.onclick = () => openModal(p, img.src);
        lib.appendChild(img);
    });
}

function openModal(filename, src) {
    currentPhoto = filename;
    document.getElementById('modalImg').src = src;
    document.getElementById('photoModal').classList.add('active');
}

function closeModal() {
    document.getElementById('photoModal').classList.remove('active');
    currentPhoto = null;
}

document.getElementById('modalDeleteBtn').onclick = async () => {
    if(!currentPhoto) return;
    await fetch(`/api/session/${sessionId}/photos/${currentPhoto}`, { method: 'DELETE' });
    closeModal();
    loadLibrary();
};

async function finishCapture() {
    stopCamera();
    switchScreen('screen-review');
    document.getElementById('generateLoader').style.display = 'block';
    document.getElementById('finalStrip').style.display = 'none';
    document.getElementById('finishControls').style.display = 'none';
    document.getElementById('generateTitle').innerText = "Generating Magic... ✨";
    
    const res = await fetch(`/api/session/${sessionId}/generate`, { method: 'POST' });
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
    switchScreen('screen-camera');
    startCamera();
}

function completeSession() {
    sessionId = null;
    document.getElementById('customerName').value = '';
    document.getElementById('slideshow').style.display = 'block';
    loadSlideshow(); // refresh slideshow to include new strip
    switchScreen('screen-welcome');
}
