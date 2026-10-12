"""Turn any picture (e.g. from Gemini) into pixel art in the game's own style:
downscale, map to the game palette with the same 4x4 ordered dither the renderer uses.

  python3 pixelize.py in.jpg out.png --size 64x64 [--colors 20] [--dark 0.9] [--preview 6]
"""
import argparse
from PIL import Image, ImageEnhance, ImageFilter

# The renderer's ramps and sprite palette (src/c_render.js), plus skin and olive (goblin, moss) ramps.
HEX = """
120e1c 211a33 342a4d 4d3f69 6b5a86 9483aa 0a0812 1c1629 2a2140 3a2f55
120d0b 261b15 3d2b20 59402d 7a5a3e a07a52 08060a 140f0c 22190f 33251a 4a3626 5e4632
06050b 0e0b16 16112a 1f1838 04030a 07060e 0b0914 100c1a 14101f 181326
1a0608 3a0c10 5e1418 86202a a83038 c84a4a
0f2140 1d3456 2f5c8f 4f86c6 86bce8 c4e6ff ffffff
0e0d14 1e1d27 33323f 4c4b5a 6b6a7c 908fa2 bdbccc e6e6f0
2a1c06 5a400e 8e6a1c c49a30 ecd06a 1e1008 3a2010 5a3418 7a4a22 9a6430
5a1206 9a2208 d8420e ff7a1a ffae2e ffde5a fff6c8
0e0820 1e1040 36185e 5a2476 8a3478 c0506c ec8a6a 100c22 1a1434 261e48 33285a 40336c
05080e 0a1216 101c1e 182824 22362c 14101c 241c2e 362a40 4a3c54 5e4e68 7a6884
0c140c 14240f 1f3614 2c4a1a 3c6022 527a2c 6e9638 1a120c 2e2016 463222 5e4430 7a5a40 987452
120c08 22160e 342216 463020 5a3e2a 6e4e36 0a0e16 141c2a 22304a 3a4e6e 6a84a8 a8c0e0
0a0604 1a100a 2a1a10 3a2616 4c321e 08120a 102012 1a301a 264424 345a2e
0e0b14 2b2836 4f4c5e 8a879a d6d4e0 3a2212 6e4424 b0844e 5e1414 b02a2a ffd04a 24401e 4f8a34
1e3a66 7fb8f0 3e1a5a 7a3a9a 8aa45a d8a07a 8a4a2a 3a5a2a e0702a 9a3a14
2a1610 4a2a1c 6e4230 9a5e44 c4876a e6b394
1a1e10 2c3218 40461f 56592a 6e6e3a 8a8850 a6a26a
"""
PALETTE = [tuple(int(h[i:i+2], 16) for i in (0, 2, 4)) for h in HEX.split()]
BAYER = [(v + .5) / 16 - .5 for v in (0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5)]

def dist(a, b):  # weighted RGB, close enough to perceptual for a fixed palette
    dr, dg, db = a[0] - b[0], a[1] - b[1], a[2] - b[2]
    return 2 * dr * dr + 4 * dg * dg + 3 * db * db

def nearest(c, pal):
    return min(pal, key=lambda p: dist(c, p))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('dst')
    ap.add_argument('--size', default='64x64', help='WxH in game pixels')
    ap.add_argument('--colors', type=int, default=40, help='how many palette colours one picture may use')
    ap.add_argument('--dark', type=float, default=1.0, help='brightness multiplier, the game is dark')
    ap.add_argument('--contrast', type=float, default=1.1)
    ap.add_argument('--saturation', type=float, default=1.15)
    ap.add_argument('--spread', type=float, default=14, help='dither strength')
    ap.add_argument('--preview', type=int, default=6, help='also save a scaled-up preview')
    ap.add_argument('--sprite', action='store_true', help='black background becomes transparent, dark outline around the figure')
    a = ap.parse_args()
    w, h = map(int, a.size.lower().split('x'))

    im = Image.open(a.src).convert('RGB')
    # crop to the target aspect ratio, centred
    ar, sw, sh = w / h, *im.size
    if sw / sh > ar: nw = int(sh * ar); im = im.crop(((sw - nw) // 2, 0, (sw - nw) // 2 + nw, sh))
    else: nh = int(sw / ar); im = im.crop((0, (sh - nh) // 2, sw, (sh - nh) // 2 + nh))
    im = ImageEnhance.Contrast(im).enhance(a.contrast)
    im = ImageEnhance.Brightness(im).enhance(a.dark)
    im = ImageEnhance.Color(im).enhance(a.saturation)
    small = im.resize((w, h), Image.BOX)
    small = small.filter(ImageFilter.UnsharpMask(radius=1, percent=60, threshold=2))
    px = [small.getpixel((x, y)) for y in range(h) for x in range(w)]

    # pick the colours this picture actually needs, so it reads as clean pixel art
    count = {}
    for c in px:
        n = nearest(c, PALETTE); count[n] = count.get(n, 0) + 1
    pal = [c for c, _ in sorted(count.items(), key=lambda kv: -kv[1])[:a.colors]]

    out = Image.new('RGB', (w, h))
    o = out.load()
    for y in range(h):
        for x in range(w):
            c = px[y * w + x]; t = BAYER[(y & 3) * 4 + (x & 3)] * a.spread
            o[x, y] = nearest((c[0] + t, c[1] + t, c[2] + t), pal)
    if a.sprite:
        # background = the colour of the corners (black or white, whatever the generator gave)
        corners = [small.getpixel(c) for c in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1))]
        bg = tuple(sum(c[i] for c in corners) // 4 for i in range(3))
        out = out.convert('RGBA'); o = out.load()
        for y in range(h):
            for x in range(w):
                c = small.getpixel((x, y))
                if sum(abs(c[i] - bg[i]) for i in range(3)) < 160: o[x, y] = (0, 0, 0, 0)
        solid = [[o[x, y][3] > 0 for x in range(w)] for y in range(h)]
        for y in range(h):
            for x in range(w):
                if not solid[y][x] and any(0 <= x + dx < w and 0 <= y + dy < h and solid[y + dy][x + dx] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    o[x, y] = (7, 6, 11, 255)
    out.save(a.dst)
    if a.preview > 1:
        out.resize((w * a.preview, h * a.preview), Image.NEAREST).save(a.dst.rsplit('.', 1)[0] + '_preview.png')
    print(f'{a.dst}: {w}x{h}, {len(pal)} colours')

if __name__ == '__main__':
    main()
