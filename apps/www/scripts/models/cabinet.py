import sys, os, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "kit"))
import kit

out = kit.args()[0]
kit.reset()

W, H, D = 0.40, 0.335, 0.40
PL = 0.03
FY = -D / 2
COLS, ROWS = 2, 3
DW, DH = 0.178, 0.094
GX, GZ = 0.007, 0.007
DEPTH = 0.34
GRID_W = COLS * DW + (COLS - 1) * GX
GRID_H = ROWS * DH + (ROWS - 1) * GZ
Z0 = PL + (H - GRID_H) / 2 - 0.002

def front_slab(name, w, h, t, r, rt=0.0, segs=3):
    s = kit.slab(name, w, h, r, t, rt=rt, segs=segs, plan_segs=6)
    s.rotation_euler = (math.radians(90), 0, 0)
    kit.apply_tf(s)
    return s

def cell(i):
    c, r = i % COLS, i // COLS
    return -GRID_W / 2 + DW / 2 + c * (DW + GX), Z0 + GRID_H - DH / 2 - r * (DH + GZ)

body = kit.slab('body', W, D, 0.012, H, rt=0.008, rb=0.002, segs=6, plan_segs=10, z0=PL)
kit.paint(body, 'bone')
for i in range(COLS * ROWS):
    x, z = cell(i)
    cut = kit.box('cut', (DW + 0.003, DEPTH + 0.02, DH + 0.003), loc=(x, FY + DEPTH / 2 - 0.01, z))
    kit.paint(cut, 'graphite', name='cavity', rough=0.7)
    kit.boolean(body, cut, transfer=True)
kit.bevel(body, 0.0008, 3, angle=50)
kit.finish(body, 30)

plinth = kit.slab('plinth', W - 0.024, D - 0.024, 0.008, PL + 0.002, rt=0.002, segs=3, plan_segs=8)
kit.paint(plinth, 'graphite')
kit.finish(plinth, 30)

DRAWERS = [f'drawer{i}' for i in range(COLS * ROWS)]
for i in range(COLS * ROWS):
    x, z = cell(i)
    fy = FY - 0.002
    fr = front_slab('front', DW, DH, 0.014, 0.004, rt=0.0016)
    fr.location = (x, fy + 0.014, z)
    kit.apply_tf(fr)
    kit.paint(fr, 'bone')
    kit.finish(fr, 30)

    wall = 0.004
    bw, bh = DW - 0.006, DH - 0.012
    by0 = fy + 0.014
    tray = kit.join([kit.box(name, size, loc=loc) for name, size, loc in [
        ('floor', (bw, DEPTH - 0.02, wall), (x, by0 + (DEPTH - 0.02) / 2, z - bh / 2)),
        ('sideL', (wall, DEPTH - 0.02, bh), (x - bw / 2 + wall / 2, by0 + (DEPTH - 0.02) / 2, z)),
        ('sideR', (wall, DEPTH - 0.02, bh), (x + bw / 2 - wall / 2, by0 + (DEPTH - 0.02) / 2, z)),
        ('backw', (bw, wall, bh), (x, by0 + DEPTH - 0.02 - wall / 2, z)),
    ]], 'tray')
    kit.paint(tray, 'bone', name='tray', rough=0.6)

    cw, ch, cd = bw - 2 * wall - 0.002, bh - 0.012, 0.22
    cards = kit.box('cards', (cw, cd, ch), loc=(x, by0 + 0.03 + cd / 2, z - bh / 2 + wall / 2 + ch / 2), bev=0.0006, segs=2)
    kit.paint(cards, 'cards')
    kit.planar_uv(cards, lambda co, x=x, by0=by0: ((co.y - by0) / 0.288, (co.x - x) / 0.06))
    divs = []
    for k, dy in enumerate((0.05, 0.12, 0.19)):
        d = kit.box('div', (cw, 0.0012, ch + 0.004), loc=(x, by0 + 0.03 + dy, z - bh / 2 + wall / 2 + (ch + 0.004) / 2))
        t = kit.slab('tab', 0.03, 0.0012, 0.003, 0.009, segs=1, plan_segs=4)
        t.location = (x - cw / 2 + 0.025 + k * 0.05, by0 + 0.03 + dy, z - bh / 2 + wall / 2 + ch + 0.003)
        kit.apply_tf(t)
        divs.append(kit.join([d, t], 'div'))
    div = kit.join(divs, 'dividers')
    kit.paint(div, 'card')

    lw, lh = 0.068, 0.031
    lz = z + 0.015
    frame = front_slab('frame', lw, lh, 0.0014, 0.0025, rt=0.0005, segs=2)
    frame.location = (x, fy, lz)
    kit.apply_tf(frame)
    win = front_slab('win', lw - 0.007, lh - 0.008, 0.004, 0.0012)
    win.location = (x, fy + 0.002, lz - 0.0006)
    kit.apply_tf(win)
    kit.boolean(frame, win)
    rivets = [kit.sphere('rivet', 0.0016, loc=(x + sx * (lw / 2 - 0.0035), fy - 0.0012, lz + lh / 2 - 0.0035), n=16) for sx in (-1, 1)]
    frame = kit.join([frame] + rivets, 'holder')
    kit.paint(frame, 'brass')
    kit.finish(frame, 40)

    pz = z - 0.022
    R = 0.0115
    def quarter(ob):
        kit.boolean(ob, kit.box('cb', (0.07, 0.03, 0.03), loc=(x, fy + 0.015, pz)))
        kit.boolean(ob, kit.box('cb', (0.07, 0.03, 0.03), loc=(x, fy - 0.01, pz - 0.015)))
        return ob
    shell = kit.cyl('pull', R, 0.056, loc=(x, fy, pz), rot=(0, math.radians(90), 0), n=48)
    kit.boolean(shell, kit.cyl('pin', R - 0.0013, 0.06, loc=(x, fy, pz), rot=(0, math.radians(90), 0), n=48))
    quarter(shell)
    caps = [quarter(kit.cyl('cap', R, 0.0013, loc=(x + sx * (0.028 - 0.00065), fy, pz), rot=(0, math.radians(90), 0), n=48)) for sx in (-1, 1)]
    pull = kit.join([shell] + caps, 'pull')
    kit.bevel(pull, 0.0003, 2, angle=40)
    kit.paint(pull, 'brass')
    kit.finish(pull, 40)

    drawer = kit.join([fr, tray, cards, div, frame, pull], DRAWERS[i])
    kit.set_origin(drawer, (x, fy, z))
    lab = kit.plane(f'label{i}', lw - 0.006, lh - 0.007, loc=(x, fy - 0.0004, lz - 0.0006), key='label')
    kit.set_origin(lab, (x, fy, z))
    kit.parent(lab, drawer)

kit.join([body, plinth], 'cabinet')
kit.export(out, skip_uv=tuple(f'label{i}' for i in range(6)), ao=dict(dist=0.04, density=600, isolate=DRAWERS), anim=DRAWERS)
