import sys, os, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "kit"))
import bpy, bmesh, mathutils
import kit

out = kit.args()[0]
kit.reset()

W = 0.30
PROF = [(-0.075, 0.0), (0.075, 0.0), (0.075, 0.07), (0.0, 0.07), (-0.071, 0.014), (-0.075, 0.014)]
S0 = mathutils.Vector((0, -0.071, 0.014))
A = math.atan2(0.07 - 0.014, 0.071)
U = mathutils.Vector((0, math.cos(A), math.sin(A)))
N = mathutils.Vector((0, -math.sin(A), math.cos(A)))
SLEN = (mathutils.Vector((0, 0.0, 0.07)) - S0).length
JS, LS, TS = 0.044, 0.07, 0.019
GAP = 0.05

def at(x, s, h=0.0):
    return mathutils.Vector((x, 0, 0)) + S0 + U * s + N * h

def on_slope(ob, x, s, h=0.0):
    ob.rotation_euler = (A, 0, 0)
    kit.apply_tf(ob, loc=False)
    ob.location = at(x, s, h)
    kit.apply_tf(ob)
    return ob

bm = bmesh.new()
f = bm.faces.new([bm.verts.new((-W / 2, y, z)) for y, z in PROF])
r = bmesh.ops.extrude_face_region(bm, geom=[f])
bmesh.ops.translate(bm, verts=[g for g in r['geom'] if isinstance(g, bmesh.types.BMVert)], vec=(W, 0, 0))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
me = bpy.data.meshes.new('body'); bm.to_mesh(me); bm.free()
body = kit.link('body', me)
kit.paint(body, 'graphite')

FP_W, FP_S0, FP_S1 = W - 0.026, 0.007, SLEN - 0.008
pocket = kit.slab('fp_cut', FP_W, FP_S1 - FP_S0, 0.006, 0.01, segs=1, plan_segs=8, z0=-0.0015)
on_slope(pocket, 0, (FP_S0 + FP_S1) / 2)
kit.boolean(body, pocket)
kit.bevel(body, 0.0035, 5, angle=30)
kit.finish(body, 30)

face = kit.slab('faceplate', FP_W - 0.002, FP_S1 - FP_S0 - 0.002, 0.005, 0.002, rt=0.0006, segs=2, plan_segs=8, z0=-0.0015)
on_slope(face, 0, (FP_S0 + FP_S1) / 2)
kit.paint(face, 'bone')
cut = kit.join([on_slope(kit.cyl('jcut', 0.0047, 0.02, n=40), (i - 2) * GAP, JS) for i in range(5)], 'jcut')
kit.paint(cut, 'ink')
kit.boolean(face, cut, transfer=True)
kit.finish(face, 30)

jacks = []
for i in range(5):
    bez = kit.paint(kit.cyl('bezel', 0.0088, 0.0028, loc=(0, 0, 0.0014), n=48, bev=0.0008, segs=3), 'brass')
    kit.boolean(bez, kit.paint(kit.cyl('bhole', 0.0047, 0.01, n=40), 'ink'), transfer=True)
    nut = kit.cyl('nut', 0.0062, 0.0016, loc=(0, 0, 0.0035), n=6, bev=0.0003, segs=1)
    kit.boolean(nut, kit.cyl('nh', 0.0047, 0.01, n=40))
    kit.paint(nut, 'brass', name='brass_polish', rough=0.16)
    floor = kit.paint(kit.cyl('floor', 0.0048, 0.001, loc=(0, 0, -0.012), n=40), 'ink')
    j = on_slope(kit.join([bez, nut, floor], 'jack'), (i - 2) * GAP, JS)
    kit.finish(j, 40, weighted=False)
    jacks.append(j)
jacks = kit.join(jacks, 'jacks')

housings = []
for i in range(5):
    x = (i - 2) * GAP
    housings.append(kit.paint(on_slope(kit.cyl('ledh', 0.0038, 0.002, loc=(0, 0, 0.001), n=32, bev=0.0005, segs=2), x, LS), 'brass'))
    kit.paint(on_slope(kit.sphere(f'led{i}', 0.0026, loc=(0, 0, 0.0012), n=24), x, LS), 'led', name=f'led{i}')
    on_slope(kit.plane(f'label{i}', 0.04, 0.015, loc=(0, 0, 0.0007), facing='+Z', r=0.0015, key='label'), x, TS)
housings = kit.join(housings, 'ledhousings')

DY = 0.0335
frame = kit.slab('dispframe', 0.17, 0.028, 0.004, 0.0012, rt=0.0005, segs=2, plan_segs=6, z0=0.07 - 0.0004)
frame.location.y = DY
kit.apply_tf(frame)
kit.paint(frame, 'glass', name='bezel', rough=0.06)
kit.plane('display', 0.162, 0.0203, loc=(0, DY, 0.07 + 0.00085), facing='+Z', key='screen')

badge = on_slope(kit.badge('badge', 0.019), -0.124, JS, 0.0005)

toggle = kit.join([
    kit.cyl('tnut', 0.0058, 0.0024, loc=(0, 0, 0.0012), n=6, bev=0.0004, segs=1),
    kit.tube('bat', [(0, 0, 0.002), (0, 0.0012, 0.006), (0, 0.003, 0.011), (0, 0.0042, 0.016)], 0.0016, n=12),
    kit.sphere('battip', 0.0024, loc=(0, 0.0045, 0.0165), n=16),
], 'toggle')
kit.paint(toggle, 'steel', name='steel_polish', rough=0.14)
on_slope(toggle, 0.124, JS)
for p in toggle.data.polygons: p.use_smooth = True

feet = kit.join([kit.cyl('foot', 0.007, 0.004, loc=(fx * (W / 2 - 0.025), fy * 0.05, -0.0015), n=24, bev=0.001, segs=2) for fx in (-1, 1) for fy in (-1, 1)], 'feet')
kit.paint(feet, 'rubber')

for i in range(5):
    x = (i - 2) * GAP
    parts = [
        kit.paint(kit.cyl('sleeve', 0.0041, 0.014, loc=(0, 0, -0.005), n=32), 'brass'),
        kit.paint(kit.sphere('tip', 0.0034, loc=(0, 0, -0.0118), n=20), 'brass'),
        kit.paint(kit.cyl('collar', 0.0058, 0.003, loc=(0, 0, 0.0035), n=40, bev=0.0006, segs=2), 'brass'),
        kit.paint(kit.cyl('handle', 0.0074, 0.028, loc=(0, 0, 0.019), n=48, bev=0.0022, segs=4), 'bone'),
        kit.paint(kit.join([kit.torus('grip', 0.0074, 0.0007, loc=(0, 0, 0.012 + 0.0035 * k), n=40, m=8) for k in range(3)], 'grip'), 'graphite'),
    ]
    boot = kit.cyl('boot', 0.0048, 0.014, loc=(0, 0, 0.039), n=32)
    for v in boot.data.vertices:
        if v.co.z > 0.039:
            v.co.x *= 0.62; v.co.y *= 0.62
    parts.append(kit.paint(boot, 'rubber'))
    plug = on_slope(kit.join(parts, f'plug{i}'), x, JS)
    for p in plug.data.polygons: p.use_smooth = True
    p0 = at(x, JS) + N * 0.045
    side = (i - 2) * 0.012
    pts = [tuple(p0), tuple(p0 + N * 0.012), (x + side * 0.4, -0.112, 0.016), (x * 1.08 + side, -0.14, 0.0027), (x * 1.25 + side * 2, -0.21, 0.0026), (x * 1.45 + side * 3, -0.32, 0.0026), (x * 1.7 + side * 4, -0.5, 0.0026)]
    cable = kit.bezier_tube(f'cable{i}', pts, 0.0026, res=24, n=12)
    kit.paint(cable, 'graphite', name='cable', rough=0.55)
    for p in cable.data.polygons: p.use_smooth = True
    kit.set_origin(plug, tuple(at(x, JS)))
    kit.set_origin(cable, tuple(at(x, JS)))
    kit.parent(cable, plug)

kit.join([body, face, jacks, housings, frame, badge, toggle, feet], 'body')
PLUGS = [f'plug{i}' for i in range(5)]
kit.export(out, skip_uv=('display',) + tuple(f'label{i}' for i in range(5)), ao=dict(dist=0.015, isolate=PLUGS), anim=PLUGS)
