import bpy, bmesh, math, mathutils, os, sys

TEX = os.environ.get('KIT_TEX', os.path.join(os.path.dirname(__file__), 'tex'))

def args():
    return sys.argv[sys.argv.index("--") + 1:]

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    MATS.clear()

def link(name, me):
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob

def activate(ob):
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob

def apply_mods(ob):
    activate(ob)
    for m in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)

def apply_tf(ob, loc=True):
    activate(ob)
    bpy.ops.object.transform_apply(location=loc, rotation=True, scale=True)

def set_origin(ob, point):
    activate(ob)
    bpy.context.scene.cursor.location = point
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    bpy.context.scene.cursor.location = (0, 0, 0)

def join(obs, name):
    obs = [o for o in obs if o]
    for o in obs:
        if o.type == 'MESH' and not o.data.uv_layers:
            uv_box(o)
    activate(obs[0])
    for o in obs[1:]:
        o.select_set(True)
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    ob.data.name = name
    return ob

def parent(child, par):
    bpy.context.view_layer.update()
    mw = child.matrix_world.copy()
    child.parent = par
    child.matrix_parent_inverse = par.matrix_world.inverted()
    child.matrix_world = mw

def remove(ob):
    bpy.data.objects.remove(ob, do_unlink=True)

MATS = {}

PALETTE = {
    'bone':      dict(color=(0.80, 0.745, 0.65), rough=0.46, normal=('n_peel', 0.12, 0.03), coat=0.25),
    'paper':     dict(color=(0.88, 0.845, 0.76), rough=0.9, normal=('n_paper', 0.25, 0.04)),
    'card':      dict(color=(0.78, 0.70, 0.56), rough=0.86, normal=('n_paper', 0.3, 0.04)),
    'graphite':  dict(color=(0.034, 0.032, 0.03), rough=0.48, normal=('n_peel', 0.18, 0.03)),
    'alu':       dict(color=(0.86, 0.86, 0.865), rough=0.36, metal=1.0, normal=('n_grain', 0.05, 0.02)),
    'alu_dark':  dict(color=(0.13, 0.13, 0.135), rough=0.4, metal=1.0, normal=('n_grain', 0.05, 0.02)),
    'brass':     dict(color=(0.80, 0.575, 0.27), rough=0.3, metal=1.0, normal=('n_brushed', 0.08, 0.03)),
    'brass_dk':  dict(color=(0.42, 0.29, 0.13), rough=0.42, metal=1.0),
    'steel':     dict(color=(0.62, 0.62, 0.63), rough=0.24, metal=1.0, normal=('n_brushed', 0.1, 0.03)),
    'rubber':    dict(color=(0.022, 0.021, 0.02), rough=0.78),
    'glass':     dict(color=(0.003, 0.003, 0.0035), rough=0.04),
    'ink':       dict(color=(0.023, 0.02, 0.016), rough=0.62),
    'amber':     dict(color=(0.43, 0.2, 0.016), rough=0.38, coat=0.4),
    'wax':       dict(color=(0.26, 0.085, 0.008), rough=0.36, coat=0.3),
    'led':       dict(color=(0.1, 0.05, 0.01), rough=0.3, emission=(1.0, 0.56, 0.14), strength=6.0),
    'led_off':   dict(color=(0.06, 0.04, 0.02), rough=0.25),
    'label':     dict(color=(0.93, 0.905, 0.84), rough=0.8),
    'screen':    dict(color=(0.0, 0.0, 0.0), rough=0.2),
    'keycap':    dict(color=(0.011, 0.011, 0.012), rough=0.56),
    'grille':    dict(rough=0.45, metal=1.0, ctex=('c_grille', 0.0128)),
    'vent':      dict(rough=0.5, ctex=('c_vent', 0.012)),
    'liner':     dict(rough=0.7, ctex=('c_liner', 0.04)),
    'cards':     dict(rough=0.9, ctex=('c_cards', 0.06)),
}

def _img(name, color=False):
    key = f"{name}.png"
    im = bpy.data.images.get(key)
    if im is None:
        im = bpy.data.images.load(f"{TEX}/{name}.png")
        im.colorspace_settings.name = 'sRGB' if color else 'Non-Color'
    return im

def mat(key, name=None, **over):
    name = name or key
    if name in MATS:
        return MATS[name]
    spec = dict(PALETTE.get(key, {}))
    spec.update(over)
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*spec.get('color', (0.8, 0.8, 0.8)), 1)
    p.inputs['Roughness'].default_value = spec.get('rough', 0.5)
    p.inputs['Metallic'].default_value = spec.get('metal', 0.0)
    if spec.get('coat'):
        p.inputs['Coat Weight'].default_value = spec['coat']
        p.inputs['Coat Roughness'].default_value = 0.12
    if spec.get('emission'):
        p.inputs['Emission Color'].default_value = (*spec['emission'], 1)
        p.inputs['Emission Strength'].default_value = spec.get('strength', 1.0)
    if spec.get('ctex'):
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = _img(spec['ctex'][0], color=True)
        nt.links.new(t.outputs['Color'], p.inputs['Base Color'])
    n = spec.get('normal')
    if n:
        tname, strength, _tile = n
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = _img(tname)
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nm.inputs['Strength'].default_value = strength
        nt.links.new(t.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], p.inputs['Normal'])
    m['tile'] = spec['ctex'][1] if spec.get('ctex') else (n[2] if n else 0.05)
    MATS[name] = m
    return m

def paint(ob, key, **over):
    ob.data.materials.clear()
    ob.data.materials.append(mat(key, **over))
    return ob

def round_poly(pts, radius, segs=6, corners=None):
    out = []
    n = len(pts)
    for i in range(n):
        p0 = mathutils.Vector(pts[i - 1]); p1 = mathutils.Vector(pts[i]); p2 = mathutils.Vector(pts[(i + 1) % n])
        r = radius if corners is None else corners[i]
        if r <= 0:
            out.append(tuple(p1)); continue
        a = (p0 - p1).normalized(); b = (p2 - p1).normalized()
        ang = a.angle(b)
        d = r / math.tan(ang / 2)
        d = min(d, (p0 - p1).length * 0.45, (p2 - p1).length * 0.45)
        s = p1 + a * d; e = p1 + b * d
        for k in range(segs + 1):
            t = k / segs
            q = (1 - t) ** 2 * s + 2 * (1 - t) * t * p1 + t ** 2 * e
            out.append(tuple(q))
    return out

def rounded_rect(w, h, r, segs=8):
    pts = [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)]
    return round_poly(pts, r, segs)

def circle(r, n=48, cx=0.0, cy=0.0):
    return [(cx + r * math.cos(2 * math.pi * k / n), cy + r * math.sin(2 * math.pi * k / n)) for k in range(n)]

def extrude_poly(name, pts2d, depth, z0=0.0, holes=()):
    bm = bmesh.new()
    vs = [bm.verts.new((x, y, z0)) for x, y in pts2d]
    f = bm.faces.new(vs)
    if f.normal.z < 0:
        f.normal_flip()
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    nv = [g for g in r['geom'] if isinstance(g, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=nv, vec=(0, 0, depth))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    ob = link(name, me)
    for h in holes:
        cut = extrude_poly('cut', h, depth + 0.02, z0=z0 - 0.01)
        boolean(ob, cut)
    return ob

def ring_extrude(name, outer, inner, depth, z0=0.0):
    bm = bmesh.new()
    n = len(outer)
    ob_ = [bm.verts.new((x, y, z0)) for x, y in outer]
    ot = [bm.verts.new((x, y, z0 + depth)) for x, y in outer]
    ib = [bm.verts.new((x, y, z0)) for x, y in inner]
    it = [bm.verts.new((x, y, z0 + depth)) for x, y in inner]
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new([ot[i], ot[j], it[j], it[i]])
        bm.faces.new([ob_[j], ob_[i], ib[i], ib[j]])
        bm.faces.new([ob_[i], ob_[j], ot[j], ot[i]])
        bm.faces.new([ib[j], ib[i], it[i], it[j]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    return link(name, me)

def poly_mesh(name, pts2d, cuts=0):
    bm = bmesh.new()
    vs = [bm.verts.new((x, y, 0)) for x, y in pts2d]
    bm.faces.new(vs)
    bmesh.ops.triangulate(bm, faces=bm.faces[:], quad_method='BEAUTY', ngon_method='BEAUTY')
    if cuts:
        bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=cuts, use_grid_fill=True)
        bmesh.ops.beautify_fill(bm, faces=bm.faces[:], edges=bm.edges[:])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    return link(name, me)

def box(name, size, loc=(0, 0, 0), r=0.0, bev=None, segs=3):
    w, d, h = size
    if r > 0:
        ob = extrude_poly(name, rounded_rect(w, d, r, 8), h, z0=-h / 2)
    else:
        bpy.ops.mesh.primitive_cube_add(size=1)
        ob = bpy.context.view_layer.objects.active
        ob.name = name
        ob.scale = (w, d, h)
        apply_tf(ob)
    ob.location = loc
    apply_tf(ob)
    if bev:
        bevel(ob, bev, segs)
    return ob

def cyl(name, r, h, loc=(0, 0, 0), rot=(0, 0, 0), n=48, bev=None, segs=3):
    bpy.ops.mesh.primitive_cylinder_add(vertices=n, radius=r, depth=h)
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    ob.rotation_euler = rot
    ob.location = loc
    apply_tf(ob)
    if bev:
        bevel(ob, bev, segs)
    return ob

def torus(name, R, r, loc=(0, 0, 0), rot=(0, 0, 0), n=48, m=16):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=n, minor_segments=m)
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    ob.rotation_euler = rot
    ob.location = loc
    apply_tf(ob)
    return ob

def sphere(name, r, loc=(0, 0, 0), n=48):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=n, ring_count=n // 2, radius=r)
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    ob.location = loc
    apply_tf(ob)
    return ob

def _curve_mesh(name, cu):
    ob = bpy.data.objects.new(name, cu)
    bpy.context.collection.objects.link(ob)
    activate(ob)
    bpy.ops.object.convert(target='MESH')
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    return ob

def tube(name, pts, r, n=16, closed=False):
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = r
    cu.bevel_resolution = max(2, n // 4)
    cu.use_fill_caps = True
    sp = cu.splines.new('NURBS' if len(pts) > 3 else 'POLY')
    sp.points.add(len(pts) - 1)
    for i, p in enumerate(pts):
        sp.points[i].co = (*p, 1)
    if sp.type == 'NURBS':
        sp.use_endpoint_u = True
        sp.order_u = 4
        sp.resolution_u = 24
    sp.use_cyclic_u = closed
    return _curve_mesh(name, cu)

def bezier_tube(name, pts, r, res=24, n=12):
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = r
    cu.bevel_resolution = max(2, n // 4)
    cu.use_fill_caps = True
    sp = cu.splines.new('BEZIER')
    sp.bezier_points.add(len(pts) - 1)
    for i, p in enumerate(pts):
        bp = sp.bezier_points[i]
        bp.co = p
        bp.handle_left_type = 'AUTO'
        bp.handle_right_type = 'AUTO'
    sp.resolution_u = res
    return _curve_mesh(name, cu)

def slab(name, w, d, r, h, rb=0.0, rt=0.0, segs=6, plan_segs=10, z0=0.0):
    prof = []
    if rb > 0:
        for k in range(segs + 1):
            a = k / segs * math.pi / 2
            prof.append((rb * (1 - math.sin(a)), rb * (1 - math.cos(a))))
    else:
        prof.append((0.0, 0.0))
    if rt > 0:
        for k in range(segs + 1):
            a = k / segs * math.pi / 2
            prof.append((rt * (1 - math.cos(a)), h - rt + rt * math.sin(a)))
    else:
        prof.append((0.0, h))
    bm = bmesh.new()
    loops = []
    for inset, z in prof:
        pts = rounded_rect(w - 2 * inset, d - 2 * inset, max(r - inset, 1e-5), plan_segs)
        loops.append([bm.verts.new((x, y, z0 + z)) for x, y in pts])
    for a, b in zip(loops, loops[1:]):
        n = len(a)
        for i in range(n):
            j = (i + 1) % n
            try:
                bm.faces.new([a[i], a[j], b[j], b[i]])
            except ValueError:
                pass
    bm.faces.new(list(reversed(loops[0])))
    bm.faces.new(loops[-1])
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-7)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    return link(name, me)

def boolean(ob, cutter, op='DIFFERENCE', keep=False, transfer=False):
    m = ob.modifiers.new('b', 'BOOLEAN')
    m.object = cutter
    m.operation = op
    m.solver = 'EXACT'
    if transfer:
        m.material_mode = 'TRANSFER'
    apply_mods(ob)
    if not keep:
        remove(cutter)
    return ob

def solidify(ob, t, offset=-1):
    m = ob.modifiers.new('sol', 'SOLIDIFY')
    m.thickness = t
    m.offset = offset
    m.use_even_offset = True
    apply_mods(ob)
    return ob

def flip_down(ob):
    bm = bmesh.new(); bm.from_mesh(ob.data)
    for f in bm.faces:
        if f.normal.z > 0:
            f.normal_flip()
    bm.to_mesh(ob.data); bm.free()
    return ob

def bevel(ob, width, segs=3, angle=30, limit='ANGLE'):
    m = ob.modifiers.new('bev', 'BEVEL')
    m.width = width
    m.segments = segs
    m.limit_method = limit
    if limit == 'ANGLE':
        m.angle_limit = math.radians(angle)
    m.profile = 0.6
    m.miter_outer = 'MITER_ARC'
    apply_mods(ob)
    return ob

def finish(ob, angle=32, weighted=True):
    activate(ob)
    for p in ob.data.polygons:
        p.use_smooth = True
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle), keep_sharp_edges=True)
    except Exception:
        bpy.ops.object.shade_smooth()
    if weighted:
        m = ob.modifiers.new('wn', 'WEIGHTED_NORMAL')
        m.keep_sharp = True
        m.mode = 'FACE_AREA'
        m.weight = 50
        apply_mods(ob)
    return ob

def uv_box(ob, tile=None):
    if ob.type != 'MESH' or not ob.data.polygons:
        return
    if tile is None:
        ms = [m for m in ob.data.materials if m]
        tile = ms[0].get('tile', 0.05) if ms else 0.05
    activate(ob)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    sc = ob.matrix_world.to_scale()
    bpy.ops.uv.cube_project(cube_size=tile / max(1e-6, (sc.x + sc.y + sc.z) / 3), correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')

FACING = {
    '-Y': (math.radians(90), 0, 0),
    '+Z': (0, 0, 0),
    '+Y': (math.radians(-90), 0, math.radians(180)),
    '-X': (math.radians(90), 0, math.radians(-90)),
    '+X': (math.radians(90), 0, math.radians(90)),
}

def plane(name, w, h, loc=(0, 0, 0), facing='-Y', r=0.0, key='label', **over):
    pts = rounded_rect(w, h, r, 6) if r > 0 else [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)]
    ob = poly_mesh(name, pts)
    planar_uv(ob, lambda co: (co.x / w + 0.5, co.y / h + 0.5))
    paint(ob, key, name=name, **over)
    ob.rotation_euler = FACING[facing] if isinstance(facing, str) else facing
    ob.location = loc
    apply_tf(ob)
    return ob

def planar_uv(ob, fn):
    me = ob.data
    uv = me.uv_layers.new(name='UVMap') if not me.uv_layers else me.uv_layers[0]
    for poly in me.polygons:
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            uv.data[li].uv = fn(co)

MARK_TRIS = [
    [(128, 127.5), (49.25, 193.751), (49.25, 61.2491)],
    [(128, 127.5), (206.75, 61.2491), (206.75, 193.751)],
]

def mark_tris(size):
    s = size / 256.0
    return [[((x - 128) * s, (128 - y) * s) for x, y in tri] for tri in MARK_TRIS]

def glyph(name, size, z0, depth):
    return join([extrude_poly(name, tri, depth, z0=z0) for tri in mark_tris(size)], name)

def badge(name, size, z0=0.0, t=0.0012, plate='brass', glyph_key='ink', plate_over=None, glyph_over=None):
    p = slab(f'{name}_plate', size, size, size * 0.05, t, rt=min(0.0005, t * 0.4), segs=2, plan_segs=4, z0=z0)
    paint(p, plate, **(plate_over or {}))
    g = glyph(f'{name}_glyph', size, z0 + t - 0.0002, 0.00023)
    paint(g, glyph_key, **(glyph_over or {}))
    ob = join([p, g], name)
    finish(ob, 40, weighted=False)
    return ob

def ensure_uvs(skip=()):
    for ob in bpy.data.objects:
        if ob.type == 'MESH' and ob.name not in skip and not ob.data.uv_layers:
            uv_box(ob)

def _gpu():
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
    except Exception:
        return None
    for t in ('OPTIX', 'CUDA', 'HIP', 'METAL'):
        try:
            prefs.compute_device_type = t
            prefs.get_devices()
        except Exception:
            continue
        if any(d.type == t for d in prefs.devices):
            for d in prefs.devices:
                d.use = d.type == t
            return t
    return None

def _area(ob):
    return sum(p.area for p in ob.data.polygons) * (ob.matrix_world.to_scale().length / math.sqrt(3)) ** 2

def bake_ao(skip=(), dist=0.02, samples=256, density=900, min_diag=0.035, max_res=512, isolate=()):
    moved = []
    for i, n in enumerate(isolate):
        o = bpy.data.objects.get(n)
        if o:
            moved.append((o, o.location.copy()))
            o.location = o.location + mathutils.Vector((3.0 * (i + 1), 6.0, 0))
    bpy.context.view_layer.update()
    try:
        _bake_ao(skip, dist, samples, density, min_diag, max_res)
    finally:
        for o, loc in moved:
            o.location = loc
        bpy.context.view_layer.update()

def _bake_ao(skip, dist, samples, density, min_diag, max_res):
    from io_scene_gltf2.blender.com.material_helpers import create_settings_group, get_gltf_node_name
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    dev = _gpu()
    sc.cycles.device = 'GPU' if dev else 'CPU'
    sc.cycles.samples = samples
    if sc.world is None:
        sc.world = bpy.data.worlds.new('w')
    sc.world.light_settings.distance = dist
    sc.render.bake.margin = 8
    group = bpy.data.node_groups.get(get_gltf_node_name()) or create_settings_group(get_gltf_node_name())
    done = 0
    for ob in list(bpy.data.objects):
        if ob.type != 'MESH' or ob.name in skip or not ob.data.polygons:
            continue
        mats = [m for m in ob.data.materials if m]
        if not mats or all(m.name in skip for m in mats):
            continue
        if max(ob.dimensions) < min_diag:
            continue
        res = 2 ** int(round(math.log2(max(128, min(max_res, math.sqrt(_area(ob)) * density)))))
        if not ob.data.uv_layers:
            uv_box(ob)
        base_uv = ob.data.uv_layers[0].name
        lay = ob.data.uv_layers.new(name='AO')
        ob.data.uv_layers.active = lay
        activate(ob)
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.008, area_weight=0.0, scale_to_bounds=True)
        bpy.ops.object.mode_set(mode='OBJECT')
        img = bpy.data.images.new(f'ao_{ob.name}', res, res, alpha=False)
        img.colorspace_settings.name = 'Non-Color'
        restore = []
        for slot in ob.material_slots:
            if not slot.material:
                continue
            temp = slot.material.name in skip
            m = slot.material.copy()
            if temp:
                restore.append((slot, slot.material, m))
            m.name = f'{slot.material.name}@{ob.name}'
            slot.material = m
            nt = m.node_tree
            t = nt.nodes.new('ShaderNodeTexImage')
            t.image = img
            uvn = nt.nodes.new('ShaderNodeUVMap')
            uvn.uv_map = 'AO'
            nt.links.new(uvn.outputs['UV'], t.inputs['Vector'])
            if not temp:
                sep = nt.nodes.new('ShaderNodeSeparateColor')
                nt.links.new(t.outputs['Color'], sep.inputs['Color'])
                gn = nt.nodes.new('ShaderNodeGroup')
                gn.node_tree = group
                nt.links.new(sep.outputs['Red'], gn.inputs['Occlusion'])
            for n in nt.nodes:
                n.select = False
            t.select = True
            nt.nodes.active = t
        bpy.ops.object.bake(type='AO', use_clear=True, margin=8)
        for slot, orig, tmp in restore:
            slot.material = orig
            bpy.data.materials.remove(tmp)
        img.pack()
        ob.data.uv_layers.active = ob.data.uv_layers[base_uv]
        for l in ob.data.uv_layers:
            l.active_render = l.name == base_uv
        done += 1
    print(f'[ao] baked {done} objects on {dev or "CPU"}')

AO_SKIP_MATS = ('screen', 'menubar', 'display', 'led', 'glass', 'bezel', 'sheet', 'touchid', 'label', 'face', 'lamp')

def wrap(names):
    bpy.context.view_layer.update()
    for n in names:
        ob = bpy.data.objects.get(n)
        if ob is None or ob.type != 'MESH' or ob.children:
            continue
        mw = ob.matrix_world.copy()
        par = ob.parent
        ob.name = f'{n}_mesh'
        e = bpy.data.objects.new(n, None)
        bpy.context.collection.objects.link(e)
        e.empty_display_size = 0.01
        if par:
            e.parent = par
            e.matrix_parent_inverse = par.matrix_world.inverted()
        e.matrix_world = mw
        bpy.context.view_layer.update()
        ob.parent = e
        ob.matrix_parent_inverse = e.matrix_world.inverted()
        ob.matrix_world = mw
    bpy.context.view_layer.update()

def export(path, skip_uv=(), ao=None, anim=()):
    ensure_uvs(skip_uv)
    if ao is not None and os.environ.get('KIT_NO_AO') != '1':
        skip = set(skip_uv) | set(ao.pop('skip', ()))
        for m in bpy.data.materials:
            if m.name.startswith(AO_SKIP_MATS):
                skip.add(m.name)
        bake_ao(skip=skip, **ao)
    wrap(anim)
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        export_image_format='WEBP',
        export_apply=True,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
        export_extras=True,
    )
    print('[kit] exported', path)
