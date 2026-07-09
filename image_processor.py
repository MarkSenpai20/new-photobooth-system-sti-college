import os
import json
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFont

def find_coeffs(source_coords, target_coords):
    matrix = []
    for s, t in zip(source_coords, target_coords):
        matrix.append([t[0], t[1], 1, 0, 0, 0, -s[0]*t[0], -s[0]*t[1]])
        matrix.append([0, 0, 0, t[0], t[1], 1, -s[1]*t[0], -s[1]*t[1]])
    A = np.matrix(matrix, dtype=float)
    B = np.array(source_coords).reshape(8)
    res = np.dot(np.linalg.inv(A.T * A) * A.T, B)
    return np.array(res).reshape(8)

def get_template_config(template_path):
    if not template_path: return None
    config_path = template_path + ".json"
    if os.path.exists(config_path):
        with open(config_path, 'r') as f:
            return json.load(f)
    return None

def create_photostrip(image_paths, output_path, template_path=None, custom_coords=None, bg_color="#ffffff", shapes=None, overlays_data=None):
    if overlays_data is None: overlays_data = []
    if shapes is None: shapes = []
    
    if template_path and os.path.exists(template_path):
        template = Image.open(template_path).convert("RGBA")
        strip_width, strip_height = template.size
    else:
        template = None
        strip_width, strip_height = 600, 1800
        
    bg_hex = bg_color.lstrip('#') if bg_color else 'ffffff'
    try:
        if bg_color == "transparent":
            bg_rgba = (255, 255, 255, 0)
        elif len(bg_hex) == 6:
            bg_rgba = tuple(int(bg_hex[i:i+2], 16) for i in (0, 2, 4)) + (255,)
        else:
            bg_rgba = (255, 255, 255, 255)
    except:
        bg_rgba = (255, 255, 255, 255)
        
    canvas = Image.new('RGBA', (strip_width, strip_height), color=bg_rgba)
    draw = ImageDraw.Draw(canvas)
    
    num_images = len(image_paths)
    if num_images == 0:
        if template: canvas = Image.alpha_composite(canvas, template)
        canvas.convert("RGB").save(output_path, "JPEG", quality=95)
        return output_path

    config = get_template_config(template_path)
    
    if not config or not config.get('slots'):
        # Fallback Auto-Spacing
        margin = 30
        available_height = strip_height - (margin * (num_images + 1)) - 150
        img_height = available_height // num_images
        img_width = strip_width - (margin * 2)
        y_offset = margin
        for i, path in enumerate(image_paths):
            img = Image.open(path).convert("RGBA")
            img = img.resize((img_width, img_height), Image.Resampling.LANCZOS)
            
            # Apply shape mask even for fallback layout
            slot_shape = shapes[i] if i < len(shapes) else 'rectangle'
            
            mask = Image.new('L', (img_width, img_height), 0)
            mask_draw = ImageDraw.Draw(mask)
            if slot_shape == 'circle':
                mask_draw.ellipse([0, 0, img_width, img_height], fill=255)
            elif slot_shape == 'rounded':
                mask_draw.rounded_rectangle([0, 0, img_width, img_height], radius=30, fill=255)
            else:
                mask_draw.rectangle([0, 0, img_width, img_height], fill=255)
            
            img.putalpha(mask)
            
            temp_layer = Image.new('RGBA', canvas.size, (0,0,0,0))
            temp_layer.paste(img, (margin, y_offset))
            canvas = Image.alpha_composite(canvas, temp_layer)
            y_offset += img_height + margin
    else:
        slots = config['slots']
        for i, path in enumerate(image_paths):
            if i >= len(slots): break
            slot = slots[i]
            pts = slot['points'] # [{'x':., 'y':.}, ...]
            
            # Target Quad
            target_quad = [(p['x'], p['y']) for p in pts]
            
            # Find bounding box of target quad
            min_x = min(p[0] for p in target_quad)
            max_x = max(p[0] for p in target_quad)
            min_y = min(p[1] for p in target_quad)
            max_y = max(p[1] for p in target_quad)
            
            tw, th = int(max_x - min_x), int(max_y - min_y)
            if tw == 0 or th == 0: continue
            
            img = Image.open(path).convert("RGBA")
            
            # Crop image to match aspect ratio of bounding box
            img_ratio = img.width / img.height
            target_ratio = tw / th
            if img_ratio > target_ratio:
                new_width = int(img.height * target_ratio)
                left = (img.width - new_width) / 2
                img = img.crop((left, 0, left + new_width, img.height))
            else:
                new_height = int(img.width / target_ratio)
                top = (img.height - new_height) / 2
                img = img.crop((0, top, img.width, top + new_height))
                
            img = img.resize((tw, th), Image.Resampling.LANCZOS)
            
            # Determine which shape to use
            # If it's a plain template, use the user's selected shape. Otherwise, stick to the template's defined shape.
            slot_shape = shapes[i] if (i < len(shapes) and template_path and 'plain_' in os.path.basename(template_path)) else slot.get('shape', 'rectangle')
            
            if len(target_quad) == 4 and slot_shape == 'rectangle':
                source_canvas_quad = [(0,0), (img.width,0), (img.width,img.height), (0,img.height)]
                coeffs = find_coeffs(source_canvas_quad, target_quad)
                warped = img.transform((strip_width, strip_height), Image.PERSPECTIVE, coeffs, Image.BICUBIC)
            else:
                warped = Image.new('RGBA', (strip_width, strip_height), (0,0,0,0))
                warped.paste(img, (int(min_x), int(min_y)))
            
            mask = Image.new('L', (strip_width, strip_height), 0)
            mask_draw = ImageDraw.Draw(mask)
            
            if slot_shape == 'circle':
                mask_draw.ellipse([min_x, min_y, max_x, max_y], fill=255)
            elif slot_shape == 'rounded':
                radius = 30
                mask_draw.rounded_rectangle([min_x, min_y, max_x, max_y], radius=radius, fill=255)
            elif slot_shape == 'star':
                cx, cy = (min_x + max_x) / 2, (min_y + max_y) / 2
                r_out = min(tw, th) / 2
                r_in = r_out * 0.4
                star_pts = []
                for j in range(10):
                    r = r_out if j % 2 == 0 else r_in
                    angle = math.pi/2 - j * (math.pi/5)
                    star_pts.append((cx + r * math.cos(angle), cy - r * math.sin(angle)))
                mask_draw.polygon(star_pts, fill=255)
            else:
                mask_draw.polygon(target_quad, fill=255)
                
            warped.putalpha(mask)
            canvas = Image.alpha_composite(canvas, warped)

    if template:
        canvas = Image.alpha_composite(canvas, template)
        
    if overlays_data:
        for o in overlays_data:
            try:
                temp_layer = Image.new('RGBA', canvas.size, (0,0,0,0))
                
                cx = float(o['cx'])
                cy = float(o['cy'])
                
                if o['type'] == 'sticker':
                    if 'base64' in o:
                        import base64
                        from io import BytesIO
                        img_data = base64.b64decode(o['base64'].split(',')[1])
                        element_img = Image.open(BytesIO(img_data)).convert("RGBA")
                        sw = int(float(o['width']))
                        sh = int(float(o['height']))
                        if sw > 0 and sh > 0:
                            element_img = element_img.resize((sw, sh), Image.Resampling.LANCZOS)
                    else:
                        if 'path' not in o or not os.path.exists(o['path']):
                            continue
                        element_img = Image.open(o['path']).convert("RGBA")
                        sw = int(float(o['width']))
                        sh = int(float(o['height']))
                        if sw <= 0 or sh <= 0: continue
                        element_img = element_img.resize((sw, sh), Image.Resampling.LANCZOS)


                rot = float(o.get('rotation', 0))
                if rot != 0:
                    element_img = element_img.rotate(-rot, expand=True, resample=Image.Resampling.BICUBIC)
                
                offset_x = int(cx - element_img.width / 2)
                offset_y = int(cy - element_img.height / 2)
                
                temp_layer.paste(element_img, (offset_x, offset_y))
                canvas = Image.alpha_composite(canvas, temp_layer)
            except Exception as e:
                print(f"Overlay error: {e}")
                
    if output_path.lower().endswith('.png'):
        canvas.save(output_path, "PNG")
    else:
        canvas.convert("RGB").save(output_path, "JPEG", quality=95)
    return output_path

def create_a4_layout(strip_path, num_copies, output_pdf_path):
    # A4 at 300dpi is approx 2480 x 3508 pixels
    A4_WIDTH = 2480
    A4_HEIGHT = 3508
    page = Image.new('RGB', (A4_WIDTH, A4_HEIGHT), 'white')
    draw = ImageDraw.Draw(page)
    
    strip = Image.open(strip_path)
    strip_w, strip_h = strip.size
    
    if num_copies <= 0:
        page.save(output_pdf_path, "PDF", resolution=300.0)
        return output_pdf_path
        
    num_copies = min(num_copies, 4) # Max 4 copies per page for safety
    
    # Calculate available space with 100px padding around the page
    spacing = 50
    avail_w = A4_WIDTH - 200
    avail_h = A4_HEIGHT - 200
    
    # Max width per strip based on how many copies we need to fit side-by-side
    max_w = (avail_w - (spacing * (num_copies - 1))) / num_copies
    
    # Scale strip to fit inside max_w and avail_h
    scale = min(max_w / strip_w, avail_h / strip_h)
    
    new_w = int(strip_w * scale)
    new_h = int(strip_h * scale)
    strip = strip.resize((new_w, new_h), Image.Resampling.LANCZOS)
    
    # Calculate centered starting position
    total_content_w = (new_w * num_copies) + (spacing * (num_copies - 1))
    start_x = (A4_WIDTH - total_content_w) // 2
    start_y = (A4_HEIGHT - new_h) // 2
    
    current_x = start_x
    for i in range(num_copies):
        page.paste(strip, (current_x, start_y))
        
        # Draw cut lines between strips
        if i < num_copies - 1:
            line_x = current_x + new_w + (spacing // 2)
            draw.line([(line_x, 0), (line_x, A4_HEIGHT)], fill="lightgray", width=4)
            
        current_x += new_w + spacing
        
    page.save(output_pdf_path, "PDF", resolution=300.0)
    return output_pdf_path
