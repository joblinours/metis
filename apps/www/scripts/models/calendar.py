import sys, os, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "kit"))
import bpy, mathutils
import kit

out = kit.args()[0]
kit.reset()

T = math.radians(70)
PW, PL, PT = 0.224, 0.17, 0.0042
SW, SL = 0.206, 0.152
TOPGAP = 0.0075
APEX_Z = PL * math.sin(T) + 0.002
APEX = mathutils.Vector((0, 0, APEX_Z))
BIND = APEX + mathutils.Vector((0, 0, -0.0005))
LEAVES = 4
HOLES = 23
PITCH = (SW - 0.012) / (HOLES - 1)

def tilt(ob, back=False):
    if back:
        ob.rotation_euler = (0, 0, math.radians(180))
        kit.apply_tf(ob, loc=False)
        ob.rotation_euler = (-T, 0, 0)
    else:
        ob.rotation_euler = (T, 0, 0)
    kit.apply_tf(ob, loc=False)
    ob.location = APEX
    kit.apply_tf(ob)
    return ob

def board(name, back=False):
    b = kit.slab(name, PW, PL, 0.006, PT, rb=0.0012, rt=0.0012, segs=3, plan_segs=8, z0=-PT)
    b.location.y = -PL / 2
    kit.apply_tf(b)
    kit.paint(b, 'graphite', name='cloth', rough=0.62, normal=('n_paper', 0.6, 0.02))
    kit.finish(b, 30)
    return tilt(b, back)

front = board('front')
backb = board('back', back=True)
spine = kit.cyl('spine', 0.0045, PW - 0.004, loc=(0, 0, APEX_Z - 0.0035), rot=(0, math.radians(90), 0), n=32)
kit.paint(spine, 'graphite', name='cloth')
kit.finish(spine, 50, weighted=False)

rail = kit.slab('rail', PW + 0.004, 0.009, 0.0015, 0.0035, rt=0.001, segs=3, plan_segs=4)
rail.location.y = -PL + 0.0045
kit.apply_tf(rail)
lip = kit.slab('lip', PW + 0.004, 0.0028, 0.0008, 0.009, rt=0.0012, segs=3, plan_segs=4)
lip.location.y = -PL + 0.0014
kit.apply_tf(lip)
rail = kit.join([rail, lip], 'rail')
kit.paint(rail, 'brass')
kit.finish(rail, 40)
tilt(rail)

def holes_cut(thick):
    cs = []
    for k in range(HOLES):
        c = kit.slab('h', 0.0034, 0.0028, 0.0009, thick + 0.004, segs=1, plan_segs=3, z0=-thick - 0.002)
        c.location = (-SW / 2 + 0.006 + k * PITCH, -TOPGAP + 0.0006, 0)
        kit.apply_tf(c)
        cs.append(c)
    return kit.join(cs, 'holes')

def sheet(name, thick, z_off):
    s = kit.slab(name, SW, SL, 0.0025, thick, segs=1, plan_segs=6, z0=-thick)
    s.location.y = -TOPGAP - SL / 2 + 0.0035
    kit.apply_tf(s)
    kit.boolean(s, holes_cut(thick))
    kit.paint(s, 'paper')
    s.location.z = z_off
    kit.apply_tf(s)
    return s

def face(name, z_off):
    fh = SL - 0.012
    return kit.plane(name, SW - 0.003, fh, loc=(0, -TOPGAP - 0.0085 - fh / 2 + 0.0035, z_off + 0.00004), facing='+Z', key='label', color=(0.93, 0.905, 0.84))

STACK_T = 0.0026
stack = sheet('stack', STACK_T, STACK_T)
sface = face(f'face{LEAVES}', STACK_T)
tilt(stack); tilt(sface)
kit.parent(sface, stack)

LT = 0.00035
for i in range(LEAVES):
    z = STACK_T + (LT + 0.00008) * (LEAVES - i)
    s = sheet(f'sheet{i}', LT, z)
    f = face(f'face{i}', z)
    tilt(s); tilt(f)
    e = bpy.data.objects.new(f'leaf{i}', None)
    bpy.context.collection.objects.link(e)
    e.location = BIND
    kit.parent(s, e)
    kit.parent(f, e)

backstack = sheet('backstack', 0.0018, 0.0018)
tilt(backstack, back=True)

loops = []
for k in range(HOLES):
    x = -SW / 2 + 0.006 + k * PITCH
    for dx in (-0.0009, 0.0009):
        loops.append(kit.torus('loop', 0.0072, 0.0005, loc=(x + dx, BIND.y, BIND.z), rot=(0, math.radians(90), 0), n=28, m=8))
wire = kit.join(loops, 'binding')
kit.paint(wire, 'brass', name='wire', rough=0.22)
for p in wire.data.polygons: p.use_smooth = True

feet = [kit.cyl('foot', 0.004, 0.0014, loc=(sx * (PW / 2 - 0.012), sy * (PL * math.cos(T) - 0.004), 0.0007), n=24) for sx in (-1, 1) for sy in (-1, 1)]
feet = kit.join(feet, 'feet')
kit.paint(feet, 'rubber')

kit.join([front, backb, spine, backstack, feet], 'stand')
LEAF_NAMES = [f'leaf{i}' for i in range(LEAVES)]
kit.export(out, skip_uv=tuple(f'face{i}' for i in range(LEAVES + 1)), ao=dict(dist=0.012, isolate=LEAF_NAMES), anim=LEAF_NAMES)
