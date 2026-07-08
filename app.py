import os
from flask import Flask, render_template, request, send_file, redirect, url_for, send_from_directory
from werkzeug.utils import secure_filename
from image_processor import create_photostrip, create_a4_layout
import uuid

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['OUTPUT_FOLDER'] = 'outputs'
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024 # 50MB max

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['OUTPUT_FOLDER'], exist_ok=True)

@app.route('/', methods=['GET', 'POST'])
def index():
    if request.method == 'POST':
        action = request.form.get('action') # "preview" or "generate"
        
        if 'photos' not in request.files:
            return "No file part", 400
        files = request.files.getlist('photos')
        num_copies = int(request.form.get('copies', 1))
        
        template_file = request.files.get('template')
        
        if not files or files[0].filename == '':
            return "No selected file", 400
            
        session_id = str(uuid.uuid4())
        session_upload_dir = os.path.join(app.config['UPLOAD_FOLDER'], session_id)
        os.makedirs(session_upload_dir, exist_ok=True)
        
        # Save template if uploaded
        template_path = None
        if template_file and template_file.filename != '':
            template_path = os.path.join(session_upload_dir, secure_filename(template_file.filename))
            template_file.save(template_path)
            
        # Parse custom coordinates if provided
        custom_coords = []
        for i in range(4): # up to 4 photos
            x = request.form.get(f'x_{i}')
            y = request.form.get(f'y_{i}')
            w = request.form.get(f'w_{i}')
            h = request.form.get(f'h_{i}')
            if x and y and w and h:
                try:
                    custom_coords.append({'x': int(x), 'y': int(y), 'w': int(w), 'h': int(h)})
                except ValueError:
                    pass

        saved_paths = []
        for file in files:
            if file and file.filename != '':
                filename = secure_filename(file.filename)
                filepath = os.path.join(session_upload_dir, filename)
                file.save(filepath)
                saved_paths.append(filepath)
                
        # Generate Strip
        strip_filename = f"strip_{session_id}.jpg"
        strip_path = os.path.join(app.config['OUTPUT_FOLDER'], strip_filename)
        create_photostrip(saved_paths, strip_path, template_path, custom_coords)
        
        # Generate Layout
        pdf_filename = f"print_{session_id}.pdf"
        pdf_path = os.path.join(app.config['OUTPUT_FOLDER'], pdf_filename)
        create_a4_layout(strip_path, num_copies, pdf_path)
        
        return render_template('index.html', preview_img=strip_filename, pdf_file=pdf_filename)
        
    return render_template('index.html', preview_img=None, pdf_file=None)

@app.route('/download/<filename>')
def download(filename):
    path = os.path.join(app.config['OUTPUT_FOLDER'], filename)
    return send_file(path, as_attachment=True)
    
@app.route('/preview/<filename>')
def preview(filename):
    return send_from_directory(app.config['OUTPUT_FOLDER'], filename)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
