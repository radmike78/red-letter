#!/usr/bin/env python3
"""
Generates Red Letter's app icons.

The mark is the product: a grid of days, almost all of them empty, one of them
red. It is the year screen reduced to something that still reads at 40 points,
which is the only test an app icon has to pass.

Kept as a script rather than a binary blob so the icons are reproducible and
the palette stays tied to src/ui/theme.ts.

    python3 scripts/generate-icons.py
"""

from PIL import Image, ImageDraw

# From src/ui/theme.ts.
PAPER = (251, 250, 248, 255)
INK = (26, 25, 23, 255)
RED = (179, 38, 30, 255)

# Muted dots are much darker than the theme's rule colour. #E6E3DC is right for
# a 5px dot on screen, but an icon is judged at 60px on a home screen, where
# that value vanishes into the background entirely.
QUIET = (166, 159, 145, 255)

# Supersampling factor. Pillow has no anti-aliased circle, so everything is
# drawn large and reduced.
SS = 4

GRID = 5          # Columns and rows. Fewer than a week, so the dots stay legible.
MARKED = (3, 1)   # (column, row) of the one red day. Zero-indexed, off-centre.


def draw_mark(size, background, dot_colour, accent_colour, scale=0.62):
    """The mark, centred on a square canvas. `scale` is the grid's share of it."""
    canvas = size * SS
    image = Image.new("RGBA", (canvas, canvas), background)
    draw = ImageDraw.Draw(image)

    grid_span = canvas * scale
    step = grid_span / (GRID - 1)
    origin = (canvas - grid_span) / 2

    quiet_r = step * 0.15
    accent_r = step * 0.34

    for row in range(GRID):
        for col in range(GRID):
            x = origin + col * step
            y = origin + row * step
            marked = (col, row) == MARKED
            r = accent_r if marked else quiet_r
            colour = accent_colour if marked else dot_colour
            if colour is None:
                continue
            draw.ellipse((x - r, y - r, x + r, y + r), fill=colour)

    return image.resize((size, size), Image.LANCZOS)


def main():
    # iOS app icon: square, no rounded corners (the OS masks it), and flattened
    # to RGB. App Store Connect rejects an app icon that carries an alpha
    # channel at all, even one that is fully opaque.
    draw_mark(1024, PAPER, QUIET, RED).convert("RGB").save("assets/icon.png")

    # Android adaptive foreground. Content must sit inside the central safe
    # zone, because the launcher crops the outer third to whatever mask the
    # device uses, so the grid is drawn smaller here than on iOS.
    draw_mark(512, (0, 0, 0, 0), QUIET, RED, scale=0.42).save(
        "assets/android-icon-foreground.png"
    )

    Image.new("RGBA", (512, 512), PAPER).save("assets/android-icon-background.png")

    # Themed icons: the system recolours this, so only the alpha shape matters.
    # The red day is drawn in the same ink as the rest — a monochrome layer
    # cannot keep the accent, and a missing dot would read as a mistake.
    draw_mark(512, (0, 0, 0, 0), INK, INK, scale=0.42).save(
        "assets/android-icon-monochrome.png"
    )

    # Splash: transparent, so it sits on the configured background colour.
    draw_mark(1024, (0, 0, 0, 0), QUIET, RED, scale=0.46).save(
        "assets/splash-icon.png"
    )

    draw_mark(48, PAPER, QUIET, RED).save("assets/favicon.png")

    print("Wrote icon.png, android-icon-{foreground,background,monochrome}.png,")
    print("      splash-icon.png, favicon.png")


if __name__ == "__main__":
    main()
