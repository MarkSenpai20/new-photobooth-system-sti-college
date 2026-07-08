# Automated Photobooth

A lightweight Python software to automate creating printable photostrip layouts.
Designed to replace manual Photoshop editing and Canva layouts.

## Features
- Upload a custom photostrip template
- Upload 1-4 photos dynamically
- Automatically crops, resizes, and places photos behind your template windows
- Provides an instant visual preview of the photostrip
- Automagically places up to 3 photostrips side-by-side onto an A4 page with cutting guides.
- Generates a print-ready PDF.

## Installation

1. Make sure you have Python installed.
2. Install the required dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Run the application:
   ```bash
   python app.py
   ```
4. Open your browser and go to `http://localhost:5000` (or your laptop's IP address if accessing from an iPad on the same network).

## How to Create Your Own Custom Template

To take full advantage of the custom template feature, you should create a PNG template in Photoshop or Canva:

1. **Size Requirements**: Set your canvas size to the exact size of your desired photostrip (e.g., 600 pixels wide by 1800 pixels tall for a standard 2x6 strip at 300 DPI).
2. **Transparent Windows**: Create transparent "cutout" holes where you want the photos to appear. You can design your frames, add text, graphics, and backgrounds, but the actual photo slots must be transparent (checkerboard background in Photoshop).
3. **Format**: Save the file as a `.PNG`. JPEG does not support transparency!
4. **Usage in App**: When you open the web interface, upload this `.PNG` file in the "Upload Custom Template" field.
5. **Adjusting Positions**: If your template's transparent windows are placed weirdly, click on "⚙️ Advanced: Adjust Photo Positions" in the web interface and enter the exact X, Y, Width, and Height for where the photos should be rendered *behind* the template.
