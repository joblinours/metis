import sys, os, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "kit"))
import bpy, bmesh, mathutils
import kit

out = kit.args()[0]
kit.reset()

W, H = 0.229, 0.162
T0 = 0.00035
P = 0.0013

def puff(x, y):
    u = 2 * x / W; v = 2 * y / H
    return P * max(0.0, 1 - u ** 4) * max(0.0, 1 - v ** 4)

paper = kit.mat('paper')
liner = kit.mat('liner')
address = kit.mat('label', name='address', rough=0.85)
stamp = kit.mat('label', name='stamp', rough=0.75)
letter = kit.mat('paper', name='letter', color=(0.93, 0.915, 0.88), rough=0.88)

def tile_uv(co):
    return (co.x / 0.07, co.y / 0.07)

bm = bmesh.new()
nx, ny = 56, 40
def grid(sign):
    vs = {}
    for i in range(nx + 1):
        for j in range(ny + 1):
            x = -W / 2 + W * i / nx; y = -H / 2 + H * j / ny
            vs[i, j] = bm.verts.new((x, y, sign * (T0 + puff(x, y))))
    for i in range(nx):
        for j in range(ny):
            q = [vs[i, j], vs[i + 1, j], vs[i + 1, j + 1], vs[i, j + 1]]
            bm.faces.new(q if sign > 0 else q[::-1])
    return vs
top = grid(1); bot = grid(-1)
ring = [(i, 0) for i in range(nx)] + [(nx, j) for j in range(ny)] + [(i, ny) for i in range(nx, 0, -1)] + [(0, j) for j in range(ny, 0, -1)]
for k in range(len(ring)):
    a = ring[k]; b = ring[(k + 1) % len(ring)]
    bm.faces.new([top[a], bot[a], bot[b], top[b]])
bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
me = bpy.data.meshes.new('body'); bm.to_mesh(me); bm.free()
body = kit.link('body', me)
kit.planar_uv(body, tile_uv)
me.materials.append(paper)

def on_back(ob, off, thick):
    for v in ob.data.vertices:
        v.co.z = T0 + puff(v.co.x, v.co.y) + off
    kit.solidify(ob, thick, offset=-1)

side_l = [(-W / 2, H / 2), (-W / 2, -H / 2), (-W * 0.115, -H * 0.02)]
side_r = [(x * -1, y) for x, y in side_l][::-1]
bottom = [(-W / 2, -H / 2), (W / 2, -H / 2), (W * 0.06, H * 0.09), (-W * 0.06, H * 0.09)]
parts = []
for name, pts, corners, off in [
    ('side_l', side_l, [0, 0, 0.012], 0.0003),
    ('side_r', side_r, [0.012, 0, 0], 0.0003),
    ('bottom', bottom, [0, 0, 0.02, 0.02], 0.0006),
]:
    ob = kit.poly_mesh(name, kit.round_poly(pts, 0, 6, corners), cuts=8)
    kit.planar_uv(ob, tile_uv)
    ob.data.materials.append(paper)
    on_back(ob, off, 0.00015)
    parts.append(ob)
flaps = kit.join(parts, 'flaps')

tip_y = -H * 0.075
flap = kit.poly_mesh('flap', kit.round_poly([(-W / 2, H / 2), (W / 2, H / 2), (0, tip_y)], 0, 8, [0, 0, 0.018]), cuts=10)
kit.planar_uv(flap, lambda co: (co.x / 0.04, co.y / 0.04))
flap.data.materials.append(paper)
flap.data.materials.append(liner)
for v in flap.data.vertices:
    v.co.z = T0 + puff(v.co.x, v.co.y) + 0.0009
kit.solidify(flap, 0.00015, offset=-1)
for p in flap.data.polygons:
    if p.normal.z < -0.5:
        p.material_index = 1

seal_c = mathutils.Vector((0, tip_y + 0.006, T0 + puff(0, tip_y + 0.006) + 0.0009))
blob = []
for k in range(96):
    t = 2 * math.pi * k / 96
    r = 0.0125 * (1 + 0.05 * math.sin(3 * t + 1) + 0.035 * math.sin(7 * t + 2) + 0.02 * math.sin(13 * t + 0.4))
    blob.append((r * math.cos(t), r * math.sin(t)))
seal = kit.extrude_poly('seal', blob, 0.0022)
kit.bevel(seal, 0.0009, 5, angle=40)
kit.boolean(seal, kit.cyl('dish', 0.0086, 0.002, loc=(0, 0, 0.0029), n=64))
rim = kit.extrude_poly('rim', kit.circle(0.0094, 64), 0.00035, z0=0.0019, holes=[kit.circle(0.0084, 64)])
frame = kit.extrude_poly('frame', kit.rounded_rect(0.0112, 0.0112, 0.0006, 3), 0.00042, z0=0.0017, holes=[kit.rounded_rect(0.0097, 0.0097, 0.0003, 3)])
mark = kit.glyph('mark', 0.0112, 0.0017, 0.00042)
seal = kit.join([seal, rim, frame, mark], 'seal')
kit.paint(seal, 'wax')
kit.finish(seal, 40)
seal.location = seal_c

fz = lambda x, y: -(T0 + puff(x, y))
aw, ah = W * 0.5, H * 0.34
ax, ay = -W * 0.06, -H * 0.13
addr = kit.poly_mesh('address', [(ax - aw / 2, ay - ah / 2), (ax + aw / 2, ay - ah / 2), (ax + aw / 2, ay + ah / 2), (ax - aw / 2, ay + ah / 2)], cuts=8)
for v in addr.data.vertices: v.co.z = fz(v.co.x, v.co.y) - 0.00006
kit.planar_uv(addr, lambda co: (0.5 - (co.x - ax) / aw, (co.y - ay) / ah + 0.5))
addr.data.materials.append(address)
kit.flip_down(addr)

sw, sh = 0.026, 0.031
sx, sy = -W / 2 + 0.024, H / 2 - 0.027
outline = []
def edge(p0, p1, n):
    a = mathutils.Vector(p0); b = mathutils.Vector(p1)
    d = b - a; t = d.normalized(); nrm = mathutils.Vector((t.y, -t.x))
    for k in range(n):
        for s in range(6):
            dip = math.sin(math.pi * s / 6) * 0.0009 if s > 0 else 0
            outline.append(tuple(a + d * ((k + s / 6) / n) + nrm * dip))
edge((sx - sw / 2, sy - sh / 2), (sx + sw / 2, sy - sh / 2), 9)
edge((sx + sw / 2, sy - sh / 2), (sx + sw / 2, sy + sh / 2), 11)
edge((sx + sw / 2, sy + sh / 2), (sx - sw / 2, sy + sh / 2), 9)
edge((sx - sw / 2, sy + sh / 2), (sx - sw / 2, sy - sh / 2), 11)
st = kit.poly_mesh('stamp', outline)
for v in st.data.vertices: v.co.z = fz(v.co.x, v.co.y) - 0.00012
kit.planar_uv(st, lambda co: (0.5 - (co.x - sx) / sw, (co.y - sy) / sh + 0.5))
st.data.materials.append(stamp)
kit.flip_down(st)
kit.solidify(st, 0.0001, offset=1)

lw, lh = 0.212, 0.148
let = kit.poly_mesh('letter', [(-lw / 2, -lh / 2), (lw / 2, -lh / 2), (lw / 2, lh / 2), (-lw / 2, lh / 2)], cuts=4)
kit.planar_uv(let, lambda co: (co.x / lw + 0.5, co.y / lh + 0.5))
let.data.materials.append(letter)
kit.solidify(let, 0.00015, offset=0)

kit.set_origin(flap, (0, H / 2, T0 + 0.0009))
seal.parent = flap
seal.location = seal_c - mathutils.Vector((0, H / 2, T0 + 0.0009))

for ob in (body, flaps, flap, addr, st, let):
    for p in ob.data.polygons: p.use_smooth = True
kit.export(out, ao=dict(dist=0.01, density=1400, isolate=['flap', 'letter'], skip=['address', 'stamp']), anim=['flap', 'letter'])
