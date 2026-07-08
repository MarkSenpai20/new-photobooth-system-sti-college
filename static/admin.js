// Admin Dashboard Logic
let templates = [];
let currentSettings = {};

// Editor State
let editorActive = false;
let canvas, ctx;
let templateImg = null;
let slots = [];
let activeTemplateName = "";
let draggedPoint = null;
let hoverPoint = null;
let activeSlotIndex = -1;

const POINT_RADIUS = 8;

async function loadData() {
    const tempRes = await fetch('/api/templates');
    const tempData = await tempRes.json();
    templates = tempData.templates;
    
    const select = document.getElementById('templateSelect');
    select.innerHTML = '<option value="">None (White Background)</option>';
    templates.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t; opt.innerText = t;
        select.appendChild(opt);
    });

    const setRes = await fetch('/api/settings');
    currentSettings = await setRes.json();
    if(currentSettings.active_template) select.value = currentSettings.active_template;
    document.getElementById('autoPrint').checked = currentSettings.auto_print || false;
    document.getElementById('copies').value = currentSettings.copies || 2;
}

async function uploadTemplate() {
    const file = document.getElementById('templateFile').files[0];
    if(!file) return alert("Select a file first.");
    const formData = new FormData();
    formData.append('template', file);
    await fetch('/api/templates', {method: 'POST', body: formData});
    alert("Uploaded!");
    loadData();
}

async function saveSettings() {
    const active_template = document.getElementById('templateSelect').value;
    const auto_print = document.getElementById('autoPrint').checked;
    const copies = parseInt(document.getElementById('copies').value);
    await fetch('/api/settings', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({active_template, auto_print, copies})
    });
    alert("Saved!");
}

window.onload = loadData;

// --- VISUAL EDITOR ---

async function openEditor() {
    activeTemplateName = document.getElementById('templateSelect').value;
    if(!activeTemplateName) return alert("Select an active template first!");
    
    document.getElementById('editorModal').classList.add('active');
    editorActive = true;
    
    canvas = document.getElementById('editorCanvas');
    ctx = canvas.getContext('2d');
    
    // Load config
    try {
        const res = await fetch(`/api/templates/${activeTemplateName}/config`);
        if(res.ok) {
            const data = await res.json();
            slots = data.slots || [];
        } else {
            slots = [];
        }
    } catch(e) { slots = []; }

    // Load image
    templateImg = new Image();
    templateImg.onload = () => {
        canvas.width = templateImg.width;
        canvas.height = templateImg.height;
        initCanvasEvents();
        renderEditor();
        renderSlotPanel();
    };
    templateImg.src = `/api/templates/${activeTemplateName}`;
}

function closeEditor() {
    document.getElementById('editorModal').classList.remove('active');
    editorActive = false;
}

function addSlot() {
    const w = canvas.width;
    const h = canvas.height;
    const mw = 300; const mh = 400;
    const cx = w/2; const cy = h/2;
    
    slots.push({
        id: "Slot " + (slots.length + 1),
        shape: 'rect', // rect, circle, star
        // TL, TR, BR, BL
        points: [
            {x: cx - mw/2, y: cy - mh/2},
            {x: cx + mw/2, y: cy - mh/2},
            {x: cx + mw/2, y: cy + mh/2},
            {x: cx - mw/2, y: cy + mh/2}
        ]
    });
    activeSlotIndex = slots.length - 1;
    renderSlotPanel();
    renderEditor();
}

function removeSlot(index) {
    slots.splice(index, 1);
    activeSlotIndex = -1;
    renderSlotPanel();
    renderEditor();
}

function renderSlotPanel() {
    const panel = document.getElementById('slotPanel');
    panel.innerHTML = '<h3>Photo Slots</h3>';
    
    if(slots.length === 0) {
        panel.innerHTML += '<p>No slots. Click + Add Photo Slot.</p>';
        return;
    }
    
    slots.forEach((s, i) => {
        const div = document.createElement('div');
        div.className = 'slot-item';
        if(i === activeSlotIndex) div.style.border = "2px solid #2ecc71";
        
        div.innerHTML = `
            <h4>${s.id}</h4>
            <label>Shape Mask:</label>
            <select onchange="updateSlotShape(${i}, this.value)">
                <option value="rect" ${s.shape==='rect'?'selected':''}>Rectangle (Default)</option>
                <option value="circle" ${s.shape==='circle'?'selected':''}>Circle / Ellipse</option>
                <option value="star" ${s.shape==='star'?'selected':''}>Star</option>
            </select>
            <button onclick="removeSlot(${i})" style="width:100%; margin:0; margin-top:5px; background:#e74c3c;">Delete</button>
        `;
        div.onmousedown = () => { activeSlotIndex = i; renderSlotPanel(); renderEditor(); };
        panel.appendChild(div);
    });
}

window.updateSlotShape = (idx, val) => {
    slots[idx].shape = val;
    renderEditor();
}

async function saveLayout() {
    await fetch(`/api/templates/${activeTemplateName}/config`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({slots})
    });
    alert("Configuration saved!");
    closeEditor();
}

// Canvas interactions
function initCanvasEvents() {
    canvas.onmousedown = e => {
        const {x, y} = getMousePos(e);
        // Find if clicked on a point
        for(let i=slots.length-1; i>=0; i--) {
            for(let p=0; p<4; p++) {
                const pt = slots[i].points[p];
                if(dist(x, y, pt.x, pt.y) < POINT_RADIUS * 2) {
                    draggedPoint = pt;
                    activeSlotIndex = i;
                    renderSlotPanel();
                    return;
                }
            }
        }
    };
    
    canvas.onmousemove = e => {
        const {x, y} = getMousePos(e);
        if(draggedPoint) {
            draggedPoint.x = x;
            draggedPoint.y = y;
            renderEditor();
            return;
        }
        
        // Hover state
        hoverPoint = null;
        for(let s of slots) {
            for(let pt of s.points) {
                if(dist(x, y, pt.x, pt.y) < POINT_RADIUS * 2) {
                    hoverPoint = pt;
                }
            }
        }
        canvas.style.cursor = hoverPoint ? 'grab' : 'crosshair';
        renderEditor();
    };
    
    canvas.onmouseup = () => { draggedPoint = null; };
    canvas.onmouseleave = () => { draggedPoint = null; hoverPoint = null; renderEditor(); };
}

function getMousePos(evt) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
        x: (evt.clientX - rect.left) * scaleX,
        y: (evt.clientY - rect.top) * scaleY
    };
}

function dist(x1,y1,x2,y2) {
    return Math.sqrt((x2-x1)**2 + (y2-y1)**2);
}

function renderEditor() {
    ctx.clearRect(0,0, canvas.width, canvas.height);
    
    // Draw template first (semi transparent so we can see slots behind/infront)
    ctx.globalAlpha = 0.5;
    ctx.drawImage(templateImg, 0, 0);
    ctx.globalAlpha = 1.0;
    
    slots.forEach((s, i) => {
        const pts = s.points;
        const isActive = (i === activeSlotIndex);
        
        // Draw polygon fill
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        ctx.lineTo(pts[1].x, pts[1].y);
        ctx.lineTo(pts[2].x, pts[2].y);
        ctx.lineTo(pts[3].x, pts[3].y);
        ctx.closePath();
        
        ctx.fillStyle = isActive ? 'rgba(46, 204, 113, 0.3)' : 'rgba(52, 152, 219, 0.3)';
        ctx.fill();
        ctx.strokeStyle = isActive ? '#2ecc71' : '#3498db';
        ctx.lineWidth = 4;
        ctx.stroke();
        
        // Draw points
        pts.forEach((pt, pi) => {
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, POINT_RADIUS, 0, 2*Math.PI);
            ctx.fillStyle = (pt === hoverPoint || pt === draggedPoint) ? '#e74c3c' : '#fff';
            ctx.fill();
            ctx.stroke();
            
            // Label corners 1-4 for clarity
            ctx.fillStyle = '#000';
            ctx.font = '12px Arial';
            ctx.fillText(pi+1, pt.x - 4, pt.y + 4);
        });
        
        // Number the slot
        const cx = (pts[0].x + pts[1].x + pts[2].x + pts[3].x)/4;
        const cy = (pts[0].y + pts[1].y + pts[2].y + pts[3].y)/4;
        ctx.fillStyle = isActive ? '#2ecc71' : '#3498db';
        ctx.font = 'bold 40px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(i+1, cx, cy);
    });
}
