import os
import json
import uuid
import glob
import time
from flask import Flask, render_template, request, jsonify, send_file, send_from_directory
from werkzeug.utils import secure_filename
from image_processor import create_photostrip, create_a4_layout

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['OUTPUT_FOLDER'] = 'outputs'
app.config['TEMPLATE_FOLDER'] = 'assets/templates'
app.config['STICKER_FOLDER'] = 'assets/stickers'
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024 # 50MB max

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['OUTPUT_FOLDER'], exist_ok=True)
os.makedirs(app.config['TEMPLATE_FOLDER'], exist_ok=True)
os.makedirs(app.config['STICKER_FOLDER'], exist_ok=True)

SETTINGS_FILE = 'settings.json'

def load_settings():
    if os.path.exists(SETTINGS_FILE):
        with open(SETTINGS_FILE, 'r') as f:
            return json.load(f)
    return {"active_template": None, "auto_print": False, "copies": 2}

def save_settings(settings):
    with open(SETTINGS_FILE, 'w') as f:
        json.dump(settings, f)

@app.route('/')
def customer():
    return render_template('customer.html')

@app.route('/admin')
def admin():
    return render_template('admin.html')

@app.route('/api/settings', methods=['GET', 'POST'])
def api_settings():
    if request.method == 'POST':
        settings = load_settings()
        data = request.json
        if 'active_template' in data: settings['active_template'] = data['active_template']
        if 'auto_print' in data: settings['auto_print'] = data['auto_print']
        if 'copies' in data: settings['copies'] = data['copies']
        save_settings(settings)
        return jsonify({"success": True, "settings": settings})
    return jsonify(load_settings())

@app.route('/api/templates', methods=['GET', 'POST'])
def api_templates():
    if request.method == 'POST':
        if 'template' not in request.files: return jsonify({"error": "No file"}), 400
        file = request.files['template']
        filename = secure_filename(file.filename)
        file.save(os.path.join(app.config['TEMPLATE_FOLDER'], filename))
        return jsonify({"success": True, "filename": filename})
        
    templates = [f for f in os.listdir(app.config['TEMPLATE_FOLDER']) if f.endswith('.png')]
    return jsonify({"templates": templates})

@app.route('/api/templates/create_plain', methods=['POST'])
def create_plain_template():
    data = request.json
    name = data.get('name', 'untitled').strip()
    width = int(data.get('width', 600))
    height = int(data.get('height', 1800))
    
    # Sanitize name
    safe_name = "".join([c for c in name if c.isalpha() or c.isdigit() or c in ('-', '_')]).rstrip()
    if not safe_name: safe_name = "untitled"
    
    # Force prefix
    if not safe_name.startswith('plain_'):
        safe_name = f"plain_{safe_name}"
        
    filename = f"{safe_name}.png"
    filepath = os.path.join(app.config['TEMPLATE_FOLDER'], filename)
    
    from PIL import Image
    # Create completely transparent PNG
    img = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    img.save(filepath, "PNG")
    
    return jsonify({"success": True, "filename": filename})

@app.route('/api/templates/<filename>')
def get_template(filename):
    filepath = os.path.join(app.config['TEMPLATE_FOLDER'], filename)
    if not os.path.exists(filepath):
        return "Not found", 404
        
    if filename.startswith('plain_'):
        # Generate a thumbnail with placeholders so the user sees the layout
        from PIL import Image, ImageDraw
        img = Image.open(filepath).convert("RGBA")
        draw = ImageDraw.Draw(img)
        config_path = filepath + ".json"
        
        if os.path.exists(config_path):
            with open(config_path, 'r') as f:
                config = json.load(f)
            slots = config.get('slots', [])
            for slot in slots:
                pts = slot['points']
                quad = [(p['x'], p['y']) for p in pts]
                draw.polygon(quad, fill=(200, 200, 200, 255), outline=(150, 150, 150, 255))
        else:
            # Fallback auto-spacing
            margin = 30
            # Default to 3 slots for visual placeholder if no config exists
            num_images = 3
            available_height = img.height - (margin * (num_images + 1)) - 150
            img_height = available_height // num_images
            img_width = img.width - (margin * 2)
            y_offset = margin
            for i in range(num_images):
                draw.rectangle([margin, y_offset, margin + img_width, y_offset + img_height], fill=(200, 200, 200, 255), outline=(150, 150, 150, 255))
                y_offset += img_height + margin
                
        import io
        buf = io.BytesIO()
        img.save(buf, format='PNG')
        buf.seek(0)
        return send_file(buf, mimetype='image/png')
        
    return send_from_directory(app.config['TEMPLATE_FOLDER'], filename)

@app.route('/api/templates/<filename>/config', methods=['GET', 'POST'])
def template_config(filename):
    config_path = os.path.join(app.config['TEMPLATE_FOLDER'], f"{filename}.json")
    if request.method == 'POST':
        with open(config_path, 'w') as f:
            json.dump(request.json, f)
        return jsonify({"success": True})
    
    if os.path.exists(config_path):
        with open(config_path, 'r') as f:
            return jsonify(json.load(f))
    return jsonify({"slots": []})

@app.route('/api/stickers', methods=['GET'])
def api_stickers():
    stickers = [f for f in os.listdir(app.config['STICKER_FOLDER']) if f.endswith('.png')]
    return jsonify({"stickers": stickers})

@app.route('/api/stickers/<filename>')
def get_sticker(filename):
    return send_from_directory(app.config['STICKER_FOLDER'], filename)

@app.route('/api/session/start', methods=['POST'])
def start_session():
    data = request.json
    name = data.get('name', '').strip()
    if not name: return jsonify({"error": "Name required"}), 400
    
    # Clean the name to make it a safe folder name but allow spaces
    safe_name = "".join([c for c in name if c.isalpha() or c.isdigit() or c in (' ', '-', '_')]).rstrip()
    if not safe_name: safe_name = "Unknown"
    
    session_dir = os.path.join(app.config['UPLOAD_FOLDER'], safe_name)
    os.makedirs(session_dir, exist_ok=True)
    return jsonify({"success": True, "session_id": safe_name})

@app.route('/api/session/<session_id>/capture', methods=['POST'])
def capture(session_id):
    if 'photo' not in request.files: return jsonify({"error": "No photo"}), 400
    file = request.files['photo']
    filename = f"{int(time.time()*1000)}.jpg"
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], session_id, filename)
    file.save(filepath)
    return jsonify({"success": True, "filename": filename})

@app.route('/api/session/<session_id>/photos', methods=['GET'])
def get_photos(session_id):
    session_dir = os.path.join(app.config['UPLOAD_FOLDER'], session_id)
    if not os.path.exists(session_dir): return jsonify({"photos": []})
    photos = [f for f in os.listdir(session_dir) if f.endswith('.jpg') and not f.startswith('preview_')]
    return jsonify({"photos": sorted(photos)})

@app.route('/api/session/<session_id>/photos/<filename>', methods=['GET', 'DELETE'])
def manage_photo(session_id, filename):
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], session_id, filename)
    if request.method == 'DELETE':
        if os.path.exists(filepath):
            os.remove(filepath)
        return jsonify({"success": True})
    return send_file(filepath)

def resolve_photos(data, session_dir, all_photos):
    if 'selected_photos' in data and isinstance(data['selected_photos'], list) and data['selected_photos']:
        photos = []
        for filename in data['selected_photos']:
            p = os.path.join(session_dir, filename)
            if os.path.exists(p):
                photos.append(p)
            else:
                return None, f"Photo {filename} not found"
        return photos, None
    return [os.path.join(session_dir, f) for f in all_photos], None

@app.route('/api/session/<session_id>/generate_preview', methods=['POST'])
def generate_preview(session_id):
    settings = load_settings()
    session_dir = os.path.join(app.config['UPLOAD_FOLDER'], session_id)
    all_photos = sorted([f for f in os.listdir(session_dir) if f.endswith('.jpg') and not f.startswith('preview_')])
    if not all_photos: return jsonify({"error": "No photos in session"}), 400
    
    data = request.json or {}
    template_name = data.get('template', settings.get('active_template'))
    template_path = os.path.join(app.config['TEMPLATE_FOLDER'], template_name) if template_name else None
    
    photos, err = resolve_photos(data, session_dir, all_photos)
    if err: return jsonify({"error": err}), 400
    if not photos: return jsonify({"error": "No photos selected"}), 400
    
    preview_filename = f"preview_{session_id}.png"
    preview_path = os.path.join(session_dir, preview_filename)
    
    shapes = data.get('shapes', [])
    bg_color = data.get('bg_color', '#ffffff')
    
    # Generate the base image without custom background or stickers
    create_photostrip(photos, preview_path, template_path, custom_coords=[], bg_color=bg_color, shapes=shapes, overlays_data=[])
    
    return jsonify({"success": True, "preview_url": f"/api/session/{session_id}/photos/{preview_filename}"})

@app.route('/api/session/<session_id>/generate', methods=['POST'])
def generate(session_id):
    settings = load_settings()
    session_dir = os.path.join(app.config['UPLOAD_FOLDER'], session_id)
    all_photos = sorted([f for f in os.listdir(session_dir) if f.endswith('.jpg') and not f.startswith('preview_')])
    if not all_photos: return jsonify({"error": "No photos in session"}), 400
    
    data = request.json or {}
    template_name = data.get('template', settings.get('active_template'))
    template_path = os.path.join(app.config['TEMPLATE_FOLDER'], template_name) if template_name else None
    
    photos, err = resolve_photos(data, session_dir, all_photos)
    if err: return jsonify({"error": err}), 400
    if not photos: return jsonify({"error": "No photos selected"}), 400
    
    bg_color = data.get('bg_color', '#ffffff')
    shapes = data.get('shapes', [])
    overlays_data = data.get('overlays', [])
    
    # resolve sticker paths
    for o in overlays_data:
        if o['type'] == 'sticker':
            o['path'] = os.path.join(app.config['STICKER_FOLDER'], o['content'])
    
    timestamp = int(time.time())
    strip_filename = f"{session_id}_strip_{timestamp}.jpg"
    strip_path = os.path.join(app.config['OUTPUT_FOLDER'], strip_filename)
    
    create_photostrip(photos, strip_path, template_path, [], bg_color=bg_color, shapes=shapes, overlays_data=overlays_data)
    
    pdf_filename = f"{session_id}_print_{timestamp}.pdf"
    pdf_path = os.path.join(app.config['OUTPUT_FOLDER'], pdf_filename)
    num_copies = settings.get('copies', 2)
    create_a4_layout(strip_path, num_copies, pdf_path)
    
    if settings.get('auto_print'):
        try:
            os.startfile(os.path.abspath(pdf_path), "print")
        except Exception as e:
            print(f"Failed to auto-print: {e}")
            
    return jsonify({"success": True, "strip_url": f"/outputs/{strip_filename}", "pdf_url": f"/outputs/{pdf_filename}"})

@app.route('/api/slideshow')
def slideshow():
    strips = sorted([f for f in os.listdir(app.config['OUTPUT_FOLDER']) if '_strip_' in f or f.startswith('strip_')], reverse=True)
    return jsonify({"images": [f"/outputs/{f}" for f in strips]})

@app.route('/outputs/<filename>')
def serve_output(filename):
    return send_from_directory(app.config['OUTPUT_FOLDER'], filename)

if __name__ == '__main__':
    # Start on 0.0.0.0 to allow iPad access
    # Using ssl_context='adhoc' forces local HTTPS without needing the internet (requires pyOpenSSL)
    app.run(host='0.0.0.0', port=5000, debug=True, ssl_context='adhoc')
