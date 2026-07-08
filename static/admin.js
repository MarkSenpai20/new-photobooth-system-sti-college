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
let draggedCenterSlotIndex = -1;
let hoverPoint = null;
let hoverCenterSlotIndex = -1;
let activeSlotIndex = -1;

// Drawing mode
let isDrawingMode = false;
let currentDrawingPoints = [];

const POINT_RADIUS = 8;
const CENTER_RADIUS = 10;

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
    isDrawingMode = false;
    currentDrawingPoints = [];
}

function addSlot() {
    const w = canvas.width;
    const h = canvas.height;
    const mw = 300; const mh = 400;
    const cx = w/2; const cy = h/2;
    
    slots.push({
        id: "Slot " + (slots.length + 1),
        shape: 'rect',
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

function toggleDrawMode() {
    isDrawingMode = !isDrawingMode;
    currentDrawingPoints = [];
    document.getElementById('drawModeBtn').style.background = isDrawingMode ? '#e67e22' : '#9b59b6';
    document.getElementById('drawModeBtn').innerText = isDrawingMode ? 'Finish Polygon (Right Click)' : 'Draw Polygon Mask';
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
        panel.innerHTML += '<p>No slots. Click + Add Photo Slot or Draw Polygon Mask.</p>';
        return;
    }
    
    slots.forEach((s, i) => {
        const div = document.createElement('div');
        div.className = 'slot-item';
        if(i === activeSlotIndex) div.style.border = "2px solid #2ecc71";
        
        div.innerHTML = `
            <h4>${s.id}</h4>
            <label>Shape Mask:</label>
            <select onchange="window.updateSlotShape(${i}, this.value)">
                <option value="rect" ${s.shape==='rect'?'selected':''}>Polygon/Rect</option>
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

function getCenter(points) {
    let cx = 0, cy = 0;
    points.forEach(p => { cx += p.x; cy += p.y; });
    return {x: cx / points.length, y: cy / points.length};
}

// Canvas interactions
function initCanvasEvents() {
    canvas.oncontextmenu = (e) => {
        e.preventDefault();
        if(isDrawingMode && currentDrawingPoints.length > 2) {
            slots.push({
                id: "Slot " + (slots.length + 1),
                shape: 'rect',
                points: [...currentDrawingPoints]
            });
            activeSlotIndex = slots.length - 1;
            toggleDrawMode();
            renderSlotPanel();
            renderEditor();
        }
    };

    let dragStartX = 0;
    let dragStartY = 0;

    canvas.onmousedown = e => {
        if(e.button !== 0) return; // Left click only
        const {x, y} = getMousePos(e);
        
        if(isDrawingMode) {
            currentDrawingPoints.push({x, y});
            renderEditor();
            return;
        }

        // Check corner points
        for(let i=slots.length-1; i>=0; i--) {
            for(let p=0; p<slots[i].points.length; p++) {
                const pt = slots[i].points[p];
                if(dist(x, y, pt.x, pt.y) < POINT_RADIUS * 2) {
                    draggedPoint = pt;
                    activeSlotIndex = i;
                    renderSlotPanel();
                    return;
                }
            }
            
            // Check center handle
            const c = getCenter(slots[i].points);
            if(dist(x, y, c.x, c.y) < CENTER_RADIUS * 2) {
                draggedCenterSlotIndex = i;
                activeSlotIndex = i;
                dragStartX = x;
                dragStartY = y;
                renderSlotPanel();
                return;
            }
        }
    };
    
    canvas.onmousemove = e => {
        const {x, y} = getMousePos(e);
        
        if(isDrawingMode) return;

        if(draggedPoint) {
            draggedPoint.x = x;
            draggedPoint.y = y;
            renderEditor();
            return;
        }
        
        if(draggedCenterSlotIndex !== -1) {
            const dx = x - dragStartX;
            const dy = y - dragStartY;
            slots[draggedCenterSlotIndex].points.forEach(p => {
                p.x += dx;
                p.y += dy;
            });
            dragStartX = x;
            dragStartY = y;
            renderEditor();
            return;
        }
        
        // Hover state
        hoverPoint = null;
        hoverCenterSlotIndex = -1;
        for(let i=0; i<slots.length; i++) {
            const s = slots[i];
            for(let pt of s.points) {
                if(dist(x, y, pt.x, pt.y) < POINT_RADIUS * 2) hoverPoint = pt;
            }
            const c = getCenter(s.points);
            if(dist(x, y, c.x, c.y) < CENTER_RADIUS * 2) hoverCenterSlotIndex = i;
        }
        canvas.style.cursor = (hoverPoint || hoverCenterSlotIndex !== -1) ? 'grab' : 'crosshair';
        renderEditor();
    };
    
    canvas.onmouseup = () => { draggedPoint = null; draggedCenterSlotIndex = -1; };
    canvas.onmouseleave = () => { draggedPoint = null; draggedCenterSlotIndex = -1; hoverPoint = null; hoverCenterSlotIndex = -1; renderEditor(); };
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
    
    ctx.globalAlpha = 0.5;
    ctx.drawImage(templateImg, 0, 0);
    ctx.globalAlpha = 1.0;
    
    // Draw slots
    slots.forEach((s, i) => {
        const pts = s.points;
        const isActive = (i === activeSlotIndex);
        
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for(let k=1; k<pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
        ctx.closePath();
        
        ctx.fillStyle = isActive ? 'rgba(46, 204, 113, 0.3)' : 'rgba(52, 152, 219, 0.3)';
        ctx.fill();
        ctx.strokeStyle = isActive ? '#2ecc71' : '#3498db';
        ctx.lineWidth = 4;
        ctx.stroke();
        
        pts.forEach((pt, pi) => {
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, POINT_RADIUS, 0, 2*Math.PI);
            ctx.fillStyle = (pt === hoverPoint || pt === draggedPoint) ? '#e74c3c' : '#fff';
            ctx.fill();
            ctx.stroke();
        });
        
        // Draw Center handle
        const c = getCenter(pts);
        ctx.beginPath();
        ctx.arc(c.x, c.y, CENTER_RADIUS, 0, 2*Math.PI);
        ctx.fillStyle = (i === hoverCenterSlotIndex || i === draggedCenterSlotIndex) ? '#e67e22' : '#f1c40f';
        ctx.fill();
        ctx.stroke();
        
        ctx.fillStyle = '#000';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(i+1, c.x, c.y);
    });

    // Draw active polygon mode
    if(isDrawingMode && currentDrawingPoints.length > 0) {
        ctx.beginPath();
        ctx.moveTo(currentDrawingPoints[0].x, currentDrawingPoints[0].y);
        for(let k=1; k<currentDrawingPoints.length; k++) ctx.lineTo(currentDrawingPoints[k].x, currentDrawingPoints[k].y);
        ctx.strokeStyle = '#9b59b6';
        ctx.lineWidth = 4;
        ctx.stroke();
        
        currentDrawingPoints.forEach(pt => {
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, POINT_RADIUS, 0, 2*Math.PI);
            ctx.fillStyle = '#9b59b6';
            ctx.fill();
        });
    }
}
