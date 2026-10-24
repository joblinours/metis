import sys, os, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "kit"))
import kit

out = kit.args()[0]
kit.reset()

W, H, D = 0.17, 0.195, 0.21
LIFT = 0.006
FY = -D / 2

chassis = kit.slab('chassis', W, D, 0.004, H, rb=0.006, rt=0.006, segs=7, plan_segs=8, z0=LIFT)
kit.paint(chassis, 'bone')

PW, PH = 0.146, 0.172
PZ = LIFT + 0.012 + PH / 2
pocket = kit.slab('pocket', PW, PH, 0.006, 0.02, segs=1, plan_segs=8)
pocket.rotation_euler = (math.radians(90), 0, 0)
pocket.location = (0, FY + 0.006, PZ)
kit.apply_tf(pocket)
kit.paint(pocket, 'graphite')
kit.boolean(chassis, pocket, transfer=True)
kit.bevel(chassis, 0.0006, 3, angle=50)
kit.finish(chassis, 30)

badge = kit.badge('badge', 0.016, z0=LIFT + H - 0.0002, t=0.0011)
badge.location.y = -0.06
kit.apply_tf(badge)

BAY_W, BAY_H, BAY_GAP = 0.0305, 0.118, 0.0042
BAY_Z = LIFT + 0.016 + BAY_H / 2
span = 4 * BAY_W + 3 * BAY_GAP
SLED_D = 0.0062
for i in range(4):
    x = -span / 2 + BAY_W / 2 + i * (BAY_W + BAY_GAP)
    sled = kit.slab(f'bay{i}', BAY_W, BAY_H, 0.0025, SLED_D, rt=0.0008, segs=3, plan_segs=6)
    sled.rotation_euler = (math.radians(90), 0, 0)
    sled.location = (x, FY + 0.007, BAY_Z)
    kit.apply_tf(sled)
    slots = []
    for k in range(9):
        s = kit.slab('s', BAY_W * 0.56, 0.0016, 0.0008, 0.004, segs=1, plan_segs=3)
        s.rotation_euler = (math.radians(90), 0, 0)
        s.location = (x, FY + 0.0018, BAY_Z - 0.012 + k * 0.0062)
        kit.apply_tf(s)
        slots.append(s)
    cut = kit.join(slots, 'slots')
    kit.paint(cut, 'ink')
    kit.paint(sled, 'alu_dark', name='sled', rough=0.42)
    kit.boolean(sled, cut, transfer=True)
    kit.bevel(sled, 0.0002, 2, angle=50)
    kit.finish(sled, 30)
    grip = kit.slab('grip', BAY_W * 0.66, 0.0085, 0.0025, 0.0032, rt=0.0012, segs=3, plan_segs=6)
    grip.rotation_euler = (math.radians(90), 0, 0)
    grip.location = (x, FY + 0.0012, BAY_Z - BAY_H / 2 + 0.011)
    kit.apply_tf(grip)
    kit.paint(grip, 'brass')
    kit.finish(grip, 40, weighted=False)
    sled = kit.join([sled, grip], f'bay{i}')
    front = FY + 0.0008
    kit.set_origin(sled, (x, front, BAY_Z))
    lab = kit.plane(f'label{i}', BAY_W * 0.84, BAY_W * 0.84 * 72 / 256, loc=(x, front - 0.00008, BAY_Z + BAY_H / 2 - 0.012), key='label')
    kit.set_origin(lab, (x, front, BAY_Z))
    kit.parent(lab, sled)
    led = kit.cyl(f'led{i}', 0.0016, 0.0012, loc=(x, front - 0.0002, BAY_Z + BAY_H / 2 - 0.0255), rot=(math.radians(90), 0, 0), n=24)
    kit.paint(led, 'led', name=f'led{i}')
    kit.finish(led, 40, weighted=False)
    kit.set_origin(led, (x, front, BAY_Z))
    kit.parent(led, sled)

DZ = PZ + PH / 2 - 0.0195
frame = kit.slab('dispframe', 0.096, 0.026, 0.003, 0.0012, rt=0.0005, segs=2, plan_segs=6)
frame.rotation_euler = (math.radians(90), 0, 0)
frame.location = (-0.012, FY + 0.0062, DZ)
kit.apply_tf(frame)
kit.paint(frame, 'glass', name='bezel', rough=0.06)
kit.plane('display', 0.092, 0.023, loc=(-0.012, FY + 0.0049, DZ), key='screen')

pb = kit.cyl('power', 0.0052, 0.0016, loc=(0.054, FY + 0.0063, DZ), rot=(math.radians(90), 0, 0), n=48, bev=0.0004, segs=2)
kit.paint(pb, 'brass')
pbi = kit.cyl('power_in', 0.0036, 0.0014, loc=(0.054, FY + 0.0054, DZ), rot=(math.radians(90), 0, 0), n=48, bev=0.0004, segs=2)
kit.paint(pbi, 'graphite')
pled = kit.torus('power_led', 0.0044, 0.00045, loc=(0.054, FY + 0.0054, DZ), rot=(math.radians(90), 0, 0), n=48, m=8)
kit.paint(pled, 'led', name='power_led')
power = kit.join([pb, pbi], 'power')
kit.finish(power, 40, weighted=False)

feet = []
for fx in (-1, 1):
    for fy in (-1, 1):
        f = kit.slab('foot', 0.022, 0.022, 0.011, LIFT + 0.001, rb=0.0012, segs=3, plan_segs=8)
        f.location = (fx * (W / 2 - 0.022), fy * (D / 2 - 0.026), 0)
        kit.apply_tf(f)
        feet.append(f)
feet = kit.join(feet, 'feet')
kit.paint(feet, 'rubber')
kit.finish(feet, 40, weighted=False)

back = kit.plane('vent_back', 0.13, 0.12, loc=(0, D / 2 + 0.0002, LIFT + H * 0.55), facing='+Y', r=0.006, key='vent')
kit.planar_uv(back, lambda co: (co.x / 0.012, co.z / 0.012))

kit.join([chassis, frame, power, feet, badge, back], 'chassis')
BAYS = [f'bay{i}' for i in range(4)]
kit.export(out, skip_uv=('display',) + tuple(f'label{i}' for i in range(4)), ao=dict(dist=0.02, isolate=BAYS), anim=BAYS)
