import sys, os, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "kit"))
import mathutils
import kit

out = kit.args()[0]
kit.reset()

M = 0.0025
PT = 0.016
GZ0, GT = 0.026, 0.006
TEETH = [30, 16, 36, 12]
ANG = [None, -20, 25, -35]
PAWL_REST = math.radians(28)

plate = kit.slab('plate', 0.30, 0.20, 0.014, PT, rb=0.002, rt=0.003, segs=4, plan_segs=10)
kit.paint(plate, 'graphite')
kit.finish(plate, 30)

def outline(z, phase):
    r = M * z / 2
    rr, rt = r - 1.25 * M, r + M
    tau = 2 * math.pi / z
    prof = [(-0.5, rr), (-0.3, rr), (-0.24, rr + 0.25 * (rt - rr)), (-0.19, r), (-0.15, rt - 0.12 * (rt - rr)), (-0.11, rt),
            (0.11, rt), (0.15, rt - 0.12 * (rt - rr)), (0.19, r), (0.24, rr + 0.25 * (rt - rr)), (0.3, rr)]
    pts = []
    for k in range(z):
        c = phase + k * tau
        for f, rad in prof:
            pts.append((rad * math.cos(c + f * tau), rad * math.sin(c + f * tau)))
    return pts, rr

def gear(name, z, center, phase, spokes=0, cap='steel'):
    pts, rr = outline(z, phase)
    hub_r = max(0.0085, M * z * 0.12)
    if spokes:
        ro = rr - 0.0045
        inner = [(ro * math.cos(math.atan2(y, x)), ro * math.sin(math.atan2(y, x))) for x, y in pts]
        bits = [kit.ring_extrude(name, pts, inner, GT, z0=GZ0), kit.cyl('hub', hub_r + 0.003, GT * 0.8, loc=(0, 0, GZ0 + GT * 0.45), n=48)]
        L = ro - hub_r + 0.002
        for s in range(spokes):
            sp = kit.slab('spoke', L, 0.0034, 0.0012, GT * 0.8, segs=1, plan_segs=3, z0=GZ0 + GT * 0.05)
            sp.location.x = hub_r + L / 2 - 0.0005
            kit.apply_tf(sp)
            sp.rotation_euler.z = 2 * math.pi * s / spokes + 0.3
            kit.apply_tf(sp)
            bits.append(sp)
        g = kit.join(bits, name)
    else:
        g = kit.extrude_poly(name, pts, GT, z0=GZ0)
        kit.bevel(g, 0.0004, 2, angle=40)
    kit.paint(g, 'brass')
    kit.finish(g, 35)
    post = kit.cyl('post', 0.0045, GZ0 - PT + 0.001, loc=(0, 0, PT + (GZ0 - PT) / 2), n=32)
    kit.paint(post, 'steel')
    hc = kit.cyl('cap', hub_r, 0.0034, loc=(0, 0, GZ0 + GT + 0.0017), n=48, bev=0.0008, segs=3)
    kit.paint(hc, cap)
    parts = [g, hc]
    if cap == 'steel':
        slot = kit.box('slot', (hub_r * 1.4, 0.0009, 0.002), loc=(0, 0, GZ0 + GT + 0.0034))
        kit.paint(slot, 'ink')
        kit.boolean(hc, slot, transfer=True)
    else:
        jewel = kit.sphere('jewel', 0.0026, loc=(0, 0, GZ0 + GT + 0.0034), n=24)
        kit.paint(jewel, 'brass', name='brass_polish', rough=0.12)
        parts.append(jewel)
    kit.finish(hc, 40, weighted=False)
    g = kit.join(parts, name)
    for o in (g, post):
        o.location = (center[0], center[1], 0)
        kit.apply_tf(o)
    kit.set_origin(g, (center[0], center[1], GZ0 + GT / 2))
    return post

centers = [(-0.088, 0.012)]
for i in range(1, 4):
    d = M * (TEETH[i - 1] + TEETH[i]) / 2
    a = math.radians(ANG[i])
    centers.append((centers[-1][0] + d * math.cos(a), centers[-1][1] + d * math.sin(a)))
phases = [0.0]
for i in range(1, 4):
    th = math.radians(ANG[i])
    s1 = ((th - phases[-1]) * TEETH[i - 1] / (2 * math.pi)) % 1.0
    phases.append(th + math.pi - 2 * math.pi * (0.5 - s1) / TEETH[i])

posts = [gear(f'gear{i}', z, c, ph, spokes=5 if z >= 24 else 0, cap='amber' if i == 0 else 'steel') for i, (z, c, ph) in enumerate(zip(TEETH, centers, phases))]

g2c = mathutils.Vector((*centers[2], 0))
PV = g2c + mathutils.Vector((0.064, 0.036, 0))
tip_target = g2c + mathutils.Vector((0.03, 0.04, 0)).normalized() * (M * TEETH[2] / 2 + M * 0.6)
arm_dir = (tip_target - PV).normalized()
L = (tip_target - PV).length
PZ = GZ0 + GT / 2
arm = kit.slab('arm', L + 0.006, 0.0055, 0.0027, 0.0028, rt=0.0008, segs=2, plan_segs=6, z0=PZ - 0.0014)
arm.location.x = (L + 0.006) / 2 - 0.003
kit.apply_tf(arm)
tooth = kit.extrude_poly('ptooth', [(L - 0.001, -0.0028), (L + 0.004, 0.0), (L - 0.001, 0.0028)], 0.0028, z0=PZ - 0.0014)
tail = kit.slab('tail', 0.016, 0.0045, 0.0022, 0.0028, segs=1, plan_segs=4, z0=PZ - 0.0014)
tail.location.x = -0.007
kit.apply_tf(tail)
for o in (arm, tooth, tail):
    kit.paint(o, 'brass')
boss = kit.paint(kit.cyl('boss', 0.0052, 0.006, loc=(0, 0, PZ), n=40, bev=0.0006, segs=2), 'steel')
knob = kit.paint(kit.sphere('pknob', 0.0042, loc=(-0.012, 0, PZ + 0.006), n=24), 'bone')
kstem = kit.paint(kit.cyl('pkstem', 0.0013, 0.008, loc=(-0.012, 0, PZ + 0.002), n=12), 'steel')
pawl = kit.join([arm, tooth, boss, knob, kstem, tail], 'pawl')
kit.finish(pawl, 40)
pawl.rotation_euler.z = math.atan2(arm_dir.y, arm_dir.x) + PAWL_REST
pawl.location = PV
kit.apply_tf(pawl)
kit.set_origin(pawl, (PV.x, PV.y, PZ))
posts.append(kit.paint(kit.cyl('ppost', 0.0035, GZ0 - PT + 0.001, loc=(PV.x, PV.y, PT + (GZ0 - PT) / 2), n=24), 'steel'))

CX, CY = 0.098, -0.07
counter = kit.slab('counter', 0.07, 0.034, 0.005, 0.024, rt=0.003, segs=4, plan_segs=8, z0=PT)
counter.location = (CX, CY, 0)
kit.apply_tf(counter)
kit.paint(counter, 'bone')
cwin = kit.box('cwin', (0.056, 0.01, 0.0115), loc=(CX, CY - 0.017, PT + 0.012))
kit.paint(cwin, 'graphite')
kit.boolean(counter, cwin, transfer=True)
kit.finish(counter, 30)
drum = kit.paint(kit.cyl('drum', 0.0062, 0.054, loc=(CX, CY - 0.0085, PT + 0.012), rot=(0, math.radians(90), 0), n=48), 'paper', name='drum')
kit.plane('counter_face', 0.054, 0.0105, loc=(CX, CY - 0.0146, PT + 0.012), key='label', color=(0.93, 0.905, 0.84))
cknob = kit.paint(kit.cyl('cknob', 0.006, 0.006, loc=(CX + 0.038, CY, PT + 0.012), rot=(0, math.radians(90), 0), n=32, bev=0.0012, segs=3), 'brass')
kit.join([counter, drum, cknob], 'counter')

housings = []
for k in range(4):
    x, y = -0.126 + k * 0.022, -0.074
    housings.append(kit.paint(kit.cyl('lamph', 0.0052, 0.0024, loc=(x, y, PT + 0.0012), n=32, bev=0.0006, segs=2), 'brass'))
    kit.paint(kit.sphere(f'lamp{k}', 0.0034, loc=(x, y, PT + 0.0024), n=24), 'led_off', name=f'lamp{k}')
housings = kit.join(housings, 'lamphousings')

badge = kit.badge('badge', 0.017, z0=PT)
badge.location = (0.112, 0.074, 0)
kit.apply_tf(badge)

feet = kit.join([kit.cyl('foot', 0.008, 0.005, loc=(fx * 0.128, fy * 0.078, -0.0022), n=32, bev=0.0012, segs=2) for fx in (-1, 1) for fy in (-1, 1)], 'feet')
kit.paint(feet, 'brass')

kit.join([plate, housings, badge, feet] + posts, 'plate')
MOVING = [f'gear{i}' for i in range(4)] + ['pawl']
kit.export(out, skip_uv=('counter_face',), ao=dict(dist=0.015, isolate=MOVING), anim=MOVING)
