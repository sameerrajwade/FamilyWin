"""
FamilyWin App Icon Generator — v3
Trophy: classic cup shape with proper curved handles
Family: 2 adults + child, clearly separated below trophy
"""

from PIL import Image, ImageDraw
import math, os

SIZE = 1024
OUT  = r"C:\Users\samee\FW\assets\icon.png"

GOLD       = (255, 200,  20)
GOLD_LIGHT = (255, 230,  80)
GOLD_DARK  = (200, 148,   0)
WHITE      = (255, 255, 255, 245)
SPARKLE    = (255, 220,  60, 170)

# ── Gradient background ───────────────────────────────────────────────────────

def gradient_bg(size):
    img = Image.new("RGBA", (size, size))
    px  = img.load()
    c1  = (108,  99, 255, 255)   # #6C63FF purple (top-left)
    c2  = ( 48,  35, 170, 255)   # #3023AA deep indigo (bottom-right)
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * size)
            r = int(c1[0] + (c2[0] - c1[0]) * t)
            g = int(c1[1] + (c2[1] - c1[1]) * t)
            b = int(c1[2] + (c2[2] - c1[2]) * t)
            px[x, y] = (r, g, b, 255)
    return img

def rounded_mask(size, radius):
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size-1, size-1], radius=radius, fill=255)
    return mask

# ── Trophy ────────────────────────────────────────────────────────────────────

def draw_trophy(draw, cx, top_y):
    """
    Classic trophy: wide rim → tapered cup body → short neck → stem → base.
    cx      = horizontal centre
    top_y   = y-coordinate of the top of the rim
    """
    rim_w  = 260   # half-width of rim
    cup_bw = 130   # half-width at bottom of cup (waist)
    cup_h  = 240   # height of cup body
    neck_h =  30   # short neck below cup
    neck_w =  40   # half-width of neck
    stem_h =  70   # stem height
    stem_w =  28   # half-width of stem
    base_h =  40   # base slab height
    base_w = 210   # half-width of base

    rim_y     = top_y
    cup_bot_y = rim_y + cup_h
    neck_bot  = cup_bot_y + neck_h
    stem_bot  = neck_bot + stem_h
    base_bot  = stem_bot + base_h

    # ── Cup body (polygon: wide top, narrower bottom) ──
    cup_pts = [
        (cx - rim_w,  rim_y),
        (cx + rim_w,  rim_y),
        (cx + cup_bw, cup_bot_y),
        (cx - cup_bw, cup_bot_y),
    ]
    draw.polygon(cup_pts, fill=GOLD)

    # ── Rim highlight strip ──
    draw.rectangle([cx - rim_w, rim_y, cx + rim_w, rim_y + 28], fill=GOLD_LIGHT)

    # ── Curved handles (drawn as thick arcs)
    # Each handle: ellipse bounding box extends OUTSIDE the cup, centred at cup midpoint
    handle_mid_y = rim_y + int(cup_h * 0.42)   # vertical centre of handle
    handle_h_span = 140    # vertical span of handle arc
    handle_out = 90        # how far handle extends past cup edge
    handle_thick = 32

    for sign in (-1, 1):
        edge_x = cx + sign * cup_bw   # where handle meets cup (at waist area)
        # We want an arc on the outside of the cup
        # Bounding box: left/right centred at edge_x ± handle_out
        box_cx = edge_x + sign * handle_out
        hb = [
            box_cx - handle_out,
            handle_mid_y - handle_h_span // 2,
            box_cx + handle_out,
            handle_mid_y + handle_h_span // 2,
        ]
        # arc on the outside half (180°–0° for right handle, 0°–180° for left)
        if sign == 1:
            start_a, end_a = -80, 80
        else:
            start_a, end_a = 100, 260
        draw.arc(hb, start=start_a, end=end_a, fill=GOLD, width=handle_thick)

    # ── Neck ──
    draw.polygon([
        (cx - cup_bw, cup_bot_y),
        (cx + cup_bw, cup_bot_y),
        (cx + neck_w, neck_bot),
        (cx - neck_w, neck_bot),
    ], fill=GOLD_DARK)

    # ── Stem ──
    draw.rectangle([cx - stem_w, neck_bot, cx + stem_w, stem_bot], fill=GOLD_DARK)

    # ── Base ──
    draw.rounded_rectangle(
        [cx - base_w, stem_bot, cx + base_w, base_bot],
        radius=12, fill=GOLD,
    )
    # Base top highlight
    draw.rectangle([cx - base_w, stem_bot, cx + base_w, stem_bot + 14], fill=GOLD_LIGHT)

    # ── Star on cup body ──
    star_cx = cx
    star_cy = rim_y + int(cup_h * 0.55)
    draw_star(draw, star_cx, star_cy, 48, 22, (255, 255, 255, 210))

    return base_bot   # return bottom of trophy so family can be positioned below

# ── Star ─────────────────────────────────────────────────────────────────────

def draw_star(draw, cx, cy, r_out, r_in, color, n=5):
    pts = []
    for i in range(n * 2):
        angle = math.radians(i * 180 / n - 90)
        r = r_out if i % 2 == 0 else r_in
        pts.append((cx + r * math.cos(angle), cy + r * math.sin(angle)))
    draw.polygon(pts, fill=color)

# ── Family silhouette ─────────────────────────────────────────────────────────

def draw_person(draw, cx, feet_y, head_r, body_w, body_h, color=WHITE):
    """Draw one simple person: round head + rounded-rect torso."""
    head_cy = feet_y - body_h - head_r
    draw.ellipse([cx - head_r, head_cy - head_r, cx + head_r, head_cy + head_r], fill=color)
    draw.rounded_rectangle(
        [cx - body_w, feet_y - body_h, cx + body_w, feet_y],
        radius=int(body_w * 0.7), fill=color,
    )

def draw_family(draw, cx, feet_y):
    gap = 148
    # Left adult
    draw_person(draw, cx - gap, feet_y, head_r=46, body_w=38, body_h=108)
    # Right adult
    draw_person(draw, cx + gap, feet_y, head_r=46, body_w=38, body_h=108)
    # Child (shorter, centred)
    draw_person(draw, cx, feet_y - 12, head_r=34, body_w=28, body_h=78)

# ── Sparkle ───────────────────────────────────────────────────────────────────

def draw_sparkle(draw, cx, cy, size, color=SPARKLE):
    for pts in [
        [(cx, cy - size), (cx + size//4, cy), (cx, cy + size), (cx - size//4, cy)],
        [(cx - size, cy), (cx, cy + size//4), (cx + size, cy), (cx, cy - size//4)],
    ]:
        draw.polygon(pts, fill=color)

# ── Compose ───────────────────────────────────────────────────────────────────

def build_icon(size=1024, corner_radius=180):
    bg = gradient_bg(size)

    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw  = ImageDraw.Draw(layer)

    cx     = size // 2
    top_y  = 115        # trophy rim starts here

    trophy_bottom = draw_trophy(draw, cx, top_y)

    # Family sits 20px below trophy base
    family_feet = trophy_bottom + 160
    # Clamp so family is fully inside the icon
    family_feet = min(family_feet, size - 60)
    draw_family(draw, cx, family_feet)

    # Corner sparkles
    draw_sparkle(draw,  88,  88, 44)
    draw_sparkle(draw, size - 88,  88, 38)
    draw_sparkle(draw,  88, size - 88, 32)
    draw_sparkle(draw, size - 88, size - 88, 36)
    draw_sparkle(draw,  56, size // 2, 22)
    draw_sparkle(draw, size - 56, size // 2, 22)

    # Composite onto gradient background
    out = bg.copy()
    out.paste(layer, (0, 0), layer)

    # Rounded corners
    mask = rounded_mask(size, corner_radius)
    out.putalpha(mask)
    return out

# ── Save ──────────────────────────────────────────────────────────────────────

icon = build_icon()
icon.save(OUT)
print("Saved icon.png")

icon.resize((512, 512), Image.LANCZOS).save(OUT.replace("icon.png", "icon-512.png"))
print("Saved icon-512.png")

# Foreground layer (no bg) for adaptive icon
fg = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
fd = ImageDraw.Draw(fg)
tb = draw_trophy(fd, SIZE // 2, 115)
draw_family(fd, SIZE // 2, min(tb + 160, SIZE - 60))
fg.save(OUT.replace("icon.png", "icon-foreground.png"))
print("Saved icon-foreground.png")

# Copy to Android mipmap folders
MIPMAP = {
    "mipmap-mdpi":    48,
    "mipmap-hdpi":    72,
    "mipmap-xhdpi":   96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi":192,
}
android_res = r"C:\Users\samee\FW\android\app\src\main\res"
for folder, px in MIPMAP.items():
    dest = os.path.join(android_res, folder)
    os.makedirs(dest, exist_ok=True)
    small = icon.resize((px, px), Image.LANCZOS)
    for name in ("ic_launcher.png", "ic_launcher_round.png"):
        small.save(os.path.join(dest, name))
print("Copied to all mipmap folders")
