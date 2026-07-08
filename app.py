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
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024 # 50MB max

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['OUTPUT_FOLDER'], exist_ok=True)
os.makedirs(app.config['TEMPLATE_FOLDER'], exist_ok=True)

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

@app.route('/api/templates/<filename>')
def get_template(filename):
    return send_from_directory(app.config['TEMPLATE_FOLDER'], filename)

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
    photos = [f for f in os.listdir(session_dir) if f.endswith('.jpg')]
    return jsonify({"photos": sorted(photos)})

@app.route('/api/session/<session_id>/photos/<filename>', methods=['GET', 'DELETE'])
def manage_photo(session_id, filename):
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], session_id, filename)
    if request.method == 'DELETE':
        if os.path.exists(filepath):
            os.remove(filepath)
        return jsonify({"success": True})
    return send_file(filepath)

@app.route('/api/session/<session_id>/generate', methods=['POST'])
def generate(session_id):
    settings = load_settings()
    session_dir = os.path.join(app.config['UPLOAD_FOLDER'], session_id)
    
    photos = sorted([os.path.join(session_dir, f) for f in os.listdir(session_dir) if f.endswith('.jpg')])
    if not photos: return jsonify({"error": "No photos"}), 400
    
    template_name = settings.get('active_template')
    template_path = os.path.join(app.config['TEMPLATE_FOLDER'], template_name) if template_name else None
    
    timestamp = int(time.time())
    strip_filename = f"strip_{session_id}_{timestamp}.jpg"
    strip_path = os.path.join(app.config['OUTPUT_FOLDER'], strip_filename)
    
    # We use empty custom_coords for auto-spacing
    create_photostrip(photos, strip_path, template_path, [])
    
    pdf_filename = f"print_{session_id}_{timestamp}.pdf"
    pdf_path = os.path.join(app.config['OUTPUT_FOLDER'], pdf_filename)
    num_copies = settings.get('copies', 2)
    create_a4_layout(strip_path, num_copies, pdf_path)
    
    # Auto Print Logic for Windows
    if settings.get('auto_print'):
        try:
            os.startfile(os.path.abspath(pdf_path), "print")
        except Exception as e:
            print(f"Failed to auto-print: {e}")
            
    return jsonify({"success": True, "strip_url": f"/outputs/{strip_filename}", "pdf_url": f"/outputs/{pdf_filename}"})

@app.route('/api/slideshow')
def slideshow():
    strips = sorted([f for f in os.listdir(app.config['OUTPUT_FOLDER']) if f.startswith('strip_')], reverse=True)
    return jsonify({"images": [f"/outputs/{f}" for f in strips]})

@app.route('/outputs/<filename>')
def serve_output(filename):
    return send_from_directory(app.config['OUTPUT_FOLDER'], filename)

if __name__ == '__main__':
    # Start on 0.0.0.0 to allow iPad access
    # Using ssl_context='adhoc' forces local HTTPS without needing the internet (requires pyOpenSSL)
    app.run(host='0.0.0.0', port=5000, debug=True, ssl_context='adhoc')
