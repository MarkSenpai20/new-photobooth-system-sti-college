import os
from PIL import Image, ImageDraw

def create_photostrip(image_paths, output_path, template_path=None, custom_coords=None):
    """
    Creates a photostrip from uploaded images.
    If template_path is provided, pastes images BEHIND the template.
    custom_coords: list of dicts [{'x':0, 'y':0, 'w':100, 'h':100}, ...]
    """
    if template_path and os.path.exists(template_path):
        template = Image.open(template_path).convert("RGBA")
        strip_width, strip_height = template.size
    else:
        template = None
        strip_width, strip_height = 600, 1800
        
    # The canvas where we will place the user's photos
    canvas = Image.new('RGBA', (strip_width, strip_height), color=(255, 255, 255, 255))
    draw = ImageDraw.Draw(canvas)
    
    num_images = len(image_paths)
    if num_images == 0:
        if template:
            canvas.paste(template, (0,0), template)
        canvas.convert("RGB").save(output_path, "JPEG")
        return output_path

    # Calculate automatic layout if custom_coords not provided or incomplete
    if not custom_coords or len(custom_coords) < num_images:
        custom_coords = []
        margin = 30
        available_height = strip_height - (margin * (num_images + 1)) - 150
        img_height = available_height // num_images
        img_width = strip_width - (margin * 2)
        y_offset = margin
        for i in range(num_images):
            custom_coords.append({'x': margin, 'y': y_offset, 'w': img_width, 'h': img_height})
            y_offset += img_height + margin

    # Paste photos onto the canvas
    for i, path in enumerate(image_paths):
        if i >= len(custom_coords): break
        img = Image.open(path).convert("RGBA")
        
        coords = custom_coords[i]
        cw, ch = int(coords['w']), int(coords['h'])
        cx, cy = int(coords['x']), int(coords['y'])
        
        # Resize/crop to fit cw x ch
        img_ratio = img.width / img.height
        target_ratio = cw / ch if ch != 0 else 1
        
        if img_ratio > target_ratio:
            new_width = int(img.height * target_ratio)
            left = (img.width - new_width) / 2
            img = img.crop((left, 0, left + new_width, img.height))
        else:
            new_height = int(img.width / target_ratio)
            top = (img.height - new_height) / 2
            img = img.crop((0, top, img.width, top + new_height))
            
        img = img.resize((cw, ch), Image.Resampling.LANCZOS)
        
        # Create a temp transparent layer to paste so it honors alpha
        temp_layer = Image.new('RGBA', canvas.size, (0,0,0,0))
        temp_layer.paste(img, (cx, cy))
        canvas = Image.alpha_composite(canvas, temp_layer)

    # Paste the template ON TOP of the photos
    if template:
        canvas = Image.alpha_composite(canvas, template)
    else:
        # Fallback drawing
        draw.rectangle([30, strip_height - 130, strip_width - 30, strip_height - 30], outline="black", width=2)
        draw.text((40, strip_height - 100), "Our Photobooth", fill="black")
        
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
