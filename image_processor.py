import os
import json
import math
import numpy as np
from PIL import Image, ImageDraw

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

def create_photostrip(image_paths, output_path, template_path=None, custom_coords=None):
    if template_path and os.path.exists(template_path):
        template = Image.open(template_path).convert("RGBA")
        strip_width, strip_height = template.size
    else:
        template = None
        strip_width, strip_height = 600, 1800
        
    canvas = Image.new('RGBA', (strip_width, strip_height), color=(255, 255, 255, 255))
    draw = ImageDraw.Draw(canvas)
    
    num_images = len(image_paths)
    if num_images == 0:
        if template: canvas.paste(template, (0,0), template)
        canvas.convert("RGB").save(output_path, "JPEG")
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
            
            shape = slot.get('shape', 'rect')
            if len(target_quad) == 4 and shape == 'rect':
                source_canvas_quad = [(0,0), (img.width,0), (img.width,img.height), (0,img.height)]
                coeffs = find_coeffs(source_canvas_quad, target_quad)
                warped = img.transform((strip_width, strip_height), Image.PERSPECTIVE, coeffs, Image.BICUBIC)
            else:
                warped = Image.new('RGBA', (strip_width, strip_height), (0,0,0,0))
                warped.paste(img, (int(min_x), int(min_y)))
            
            mask = Image.new('L', (strip_width, strip_height), 0)
            mask_draw = ImageDraw.Draw(mask)
            
            if shape == 'circle':
                mask_draw.ellipse([min_x, min_y, max_x, max_y], fill=255)
            elif shape == 'star':
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
        
    canvas.convert("RGB").save(output_path, "JPEG", quality=95)
    return output_path

def create_a4_layout(strip_path, num_copies, output_pdf_path):
    A4_WIDTH, A4_HEIGHT = 2480, 3508
    page = Image.new('RGB', (A4_WIDTH, A4_HEIGHT), color='white')
    draw = ImageDraw.Draw(page)
    
    strip = Image.open(strip_path)
    strip_w, strip_h = strip.size
    
    spacing = 100
    start_x = (A4_WIDTH - (strip_w * 3 + spacing * 2)) // 2
    start_y = (A4_HEIGHT - strip_h) // 2
    
    current_x = start_x
    for i in range(num_copies):
        if i >= 3: break
        page.paste(strip, (current_x, start_y))
        if i < min(num_copies, 3) - 1:
            line_x = current_x + strip_w + (spacing // 2)
            draw.line([(line_x, 0), (line_x, A4_HEIGHT)], fill="lightgray", width=4)
        current_x += strip_w + spacing
        
    page.save(output_pdf_path, "PDF", resolution=300.0)
    return output_pdf_path
