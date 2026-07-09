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

function updatePlainPreview() {
    const w = parseInt(document.getElementById('plainWidth').value) || 600;
    const h = parseInt(document.getElementById('plainHeight').value) || 1800;
    const box = document.getElementById('plainPreviewBox');
    
    // Max constraints for the preview box container is 200x200
    // We scale the width/height to fit inside 180x180 so it has some breathing room
    let scale = 1;
    if (w > h) {
        scale = 160 / w;
    } else {
        scale = 160 / h;
    }
    
    box.style.width = Math.max((w * scale), 20) + 'px';
    box.style.height = Math.max((h * scale), 20) + 'px';
}

async function createPlainTemplate() {
    const name = document.getElementById('plainName').value;
    const width = document.getElementById('plainWidth').value;
    const height = document.getElementById('plainHeight').value;
    
    if(!name) return alert("Please enter a name for the plain template.");
    
    const res = await fetch('/api/templates/create_plain', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ name, width, height })
    });
    
    if(res.ok) {
        alert("Plain Template Created!");
        loadData();
    } else {
        alert("Failed to create template.");
    }
}

window.onload = () => {
    loadData();
    updatePlainPreview(); // Initialize preview box
};

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
    if (isDrawingMode) {
        if (currentDrawingPoints.length > 2) {
            slots.push({
                id: "Slot " + (slots.length + 1),
                shape: 'rect',
                points: [...currentDrawingPoints]
            });
            activeSlotIndex = slots.length - 1;
            renderSlotPanel();
        }
        isDrawingMode = false;
        currentDrawingPoints = [];
    } else {
        isDrawingMode = true;
        currentDrawingPoints = [];
        activeSlotIndex = -1;
        renderSlotPanel();
    }
    
    document.getElementById('drawModeBtn').style.background = isDrawingMode ? '#e67e22' : '#9b59b6';
    document.getElementById('drawModeBtn').innerText = isDrawingMode ? 'Finish Polygon' : 'Draw Polygon Mask';
    renderEditor();
}

function removeSlot(index) {
    slots.splice(index, 1);
    activeSlotIndex = -1;
    renderSlotPanel();
    renderEditor();
}

function duplicateSlot(index) {
    const s = slots[index];
    const newPoints = s.points.map(p => ({ x: p.x + 20, y: p.y + 20 }));
    slots.push({
        id: "Slot " + (slots.length + 1),
        shape: s.shape,
        points: newPoints
    });
    activeSlotIndex = slots.length - 1;
    renderSlotPanel();
    renderEditor();
}

window.duplicateSlot = duplicateSlot;

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
            <div style="display: flex; gap: 5px; margin-top: 5px;">
                <button onclick="duplicateSlot(${i})" style="flex: 1; margin: 0; background: #3498db;">Duplicate</button>
                <button onclick="removeSlot(${i})" style="flex: 1; margin: 0; background: #e74c3c;">Delete</button>
            </div>
        `;
        div.onclick = (e) => { 
            if(e.target.tagName !== 'BUTTON' && e.target.tagName !== 'SELECT') {
                activeSlotIndex = i; 
                renderSlotPanel(); 
                renderEditor(); 
            }
        };
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
        if(isDrawingMode) {
            toggleDrawMode();
        }
    };

    let dragStartMidX = 0;
    let dragStartMidY = 0;

    canvas.onmousedown = e => {
        if(e.button !== 0) return; // Left click only
        const {x, y} = getMousePos(e);
        
        if(isDrawingMode) {
            currentDrawingPoints.push({x, y});
            renderEditor();
            return;
        }

        // Check corner points first
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
        }
            
        // Check center handles
        for(let i=slots.length-1; i>=0; i--) {
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

        // Check edge midpoints (only for 4-point rects)
        for(let i=slots.length-1; i>=0; i--) {
            const pts = slots[i].points;
            if(pts.length === 4) {
                for(let j=0; j<4; j++) {
                    const p1 = pts[j];
                    const p2 = pts[(j+1)%4];
                    const mx = (p1.x + p2.x) / 2;
                    const my = (p1.y + p2.y) / 2;
                    if(dist(x, y, mx, my) < POINT_RADIUS * 2) {
                        draggedMidpointSlot = i;
                        draggedMidpointEdge = j; // 0=Top, 1=Right, 2=Bottom, 3=Left
                        activeSlotIndex = i;
                        dragStartMidX = x;
                        dragStartMidY = y;
                        renderSlotPanel();
                        return;
                    }
                }
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

        if(draggedMidpointSlot !== -1) {
            const dx = x - dragStartMidX;
            const dy = y - dragStartMidY;
            const pts = slots[draggedMidpointSlot].points;
            const j = draggedMidpointEdge; // 0=Top, 1=Right, 2=Bottom, 3=Left
            
            if (j === 0) { // Top edge -> change Y of TL (0) and TR (1)
                pts[0].y += dy; pts[1].y += dy;
            } else if (j === 1) { // Right edge -> change X of TR (1) and BR (2)
                pts[1].x += dx; pts[2].x += dx;
            } else if (j === 2) { // Bottom edge -> change Y of BR (2) and BL (3)
                pts[2].y += dy; pts[3].y += dy;
            } else if (j === 3) { // Left edge -> change X of BL (3) and TL (0)
                pts[3].x += dx; pts[0].x += dx;
            }
            
            dragStartMidX = x;
            dragStartMidY = y;
            renderEditor();
            return;
        }
        
        // Hover state
        hoverPoint = null;
        hoverCenterSlotIndex = -1;
        hoverMidpointIndex = -1;
        for(let i=0; i<slots.length; i++) {
            const s = slots[i];
            const c = getCenter(s.points);
            if(dist(x, y, c.x, c.y) < CENTER_RADIUS * 2) hoverCenterSlotIndex = i;
            
            if(s.points.length === 4) {
                for(let j=0; j<4; j++) {
                    const mx = (s.points[j].x + s.points[(j+1)%4].x) / 2;
                    const my = (s.points[j].y + s.points[(j+1)%4].y) / 2;
                    if(dist(x, y, mx, my) < POINT_RADIUS * 2) {
                        hoverMidpointIndex = j;
                        hoverCenterSlotIndex = -1;
                    }
                }
            }

            for(let pt of s.points) {
                if(dist(x, y, pt.x, pt.y) < POINT_RADIUS * 2) {
                    hoverPoint = pt;
                    hoverCenterSlotIndex = -1;
                    hoverMidpointIndex = -1;
                }
            }
        }
        canvas.style.cursor = (hoverPoint || hoverCenterSlotIndex !== -1 || hoverMidpointIndex !== -1) ? 'grab' : 'crosshair';
        renderEditor();
    };
    
    canvas.onmouseup = () => { draggedPoint = null; draggedCenterSlotIndex = -1; draggedMidpointSlot = -1; };
    canvas.onmouseleave = () => { draggedPoint = null; draggedCenterSlotIndex = -1; draggedMidpointSlot = -1; hoverPoint = null; hoverCenterSlotIndex = -1; hoverMidpointIndex = -1; renderEditor(); };

    // Keyboard nudge
    document.addEventListener('keydown', e => {
        if(!editorActive || activeSlotIndex === -1 || isDrawingMode) return;
        const step = e.shiftKey ? 10 : 1;
        let dx = 0, dy = 0;
        if(e.key === 'ArrowUp') dy = -step;
        if(e.key === 'ArrowDown') dy = step;
        if(e.key === 'ArrowLeft') dx = -step;
        if(e.key === 'ArrowRight') dx = step;
        
        if(dx !== 0 || dy !== 0) {
            e.preventDefault();
            slots[activeSlotIndex].points.forEach(p => { p.x += dx; p.y += dy; });
            renderEditor();
        }
    });
}

function nudgeActiveSlot(dx, dy) {
    if(activeSlotIndex === -1) return;
    slots[activeSlotIndex].points.forEach(p => { p.x += dx; p.y += dy; });
    renderEditor();
}

window.nudgeActiveSlot = nudgeActiveSlot;

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
        if(s.shape === 'circle' && pts.length === 4) {
            let min_x = Math.min(pts[0].x, pts[1].x, pts[2].x, pts[3].x);
            let max_x = Math.max(pts[0].x, pts[1].x, pts[2].x, pts[3].x);
            let min_y = Math.min(pts[0].y, pts[1].y, pts[2].y, pts[3].y);
            let max_y = Math.max(pts[0].y, pts[1].y, pts[2].y, pts[3].y);
            let cx = (min_x + max_x) / 2;
            let cy = (min_y + max_y) / 2;
            let rx = (max_x - min_x) / 2;
            let ry = (max_y - min_y) / 2;
            ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
        } else if(s.shape === 'star' && pts.length === 4) {
            let min_x = Math.min(pts[0].x, pts[1].x, pts[2].x, pts[3].x);
            let max_x = Math.max(pts[0].x, pts[1].x, pts[2].x, pts[3].x);
            let min_y = Math.min(pts[0].y, pts[1].y, pts[2].y, pts[3].y);
            let max_y = Math.max(pts[0].y, pts[1].y, pts[2].y, pts[3].y);
            let cx = (min_x + max_x) / 2;
            let cy = (min_y + max_y) / 2;
            let tw = max_x - min_x, th = max_y - min_y;
            let r_out = Math.min(tw, th) / 2;
            let r_in = r_out * 0.4;
            for (let j = 0; j < 10; j++) {
                let r = (j % 2 === 0) ? r_out : r_in;
                let angle = Math.PI/2 - j * (Math.PI/5);
                let px = cx + r * Math.cos(angle);
                let py = cy - r * Math.sin(angle);
                if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
        } else {
            ctx.moveTo(pts[0].x, pts[0].y);
            for(let k=1; k<pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
        }
        ctx.closePath();
        
        ctx.fillStyle = isActive ? 'rgba(46, 204, 113, 0.3)' : 'rgba(52, 152, 219, 0.3)';
        ctx.fill();
        ctx.strokeStyle = isActive ? '#2ecc71' : '#3498db';
        ctx.lineWidth = 4;
        ctx.stroke();

        // Always draw the perspective bounding box faintly if it's not a rect
        if(s.shape !== 'rect' && pts.length === 4) {
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for(let k=1; k<pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
            ctx.closePath();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        
        pts.forEach((pt, pi) => {
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, POINT_RADIUS, 0, 2*Math.PI);
            ctx.fillStyle = (pt === hoverPoint || pt === draggedPoint) ? '#e74c3c' : '#fff';
            ctx.fill();
            ctx.stroke();
        });

        if(pts.length === 4) {
            for(let j=0; j<4; j++) {
                const mx = (pts[j].x + pts[(j+1)%4].x) / 2;
                const my = (pts[j].y + pts[(j+1)%4].y) / 2;
                ctx.beginPath();
                ctx.rect(mx - 6, my - 6, 12, 12);
                ctx.fillStyle = (isActive) ? '#3498db' : '#95a5a6';
                ctx.fill();
                ctx.stroke();
            }
        }
        
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
