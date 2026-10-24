import sys, os, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "kit"))
import bpy
import kit

out = kit.args()[0]
kit.reset()

W, D = 0.3126, 0.2212
R = 0.0105
BT = 0.0102
LT = 0.0047
GAP = 0.0006

base = kit.slab('base', W, D, R, BT, rb=0.0028, rt=0.0007, segs=7, plan_segs=12)
kit.paint(base, 'alu')

KW, KD = 0.2715, 0.1046
KY = D / 2 - 0.0098 - KD / 2
well = kit.extrude_poly('well', kit.rounded_rect(KW, KD, 0.0042, 8), 0.004, z0=BT - 0.0009)
well.location.y = KY; kit.apply_tf(well)
kit.paint(well, 'alu_dark')
kit.boolean(base, well, transfer=True)

TW, TD = 0.1495, 0.0905
TY = -D / 2 + 0.0115 + TD / 2
tcut = kit.extrude_poly('tcut', kit.rounded_rect(TW + 0.0007, TD + 0.0007, 0.0062, 10), 0.004, z0=BT - 0.0005)
tcut.location.y = TY; kit.apply_tf(tcut)
kit.paint(tcut, 'alu_dark')
kit.boolean(base, tcut, transfer=True)

scoop = kit.extrude_poly('scoop', [(0.034 * math.cos(2 * math.pi * k / 96), -D / 2 + 0.0042 * math.sin(2 * math.pi * k / 96)) for k in range(96)], 0.01, z0=BT - 0.0016)
kit.boolean(base, scoop)

def port(side, y, w, h, z=0.0052, r=0.0012, depth=0.004):
    c = kit.extrude_poly('port', kit.rounded_rect(h, w, min(r, h / 2 - 1e-4), 6), depth * 2, z0=-depth)
    c.rotation_euler = (0, math.radians(90), 0)
    c.location = (side * W / 2, y, z)
    kit.apply_tf(c)
    kit.paint(c, 'graphite')
    kit.boolean(base, c, transfer=True)

port(-1, 0.072, 0.0118, 0.0034, r=0.0016)
port(-1, 0.050, 0.0087, 0.0031)
port(-1, 0.034, 0.0087, 0.0031)
port(-1, -0.078, 0.0036, 0.0036, r=0.0018)
port(1, 0.068, 0.0145, 0.0042, r=0.0006)
port(1, 0.046, 0.0087, 0.0031)
port(1, -0.060, 0.0255, 0.0019, r=0.0004)

kit.bevel(base, 0.00025, 2, angle=50)
kit.finish(base, 30)

trackpad = kit.slab('trackpad', TW, TD, 0.006, 0.0004, rt=0.00012, segs=2, plan_segs=10, z0=BT - 0.00042)
trackpad.location.y = TY; kit.apply_tf(trackpad)
kit.paint(trackpad, 'alu', name='trackpad', rough=0.28)
kit.finish(trackpad, 30)

for sx in (-1, 1):
    g = kit.poly_mesh('grille', kit.rounded_rect(0.0102, KD - 0.002, 0.0012, 4))
    g.location = (sx * (KW / 2 + 0.0098), KY, BT + 0.00003)
    kit.apply_tf(g)
    kit.paint(g, 'grille')
    kit.planar_uv(g, lambda co: (co.x / 0.0128, co.y / 0.0128))
grilles = kit.join([o for o in bpy.data.objects if o.name.startswith('grille')], 'grille')

u = (KW - 0.0034) / 14.5
gap = 0.0029
row_h = (KD - 0.0034) / 6
rows = [
    [1.5] + [1] * 12 + [1],
    [1] * 13 + [1.5],
    [1.5] + [1] * 13,
    [1.75] + [1] * 11 + [1.75],
    [2.25] + [1] * 10 + [2.25],
    [1, 1, 1, 1.25, 5.0, 1.25, 1, 1, 1, 1],
]
keys, touch = [], None
y = KY + KD / 2 - 0.0017
KZ = BT - 0.0009
for ri, widths in enumerate(rows):
    x = -KW / 2 + 0.0017
    yc = y - row_h / 2
    for i, wu in enumerate(widths):
        w = u * wu
        kw, kh, ky = w - gap, row_h - gap, yc
        if ri == 5 and i in (7, 9):
            kh = (row_h - gap * 1.5) / 2
            ky = yc - (row_h - gap) / 4 - gap / 4
        if ri == 5 and i == 8:
            for s in (1, -1):
                hh = (row_h - gap * 1.5) / 2
                k = kit.slab('k', w - gap, hh, 0.0011, 0.0009, rt=0.00028, segs=2, plan_segs=3, z0=KZ)
                k.location = (x + w / 2, yc + s * (hh / 2 + gap / 4), 0)
                kit.apply_tf(k); keys.append(k)
        else:
            k = kit.slab('k', kw, kh, 0.0011, 0.0009, rt=0.00028, segs=2, plan_segs=3, z0=KZ)
            k.location = (x + w / 2, ky, 0)
            kit.apply_tf(k)
            if ri == 0 and i == len(widths) - 1:
                touch = k
            else:
                keys.append(k)
        x += w
    y -= row_h
kb = kit.join(keys, 'keys')
kit.paint(kb, 'keycap')
kit.finish(kb, 40, weighted=False)
kit.paint(touch, 'glass', name='touchid', rough=0.12)
touch.name = 'touchid'

for fx in (-1, 1):
    for fy in (-1, 1):
        f = kit.slab('foot', 0.012, 0.012, 0.006, 0.0009, rb=0.0004, segs=3, plan_segs=6, z0=-0.0007)
        f.location = (fx * (W / 2 - 0.022), fy * (D / 2 - 0.022), 0)
        kit.apply_tf(f)
feet = kit.join([o for o in bpy.data.objects if o.name.startswith('foot')], 'feet')
kit.paint(feet, 'rubber')
kit.finish(feet, 40, weighted=False)

HY = D / 2 - 0.0042
hinge = kit.cyl('hinge', 0.0041, 0.262, loc=(0, HY, BT - 0.0002), rot=(0, math.radians(90), 0), n=48)
kit.paint(hinge, 'alu_dark', name='hinge', rough=0.5)
kit.bevel(hinge, 0.0006, 3, angle=50)
kit.finish(hinge, 40, weighted=False)

LZ = BT + GAP
lid = kit.slab('lid', W, D, R, LT, rb=0.0004, rt=0.0012, segs=6, plan_segs=12, z0=LZ)
kit.paint(lid, 'alu')
kit.finish(lid, 30)
logo = kit.badge('logo', 0.03, z0=LZ + LT - 0.00004, t=0.00008, plate='alu', glyph_key='alu_dark', plate_over=dict(name='logo', rough=0.08))

glass = kit.poly_mesh('bezel', kit.rounded_rect(W - 0.0014, D - 0.0014, R - 0.0007, 12))
for v in glass.data.vertices:
    v.co.z = LZ - 0.00004
kit.flip_down(glass)
kit.paint(glass, 'glass', name='bezel', rough=0.05)

SW, SH_FULL = 0.3025, 0.1964
TOP = -D / 2 + 0.0062
BAND = 0.0068
SH = SH_FULL - BAND
SY0 = TOP + BAND
scr = kit.poly_mesh('screen', [(-SW / 2, SY0), (SW / 2, SY0), (SW / 2, SY0 + SH), (-SW / 2, SY0 + SH)])
for v in scr.data.vertices:
    v.co.z = LZ - 0.00009
kit.flip_down(scr)
kit.planar_uv(scr, lambda co: ((co.x + SW / 2) / SW, 1 - (co.y - SY0) / SH))
kit.paint(scr, 'screen')

NW = 0.0325
bars = []
for s in (-1, 1):
    pts = kit.round_poly([(-SW / 2, TOP), (-NW / 2, TOP), (-NW / 2, TOP + BAND), (-SW / 2, TOP + BAND)], 0, 6, [0.0058, 0, 0, 0])
    if s > 0:
        pts = [(-x, y) for x, y in reversed(pts)]
    b = kit.poly_mesh('menubar', pts)
    for v in b.data.vertices:
        v.co.z = LZ - 0.00009
    kit.flip_down(b)
    bars.append(b)
menubar = kit.join(bars, 'menubar')
kit.paint(menubar, 'screen', name='menubar', emission=(0.93, 0.91, 0.87), strength=1.0)

lid = kit.join([lid, logo, glass], 'lid')
kit.set_origin(lid, (0, HY, BT - 0.0002))
kit.set_origin(scr, (0, SY0 + SH / 2, LZ - 0.00009))
kit.parent(scr, lid)
kit.parent(menubar, lid)

kit.join([base, trackpad, grilles, kb, touch, feet, hinge], 'base')
kit.export(out, skip_uv=('screen',), ao=dict(dist=0.015, density=1200, isolate=['lid']), anim=['lid'])
