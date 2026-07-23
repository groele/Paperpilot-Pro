import os
import math
from PIL import Image, ImageDraw, ImageFilter

def create_high_res_icon(size):
    # Render at 4x resolution for smooth antialiased scaling
    scale = 4
    canvas_size = size * scale
    
    img = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # 1. Background Rounded Squircle
    radius = int(canvas_size * 0.22)
    
    # Create mask for rounded rect
    mask = Image.new("L", (canvas_size, canvas_size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle([0, 0, canvas_size - 1, canvas_size - 1], radius=radius, fill=255)
    
    # Background Gradient: Emerald Teal (#0d4740 -> #0f766e -> #14b8a6)
    gradient = Image.new("RGBA", (canvas_size, canvas_size))
    grad_draw = ImageDraw.Draw(gradient)
    
    for y in range(canvas_size):
        for x in range(canvas_size):
            # Diagonal gradient factor
            factor = (x + y) / (2 * canvas_size)
            r = int(10 + factor * (20 - 10))
            g = int(70 + factor * (180 - 70))
            b = int(65 + factor * (165 - 65))
            grad_draw.point((x, y), fill=(r, g, b, 255))
            
    bg = Image.composite(gradient, Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0)), mask)
    
    # Add subtle inner highlight/glow border
    border_img = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    border_draw = ImageDraw.Draw(border_img)
    border_draw.rounded_rectangle([2, 2, canvas_size - 3, canvas_size - 3], radius=radius, outline=(255, 255, 255, 50), width=int(scale * 1.5))
    border_masked = Image.composite(border_img, Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0)), mask)
    bg = Image.alpha_composite(bg, border_masked)
    
    # 2. Draw Paper Plane / Research Wings Symbol
    # Center coordinates & dimensions
    cx = canvas_size * 0.5
    cy = canvas_size * 0.52
    
    # Paper plane points (pointing top-right at 45 degree angle)
    # Nose (top right)
    nose = (cx + canvas_size * 0.24, cy - canvas_size * 0.24)
    # Tail left
    tail_l = (cx - canvas_size * 0.24, cy - canvas_size * 0.02)
    # Tail bottom
    tail_b = (cx - canvas_size * 0.02, cy + canvas_size * 0.24)
    # Inner fold center
    fold_c = (cx - canvas_size * 0.04, cy + canvas_size * 0.04)
    # Left wing tip
    wing_l = (cx - canvas_size * 0.28, cy + canvas_size * 0.12)
    # Right wing tip
    wing_r = (cx + canvas_size * 0.12, cy - canvas_size * 0.28)

    symbol_img = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    sym_draw = ImageDraw.Draw(symbol_img)
    
    # Main Body Left Wing (White with slight teal tint)
    sym_draw.polygon([nose, tail_l, fold_c], fill=(240, 253, 250, 245))
    # Main Body Right Wing (Pure Crisp White)
    sym_draw.polygon([nose, fold_c, tail_b], fill=(255, 255, 255, 255))
    
    # Outer Fold / Shadow Flap Left (Darker teal tint)
    sym_draw.polygon([tail_l, fold_c, wing_l], fill=(15, 118, 110, 200))
    # Outer Fold / Shadow Flap Bottom
    sym_draw.polygon([tail_b, fold_c, (cx + canvas_size * 0.06, cy + canvas_size * 0.28)], fill=(13, 148, 136, 220))
    
    # Center fold line accent (cyan glow line)
    sym_draw.line([nose, fold_c], fill=(45, 212, 191, 255), width=int(scale * 2))

    # 3. Add AI Sparkle Stars (Top-Right of plane nose)
    def draw_sparkle(sp_cx, sp_cy, sp_r, opacity=255):
        pts = []
        for i in range(8):
            angle = i * math.pi / 4
            curr_r = sp_r if i % 2 == 0 else sp_r * 0.35
            pts.append((sp_cx + math.cos(angle) * curr_r, sp_cy + math.sin(angle) * curr_r))
        sym_draw.polygon(pts, fill=(255, 255, 255, opacity))

    # Primary Sparkle
    draw_sparkle(cx + canvas_size * 0.28, cy - canvas_size * 0.28, canvas_size * 0.09, 255)
    # Secondary Small Sparkle
    draw_sparkle(cx + canvas_size * 0.18, cy - canvas_size * 0.33, canvas_size * 0.05, 200)

    # 4. Composite symbol onto background
    final_img = Image.alpha_composite(bg, symbol_img)
    
    # 5. Downscale to target size with high-quality Lanczos resampling
    result = final_img.resize((size, size), Image.Resampling.LANCZOS)
    return result

def main():
    icons_dir = "icons"
    os.makedirs(icons_dir, exist_ok=True)
    
    for size in [16, 32, 48, 128]:
        icon = create_high_res_icon(size)
        icon.save(os.path.join(icons_dir, f"icon{size}.png"), "PNG")
        print(f"Generated icon{size}.png successfully!")

if __name__ == "__main__":
    main()
