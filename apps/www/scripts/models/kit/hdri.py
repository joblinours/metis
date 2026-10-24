import bpy, sys, math
import numpy as np

out = sys.argv[sys.argv.index("--") + 1]
W, H = 1024, 512

WARM = np.array([1.0, 0.975, 0.93])
COOL = np.array([0.94, 0.97, 1.0])

r = (np.arange(H) + 0.5) / H
c = (np.arange(W) + 0.5) / W
EL, AZ = np.meshgrid((0.5 - r) * math.pi, (c - 0.5) * 2 * math.pi, indexing="ij")
D = np.stack([np.cos(EL) * np.cos(AZ), np.sin(EL), np.cos(EL) * np.sin(AZ)], -1)

def unit(v):
    v = np.array(v, float)
    return v / np.linalg.norm(v)

def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)

def softbox(toward, w_deg, h_deg, power, tint=WARM, feather=0.18, hot=0.25, grad=(1.0, 1.0)):
    f = unit(toward)
    up0 = np.array([0, 1.0, 0]) if abs(f[1]) < 0.95 else np.array([0, 0, 1.0])
    rt = unit(np.cross(up0, f))
    up = np.cross(f, rt)
    z = D @ f
    zs = np.where(z > 1e-3, z, 1e-3)
    u = (D @ rt) / zs / math.tan(math.radians(w_deg) / 2)
    v = (D @ up) / zs / math.tan(math.radians(h_deg) / 2)
    m = smooth(1.0, 1.0 - feather, np.abs(u)) * smooth(1.0, 1.0 - feather, np.abs(v)) * (z > 0)
    m = m * (1 - hot + hot * (1 - np.clip(u * u + v * v, 0, 1)))
    g = grad[1] + (grad[0] - grad[1]) * np.clip(v * 0.5 + 0.5, 0, 1)
    return (m * g)[..., None] * power * tint

sky = np.interp(D[..., 1], [-1, -0.25, -0.02, 0.06, 0.4, 1], [0.34, 0.36, 0.3, 0.13, 0.12, 0.16])
img = sky[..., None] * np.array([1.0, 0.965, 0.91])
img += softbox((3.5, 6.0, 4.0), 50, 38, 9.0, hot=0.45)
img += softbox((0.0, 1.0, 0.1), 96, 80, 3.4, feather=0.35)
img += softbox((0.0, 0.3, 1.0), 96, 42, 2.4, feather=0.4, grad=(1.0, 0.15), hot=0.1)
img += softbox((-4.5, 1.2, 3.5), 30, 52, 1.8, COOL, feather=0.3)
img += softbox((-3.0, 0.9, -4.0), 10, 60, 7.0)
img += softbox((4.0, 0.9, -3.2), 10, 60, 6.0)

im = bpy.data.images.new("studio", W, H, alpha=False, float_buffer=True)
px = np.ones((H, W, 4), np.float32)
px[..., :3] = img[::-1]
im.pixels.foreach_set(px.ravel())
im.filepath_raw = out
im.file_format = "HDR"
im.save()
print("[hdri] wrote", out)
