import os
from PIL import Image, ImageDraw, ImageFont

def create_gradient_icon(size):
    # Create image with alpha channel
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Calculate round corner radius
    r = size // 5
    
    # Draw rounded rectangle with emerald-to-teal gradient
    # Since PIL doesn't do smooth gradients easily in a rounded rect, we'll draw line-by-line or pixel-by-pixel
    # For a high-performance simple approach, we'll make a gradient and mask it
    mask = Image.new("L", (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle([0, 0, size, size], radius=r, fill=255)
    
    gradient = Image.new("RGBA", (size, size))
    grad_draw = ImageDraw.Draw(gradient)
    
    # Draw simple linear gradient from #0f6d5f (15, 109, 95) to #14b8a6 (20, 184, 166)
    for y in range(size):
        ratio = y / size
        r_val = int(15 + ratio * (20 - 15))
        g_val = int(109 + ratio * (184 - 109))
        b_val = int(95 + ratio * (166 - 95))
        for x in range(size):
            grad_draw.point((x, y), fill=(r_val, g_val, b_val, 255))
            
    # Apply mask
    icon = Image.composite(gradient, Image.new("RGBA", (size, size), (0, 0, 0, 0)), mask)
    icon_draw = ImageDraw.Draw(icon)
    
    # Try to load a font, or fallback to default
    font = None
    try:
        # Try some common windows fonts
        fonts_to_try = ["Outfit-Bold.ttf", "Inter-Bold.ttf", "arialbd.ttf", "segoeuib.ttf", "Helvetica-Bold.ttf"]
        for f_name in fonts_to_try:
            try:
                font = ImageFont.truetype(f_name, int(size * 0.55))
                break
            except IOError:
                continue
    except Exception:
        pass
        
    if font is None:
        font = ImageFont.load_default()
        
    # Draw "PP" text in the center
    text = "PP"
    
    # Pillow 8.0.0+ has textbbox, older versions have textsize. Let's be compatible
    try:
        bbox = icon_draw.textbbox((0, 0), text, font=font)
        text_w = bbox[2] - bbox[0]
        text_h = bbox[3] - bbox[1]
    except AttributeError:
        # Fallback for old PIL
        text_w, text_h = icon_draw.textsize(text, font=font)
        
    # Adjust for vertical offset
    tx = (size - text_w) // 2
    ty = (size - text_h) // 2 - (size // 20)
    
    icon_draw.text((tx, ty), text, fill=(255, 255, 255, 255), font=font)
    return icon

def main():
    icons_dir = "icons"
    os.makedirs(icons_dir, exist_ok=True)
    
    for size in [16, 48, 128]:
        icon = create_gradient_icon(size)
        icon.save(os.path.join(icons_dir, f"icon{size}.png"), "PNG")
        print(f"Generated icon{size}.png successfully!")

if __name__ == "__main__":
    main()
