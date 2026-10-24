import sys, os, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "kit"))
import kit

out = kit.args()[0]
kit.reset()

W, H, D = 0.05, 0.042, 0.019
KZ = 0.017
SPAN = 0.0148

def rot_x90(ob):
    ob.rotation_euler.x = math.radians(90)
    kit.apply_tf(ob)

prof = kit.round_poly([(-W / 2, 0), (W / 2, 0), (W / 2, H), (-W / 2, H)], 0, 12, [0.011, 0.011, 0.004, 0.004])
body = kit.extrude_poly('body', prof, D, z0=-D / 2)
rot_x90(body)
kit.bevel(body, 0.0022, 6, angle=50)
kit.paint(body, 'brass')

seam = kit.extrude_poly('seam', [(-W / 2 - 0.001, 0.0075), (W / 2 + 0.001, 0.0075), (W / 2 + 0.001, 0.0082), (-W / 2 - 0.001, 0.0082)], D + 0.002, z0=-D / 2 - 0.001)
rot_x90(seam)
inner = kit.extrude_poly('inner', kit.round_poly([(-W / 2 + 0.0004, 0.0), (W / 2 - 0.0004, 0.0), (W / 2 - 0.0004, H), (-W / 2 + 0.0004, H)], 0, 12, [0.0106, 0.0106, 0.0036, 0.0036]), D - 0.0008, z0=-D / 2 + 0.0004)
rot_x90(inner)
kit.boolean(seam, inner)
kit.paint(seam, 'brass_dk')
kit.boolean(body, seam, transfer=True)

c = kit.extrude_poly('c1', kit.circle(0.0049, 64, 0, KZ), 0.006, z0=-0.003)
rot_x90(c)
c.location.y = -D / 2
kit.apply_tf(c)
kit.paint(c, 'brass_dk')
kit.boolean(body, c, transfer=True)
back = kit.extrude_poly('keyback', kit.circle(0.0049, 64, 0, KZ), 0.003, z0=0)
rot_x90(back)
back.location.y = -D / 2 + 0.0031
kit.apply_tf(back)
kit.paint(back, 'brass_dk')
plug = kit.extrude_poly('plug', kit.circle(0.0046, 64, 0, KZ), 0.0028, z0=0)
kit.bevel(plug, 0.0003, 3, angle=40)
kit.paint(plug, 'steel')
slot = kit.extrude_poly('slot', kit.round_poly([(-0.00065, KZ - 0.0034), (0.00065, KZ - 0.0034), (0.00065, KZ + 0.0034), (-0.00065, KZ + 0.0034)], 0.0003, 3), 0.004, z0=-0.0012)
kit.paint(slot, 'ink')
kit.boolean(plug, slot, transfer=True)
rot_x90(plug)
plug.location.y = -D / 2 + 0.0003
kit.apply_tf(plug)

mark = kit.badge('mark', 0.0105, t=0.0004, glyph_key='brass_dk', plate_over=dict(name='brass_polish', rough=0.12))
rot_x90(mark)
mark.location = (0, -D / 2 + 0.0001, 0.0315)
kit.apply_tf(mark)

collars = [kit.cyl('collar', 0.0049, 0.0014, loc=(sx * SPAN, 0, H + 0.0005), n=48, bev=0.0004, segs=2) for sx in (-1, 1)]
col = kit.join(collars, 'collars')
kit.paint(col, 'steel')

body = kit.join([body, back, plug, mark, col], 'body')
kit.finish(body, 40)

top = H + 0.013
pts = [(-SPAN, 0, H - 0.017), (-SPAN, 0, top)]
for k in range(1, 32):
    a = math.pi - math.pi * k / 32
    pts.append((SPAN * math.cos(a), 0, top + SPAN * math.sin(a)))
pts += [(SPAN, 0, top), (SPAN, 0, H - 0.004)]
sh = kit.tube('shackle', pts, 0.0034, n=24)
kit.paint(sh, 'steel', name='steel_polish', rough=0.14)
for p in sh.data.polygons: p.use_smooth = True
kit.set_origin(sh, (-SPAN, 0, H))

blade_o = [(-0.0005, -0.0025), (0.026, -0.0025), (0.026, 0.0012), (0.0235, 0.0030), (0.021, 0.0012), (0.019, 0.0030), (0.016, 0.0016), (0.0135, 0.0030), (0.011, 0.0016), (0.0, 0.0016)]
blade = kit.extrude_poly('blade', blade_o, 0.0018, z0=-0.0009)
groove = kit.extrude_poly('groove', [(0.002, -0.0004), (0.025, -0.0004), (0.025, 0.0002), (0.002, 0.0002)], 0.001, z0=0.0005)
kit.boolean(blade, groove)
bow = kit.extrude_poly('bow', kit.circle(0.0095, 64, -0.0095, 0), 0.0024, z0=-0.0012, holes=[kit.circle(0.0028, 48, -0.0135, 0)])
collar = kit.extrude_poly('collar', kit.rounded_rect(0.003, 0.0062, 0.0008), 0.0026, z0=-0.0013)
collar.location.x = 0.0015
kit.apply_tf(collar)
key = kit.join([blade, bow, collar], 'key')
kit.bevel(key, 0.0003, 3, angle=40)
kit.paint(key, 'brass')
kit.finish(key, 40)
key.rotation_euler = (math.radians(90), 0, math.radians(90))
kit.apply_tf(key)
tip = max(v.co.y for v in key.data.vertices)
for v in key.data.vertices:
    v.co.y -= tip
hole_y = -0.0135 - tip

ring = kit.torus('ring', 0.0055, 0.00065, loc=(0, hole_y, -0.0032), rot=(math.radians(90), 0, 0), n=64, m=12)
kit.paint(ring, 'steel')
for p in ring.data.polygons: p.use_smooth = True

tag_o = kit.round_poly([(-0.012, -0.03), (0.012, -0.03), (0.012, -0.004), (0.0, 0.0025), (-0.012, -0.004)], 0, 6, [0.002, 0.002, 0.0015, 0.0015, 0.0015])
tag = kit.poly_mesh('tag', tag_o, cuts=3)
kit.planar_uv(tag, lambda co: (co.x / 0.024 + 0.5, (co.y + 0.03) / 0.0325))
tag.data.materials.append(kit.mat('card', name='tag'))
kit.solidify(tag, 0.0004, offset=0)
kit.boolean(tag, kit.extrude_poly('ecut', kit.circle(0.0014, 32, 0, -0.0012), 0.004, z0=-0.002))
eye = kit.extrude_poly('eyelet', kit.circle(0.0021, 32, 0, -0.0012), 0.0007, z0=-0.00035, holes=[kit.circle(0.0014, 32, 0, -0.0012)])
kit.paint(eye, 'brass')
kit.uv_box(eye)
for p in tag.data.polygons: p.use_smooth = False
for o in (tag, eye):
    o.rotation_euler = (math.radians(90), 0, 0)
    kit.apply_tf(o)
    o.location = (0, hole_y + 0.0004, -0.0032 - 0.0055 + 0.0012)
    kit.apply_tf(o)
kit.parent(eye, tag)

key = kit.join([key, ring], 'key')
tag.parent = key
key.location = (0, -D / 2 - 0.03, KZ)

kit.export(out, skip_uv=('tag',), ao=dict(dist=0.008, density=4000, min_diag=0.02, isolate=['key', 'shackle'], skip=['tag']), anim=['key', 'shackle'])
