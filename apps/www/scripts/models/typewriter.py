import sys, os, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "kit"))
import bpy, bmesh, mathutils
import kit

out = kit.args()[0]
kit.reset()

W = 0.29
BASE_H = 0.036
REAR_H = 0.068
DECK_Y0, DECK_Y1 = -0.117, 0.012
DECK_Z0, DECK_Z1 = 0.029, 0.052
SLOPE = math.atan2(DECK_Z1 - DECK_Z0, DECK_Y1 - DECK_Y0)

def deck_z(y):
    return DECK_Z0 + (y - DECK_Y0) * math.tan(SLOPE)

base = kit.slab('base', W, 0.25, 0.02, BASE_H, rb=0.004, rt=0.0065, segs=6, plan_segs=10)
base.location.y = -0.005
kit.apply_tf(base)
kit.paint(base, 'bone')
rear = kit.slab('rear', W, 0.112, 0.02, REAR_H, rb=0.004, rt=0.016, segs=7, plan_segs=10)
rear.location.y = 0.064
kit.apply_tf(rear)
kit.paint(rear, 'bone')

WY0, WY1 = DECK_Y0 - 0.002, DECK_Y1 + 0.01
well = kit.box('well', (W - 0.042, WY1 - WY0, 0.06), loc=(0, (WY0 + WY1) / 2, deck_z((WY0 + WY1) / 2) + 0.029))
well.rotation_euler.x = SLOPE
kit.apply_tf(well)
kit.paint(well, 'graphite')
kit.boolean(base, well, transfer=True)

pocket = kit.slab('pocket', 0.13, 0.052, 0.012, 0.05, segs=1, plan_segs=8, z0=REAR_H - 0.022)
pocket.location.y = 0.04
kit.apply_tf(pocket)
kit.paint(pocket, 'graphite')
kit.boolean(rear, pocket, transfer=True)
body = kit.join([base, rear], 'body')
kit.bevel(body, 0.0012, 3, angle=50)
kit.finish(body, 30)

deck = kit.slab('deck', W - 0.044, DECK_Y1 - DECK_Y0, 0.006, 0.004, rt=0.001, segs=2, plan_segs=6, z0=-0.004)
deck.rotation_euler.x = SLOPE
deck.location = (0, (DECK_Y0 + DECK_Y1) / 2, deck_z((DECK_Y0 + DECK_Y1) / 2))
kit.apply_tf(deck)
kit.paint(deck, 'graphite')
kit.finish(deck, 30)

ROWS = [(-0.029, 11, 0.0), (-0.052, 11, 0.0048), (-0.075, 11, 0.0096), (-0.098, 10, 0.0144)]
PITCH = 0.0196
CAP_R = 0.0071
KEYS = []
for ri, (y, n, off) in enumerate(ROWS):
    for i in range(n):
        x = (i - (n - 1) / 2) * PITCH + off - 0.006
        zt = deck_z(y) + 0.013 + ri * 0.0012
        cap = kit.slab(f'k{ri}_{i}', CAP_R * 2, CAP_R * 2, CAP_R - 1e-4, 0.0034, rt=0.0012, segs=3, plan_segs=6, z0=zt - 0.0034)
        cap.location = (x, y, 0)
        kit.apply_tf(cap)
        kit.paint(cap, 'graphite', name='keycap_tw', rough=0.38, coat=0.5)
        kit.finish(cap, 40, weighted=False)
        rim = kit.join([kit.paint(kit.torus('rim', CAP_R, 0.00085, loc=(x, y, zt - 0.0012), n=40, m=8), 'brass'), kit.paint(kit.cyl('stem', 0.0011, 0.016, loc=(x, y, zt - 0.0114), n=12), 'steel')], f'k{ri}_{i}_rim')
        for p in rim.data.polygons: p.use_smooth = True
        kit.set_origin(cap, (x, y, zt))
        kit.set_origin(rim, (x, y, zt))
        kit.parent(rim, cap)
        KEYS.append(cap.name)

SY = -0.117
SZ = deck_z(SY) + 0.011
space = kit.slab('space', 0.13, 0.009, 0.0045, 0.005, rt=0.0018, segs=3, plan_segs=6, z0=SZ - 0.005)
space.location.y = SY
kit.apply_tf(space)
kit.paint(space, 'graphite', name='keycap_tw')
parts = [space]
for sx in (-1, 1):
    parts.append(kit.paint(kit.cyl('sstem', 0.0013, 0.016, loc=(sx * 0.05, SY, SZ - 0.012), n=12), 'steel'))
    parts.append(kit.paint(kit.cyl('send', 0.0045, 0.0052, loc=(sx * 0.065, SY, SZ - 0.0025), n=24), 'brass'))
space = kit.join(parts, 'space')
kit.finish(space, 40, weighted=False)
kit.set_origin(space, (0, SY, SZ))

bars = []
FAN_C = mathutils.Vector((0, 0.07, REAR_H - 0.012))
for k in range(34):
    a = math.radians(-74 + 148 * k / 33)
    d = mathutils.Vector((math.sin(a), -math.cos(a), 0))
    p0 = FAN_C + d * 0.022
    p1 = FAN_C + d * 0.056 + mathutils.Vector((0, 0, -0.008))
    L = (p1 - p0).length
    b = kit.box('bar', (0.0014, L, 0.0016))
    b.rotation_euler = (-math.atan2(p1.z - p0.z, L), 0, a)
    b.location = (p0 + p1) / 2
    kit.apply_tf(b)
    bars.append(b)
bars.append(kit.cyl('segment', 0.026, 0.006, loc=(0, 0.07, REAR_H - 0.017), n=48))
basket = kit.join(bars, 'basket')
kit.paint(basket, 'steel', name='typebars', rough=0.3)

spools = []
for sx in (-1, 1):
    spools.append(kit.paint(kit.cyl('spool', 0.0185, 0.008, loc=(sx * 0.098, 0.04, REAR_H + 0.004), n=48, bev=0.0012, segs=3), 'graphite'))
    spools.append(kit.paint(kit.cyl('hub', 0.0065, 0.0105, loc=(sx * 0.098, 0.04, REAR_H + 0.0055), n=32, bev=0.0008, segs=2), 'brass'))
    spools.append(kit.paint(kit.cyl('ribbon_roll', 0.0145, 0.0092, loc=(sx * 0.098, 0.04, REAR_H + 0.0046), n=48), 'amber', name='ribbon', rough=0.7))
spools = kit.join(spools, 'spools')
kit.finish(spools, 40, weighted=False)

ribbon = kit.join([
    kit.paint(kit.box('ribbon_top', (0.17, 0.0006, 0.006), loc=(0, 0.057, REAR_H + 0.017)), 'amber', name='ribbon', rough=0.7),
    kit.paint(kit.box('ribbon_low', (0.17, 0.0006, 0.006), loc=(0, 0.057, REAR_H + 0.011)), 'ink', name='ribbon_ink', rough=0.7),
], 'ribbon')
guide = kit.slab('guide', 0.014, 0.004, 0.0015, 0.018, rt=0.001, segs=2, plan_segs=4, z0=REAR_H)
guide.location.y = 0.0575
kit.apply_tf(guide)
kit.paint(guide, 'steel')

badge = kit.badge('badge', 0.014)
badge.rotation_euler = (math.radians(90), 0, 0)
badge.location = (0, -0.1295, 0.0175)
kit.apply_tf(badge)

feet = kit.join([kit.cyl('foot', 0.008, 0.004, loc=(fx * (W / 2 - 0.03), fy * 0.1 + 0.005, 0.0005), n=24, bev=0.001, segs=2) for fx in (-1, 1) for fy in (-1, 1)], 'feet')
kit.paint(feet, 'rubber')

PY, PZ, PR = 0.078, REAR_H + 0.024, 0.0165
PL = 0.27
platen = kit.cyl('platen', PR, PL, loc=(0, PY, PZ), rot=(0, math.radians(90), 0), n=64, bev=0.002, segs=3)
kit.paint(platen, 'rubber', name='platen', rough=0.55)
kit.finish(platen, 40, weighted=False)
knobs = []
for sx in (-1, 1):
    knobs.append(kit.cyl('knob', 0.0135, 0.016, loc=(sx * (PL / 2 + 0.017), PY, PZ), rot=(0, math.radians(90), 0), n=48, bev=0.0025, segs=4))
    knobs.append(kit.cyl('axle', 0.004, 0.01, loc=(sx * (PL / 2 + 0.006), PY, PZ), rot=(0, math.radians(90), 0), n=16))
knobs = kit.paint(kit.join(knobs, 'knobs'), 'brass')
kit.finish(knobs, 40, weighted=False)

ends = []
for sx in (-1, 1):
    e = kit.slab('end', 0.058, 0.04, 0.012, 0.006, rt=0.002, rb=0.002, segs=3, plan_segs=8, z0=-0.003)
    e.rotation_euler = (math.radians(90), 0, math.radians(90))
    e.location = (sx * (PL / 2 + 0.002), PY + 0.012, PZ - 0.004)
    kit.apply_tf(e)
    ends.append(e)
ends = kit.paint(kit.join(ends, 'ends'), 'bone')
kit.finish(ends, 30)

rail = kit.paint(kit.cyl('rail', 0.003, PL + 0.03, loc=(0, PY + 0.03, REAR_H + 0.005), rot=(0, math.radians(90), 0), n=24), 'steel')
bail = kit.join([kit.cyl('bail', 0.0016, PL - 0.03, loc=(0, PY - 0.019, PZ + 0.014), rot=(0, math.radians(90), 0), n=16)] + [kit.box('arm', (0.003, 0.03, 0.004), loc=(sx * ((PL - 0.03) / 2), PY - 0.004, PZ + 0.009)) for sx in (-1, 1)], 'bail')
kit.paint(bail, 'steel')
rollers = kit.join([kit.cyl('roller', 0.0042, 0.012, loc=(sx * 0.06, PY - 0.019, PZ + 0.014), rot=(0, math.radians(90), 0), n=24, bev=0.0008, segs=2) for sx in (-1, 1)], 'rollers')
kit.paint(rollers, 'bone')

table_pts = [(PY + 0.018 + 0.05 * t, PZ + 0.004 + 0.09 * t - 0.025 * t * t) for t in (k / 24 for k in range(25))]
tbm = bmesh.new()
tl = [[tbm.verts.new((xs, y, z)) for y, z in table_pts] for xs in (-0.115, 0.115)]
for i in range(len(table_pts) - 1):
    tbm.faces.new([tl[0][i], tl[0][i + 1], tl[1][i + 1], tl[1][i]])
me = bpy.data.meshes.new('table'); tbm.to_mesh(me); tbm.free()
table = kit.link('table', me)
kit.solidify(table, 0.0018, offset=0)
kit.paint(table, 'bone')
kit.finish(table, 40, weighted=False)

SW = 0.16
LEAN = math.radians(12)
ARC = 24
PRINT_K = 16
path = [(PY + (PR + 0.0004) * math.cos(math.radians(235 - 105 * k / ARC)), PZ + (PR + 0.0004) * math.sin(math.radians(235 - 105 * k / ARC))) for k in range(ARC + 1)]
start = mathutils.Vector(path[-1])
dirv = mathutils.Vector((math.sin(LEAN), math.cos(LEAN)))
for k in range(1, 25):
    p = start + dirv * (0.115 * k / 24) + mathutils.Vector((0.003 * (k / 24) ** 2, 0))
    path.append((p.x, p.y))
lens = [0.0]
for a, b in zip(path, path[1:]):
    lens.append(lens[-1] + math.dist(a, b))
total = lens[-1]
sbm = bmesh.new()
cols = 8
grid = [[sbm.verts.new((-SW / 2 + SW * ci / cols, y, z)) for y, z in path] for ci in range(cols + 1)]
for ci in range(cols):
    for i in range(len(path) - 1):
        sbm.faces.new([grid[ci][i], grid[ci + 1][i], grid[ci + 1][i + 1], grid[ci][i + 1]])
me = bpy.data.meshes.new('sheet'); sbm.to_mesh(me); sbm.free()
sheet = kit.link('sheet', me)
uvl = me.uv_layers.new(name='UVMap')
for poly in me.polygons:
    poly.use_smooth = True
    for li in poly.loop_indices:
        v = me.vertices[me.loops[li].vertex_index].co
        j = min(range(len(path)), key=lambda j: (path[j][0] - v.y) ** 2 + (path[j][1] - v.z) ** 2)
        uvl.data[li].uv = ((v.x + SW / 2) / SW, lens[j] / total)
kit.paint(sheet, 'label', name='sheet', color=(0.94, 0.925, 0.89), rough=0.85)
sheet['printV'] = 1 - lens[PRINT_K] / total
sheet['aspect'] = total / SW
sheet['width'] = SW

LP = mathutils.Vector((-(PL / 2 + 0.002), PY + 0.004, PZ + 0.012))
lv = [LP + mathutils.Vector(v) for v in [(0, 0, 0), (-0.008, -0.012, 0.004), (-0.022, -0.03, 0.008), (-0.03, -0.05, 0.009)]]
lever = kit.join([
    kit.paint(kit.bezier_tube('lever', [tuple(p) for p in lv], 0.0022, res=16, n=12), 'brass'),
    kit.paint(kit.sphere('lknob', 0.0052, loc=tuple(lv[-1]), n=24), 'graphite', name='keycap_tw'),
    kit.paint(kit.cyl('lhub', 0.0055, 0.005, loc=tuple(LP), rot=(0, math.radians(90), 0), n=24, bev=0.0008, segs=2), 'brass'),
], 'lever')
for p in lever.data.polygons: p.use_smooth = True
kit.set_origin(lever, tuple(LP))

carriage = kit.join([platen, knobs, ends, rail, bail, rollers, table], 'carriage')
kit.set_origin(carriage, (0, PY, PZ))
kit.parent(sheet, carriage)
kit.parent(lever, carriage)

kit.join([body, deck, basket, spools, ribbon, guide, badge, feet], 'body')
kit.export(out, skip_uv=('sheet',), ao=dict(dist=0.02), anim=['carriage', 'lever', 'space'] + KEYS)
