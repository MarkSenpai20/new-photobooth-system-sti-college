# Automated Photobooth (Self-Service Edition)

A full self-service photobooth system with an admin panel and a "Simple Pink" customer kiosk interface.

## Architecture
- **Customer Kiosk (`/`)**: A playful, touch-friendly UI for iPads/Tablets. Customers input their name, take selfies with the device camera, and generate strips.
- **Admin Dashboard (`/admin`)**: A control panel to upload templates, select the active template, and toggle Auto-Print.

## Installation

1. Install Python 3.10+
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Run the app:
   ```bash
   python app.py
   ```

## Connecting an iPad (Camera Access via HTTPS)

Modern browsers (Safari, Chrome) **require** a secure HTTPS connection to access the device's camera using `getUserMedia`. Since your laptop is running a local `http://` server, the iPad won't allow camera access by default.

### The easiest solution: Ngrok
Ngrok creates a secure public HTTPS tunnel to your local server.

1. Download [ngrok](https://ngrok.com/download) and install it on your laptop.
2. Open a new terminal and run:
   ```bash
   ngrok http 5000
   ```
3. Ngrok will output a URL like `https://a1b2c3d4.ngrok-free.app`.
4. Open **that HTTPS URL** on your iPad. The camera will now work perfectly!

## Admin Usage
1. Go to `http://localhost:5000/admin` on your laptop.
2. Upload your Canva/Photoshop template (PNG with transparent photo windows).
3. Select it from the dropdown and hit **Save Settings**.
4. (Optional) Check "Enable Auto-Print" to automatically send the A4 PDF to your default Windows printer when a customer finishes.
