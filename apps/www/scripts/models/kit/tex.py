import sys, math
import numpy as np
import bpy

outdir = sys.argv[sys.argv.index("--") + 1]
N = 512

def filt(sx, sy):
    fx = np.fft.fftfreq(N)[None, :]
    fy = np.fft.fftfreq(N)[:, None]
    return np.exp(-((fx * sx) ** 2 + (fy * sy) ** 2))

def field(sx, sy, seed):
    r = np.random.default_rng(seed).standard_normal((N, N))
    h = np.real(np.fft.ifft2(np.fft.fft2(r) * filt(sx, sy)))
    return (h - h.mean()) / (h.std() + 1e-9)

def normal_from(h, k):
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5 * k
    gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5 * k
    n = np.stack([-gx, -gy, np.ones_like(h)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5

def lin_to_srgb(v):
    return np.where(v <= 0.0031308, v * 12.92, 1.055 * np.power(np.maximum(v, 0), 1 / 2.4) - 0.055)

def save(name, rgb):
    im = bpy.data.images.new(name, N, N, alpha=False)
    px = np.ones((N, N, 4), np.float32)
    px[..., :3] = rgb[::-1]
    im.pixels.foreach_set(px.ravel())
    im.filepath_raw = f"{outdir}/{name}.png"
    im.file_format = "PNG"
    im.save()

yy, xx = np.mgrid[0:N, 0:N].astype(np.float32) + 0.5

def holes(pitch, rad, bg, fg, hexed=True):
    best = np.full((N, N), 1e9, np.float32)
    for j in range(-1, N // pitch + 2):
        off = (pitch / 2) * (j % 2) if hexed else 0
        for i in range(-1, N // pitch + 2):
            best = np.minimum(best, np.hypot(xx - (i * pitch + off), yy - j * pitch))
    m = np.clip((rad + 0.75 - best) / 1.5, 0, 1)[..., None]
    return bg * (1 - m) + fg * m

def lines(a, period, width):
    d = np.abs(((a % period) + period) % period - period / 2)
    return np.clip((width - (period / 2 - d)) / 1.2 + 0.5, 0, 1)

save("n_grain", normal_from(field(3, 3, 1) * 0.7 + field(9, 9, 2) * 0.3, 0.6))
save("n_brushed", normal_from(field(90, 1.2, 3) * 0.85 + field(4, 4, 4) * 0.15, 0.5))
save("n_peel", normal_from(field(14, 14, 5) * 0.7 + field(4, 4, 6) * 0.3, 0.35))
save("n_paper", normal_from(field(12, 3, 8) * 0.45 + field(2.5, 2.5, 9) * 0.55, 0.5))

save("c_grille", lin_to_srgb(holes(32, 11.5, np.array([0.80, 0.80, 0.81]), np.array([0.02, 0.02, 0.02]))))
save("c_vent", lin_to_srgb(holes(32, 11.0, np.array([0.034, 0.032, 0.03]), np.array([0.003, 0.003, 0.003]), hexed=False)))

lat = np.maximum(lines(xx + yy, 64, 1.6), lines(xx - yy, 64, 1.6))[..., None]
save("c_liner", lin_to_srgb(np.array([0.036, 0.034, 0.032]) * (1 - lat) + np.array([0.52, 0.36, 0.14]) * lat))

jit = np.random.default_rng(11).uniform(0.9, 1.02, N)[None, :, None]
stripe = (np.sin(xx / 4.0 * math.pi) ** 8)[..., None]
save("c_cards", lin_to_srgb(np.array([0.90, 0.86, 0.77]) * jit * (1 - 0.35 * stripe)))
print("[tex] wrote", outdir)
