"""Bakes the 3D office's lighting in Blender (Cycles), for the page's baked-lighting mode. Run headless:

    blender -b -P office3d/bake/build_office.py -- <synty folder>/baked [samples] [size]

Input, from the page (?bake=export, see README.md): office-export.glb (the building and furniture that never
move) and office-lights.json (the page's sun, sky and room lights). It writes, beside them:

    office.glb                   the same building with a second UV set laid out for the lightmaps
    office-day.png, -night.png   how much light reaches each spot of the building's large surfaces (no
                                 surface colour: the page multiplies the textures by it), sRGB-encoded,
                                 over a scale; small and rounded pieces have theirs per corner, in
                                 office.glb (the vertex colour for day, the _NIGHT attribute for night)
    office-day-2k.png, ...       the same at half size, for phones
    office.json                  the scales and a version (the page asks for files by version)

Everything here is made from the Synty models: it stays on the host (private-assets/synty/baked/).
"""
import json
import math
import os
import sys
import time

import bpy
import numpy as np
from mathutils import Vector

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = os.path.abspath(ARGS[0]) if ARGS else os.getcwd()
SAMPLES = int(ARGS[1]) if len(ARGS) > 1 else 384
SIZE = int(ARGS[2]) if len(ARGS) > 2 else 4096
LIGHTS = json.load(open(os.path.join(OUT, "office-lights.json")))
# three.js lights to Cycles: a sun's intensity is its irradiance in both; a hemisphere light's
# intensity is irradiance, which a uniform sky gives at radiance intensity/pi; a point light's
# candela is power/(4 pi) (the page's lights fade as d^-1.6, Cycles' as d^-2: POINT_BOOST evens it out). The boosts were
# set by eye, comparing screenshots of the baked and live office (the bake has no ambient fill).
SUN_BOOST, SKY_BOOST, POINT_BOOST = 1.15, 4.0, 3.2
RECT_BOOST = 1.0  # a RectAreaLight's intensity is its radiance; a Blender area light's is power/(pi area)
# pieces smaller than SMALL (m) across, or rounded/curved ones (more than CURVED faces: their edges are
# a few lightmap texels wide and streak), are lit per corner; boxes, walls and floors get the lightmap
SMALL, CURVED = 0.6, 30


def b(v):
    """three.js (x, y up, z towards the camera) to Blender (x, -z, y)."""
    return Vector((v[0], -v[2], v[1]))


def linear(hex_color):
    c = [int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]


PIECES = []  # the per-corner object's pieces, as arrays of face indices


def pieces_of(mesh):
    """Faces joined by shared corners, as arrays of face indices."""
    import bmesh
    bm = bmesh.new(); bm.from_mesh(mesh); bm.faces.ensure_lookup_table()
    seen, out = set(), []
    for f in bm.faces:
        if f.index in seen:
            continue
        seen.add(f.index); stack, piece = [f], []
        while stack:
            g = stack.pop(); piece.append(g.index)
            for v in g.verts:
                for h in v.link_faces:
                    if h.index not in seen:
                        seen.add(h.index); stack.append(h)
        out.append(np.array(piece, np.int32))
    bm.free()
    return out


def split_small(office):
    """Moves the small or finely detailed pieces (furniture parts, books, rounded cushions) to their own
    object, which gets its light per corner: their lightmap pieces, and the margins around each, would
    fill any lightmap. Floors, walls and other large flat faces keep the lightmap. A piece is the faces joined by shared
    corners (flat-shaded models split corners, so their pieces are often single faces)."""
    import bmesh
    bm = bmesh.new(); bm.from_mesh(office.data); bm.faces.ensure_lookup_table()
    seen, small = set(), []
    for f in bm.faces:
        if f.index in seen:
            continue
        seen.add(f.index); stack, piece = [f], []
        while stack:
            g = stack.pop(); piece.append(g)
            for v in g.verts:
                for h in v.link_faces:
                    if h.index not in seen:
                        seen.add(h.index); stack.append(h)
        co = [v.co for g in piece for v in g.verts]
        size = max(max(c[i] for c in co) - min(c[i] for c in co) for i in range(3))
        if size < SMALL or len(piece) > CURVED:
            small += piece
    for f in bm.faces:
        f.select = False
    for f in small:
        f.select = True
    bm.to_mesh(office.data); bm.free()
    bpy.ops.object.select_all(action="DESELECT"); office.select_set(True); bpy.context.view_layer.objects.active = office
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.separate(type="SELECTED")
    bpy.ops.object.mode_set(mode="OBJECT")
    props = next(o for o in bpy.context.selected_objects if o != office)
    props.name = props.data.name = "props"
    # the models arrive with every triangle's corners apart: weld them, so faces can share their points
    bpy.ops.object.select_all(action="DESELECT"); props.select_set(True); bpy.context.view_layer.objects.active = props
    bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.remove_doubles(threshold=0.0001)
    bpy.ops.object.mode_set(mode="OBJECT")
    PIECES[:] = pieces_of(props.data)
    print(f"SPLIT {len(office.data.polygons)} faces lightmapped, {len(props.data.polygons)} lit per corner", flush=True)
    return props


def load():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, "office-export.glb"))
    for o in [o for o in bpy.data.objects if o.type != "MESH"]:
        bpy.data.objects.remove(o)
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
        if len(o.data.uv_layers) == 0:
            o.data.uv_layers.new(name="UVMap")
    bpy.ops.object.make_single_user(object=True, obdata=True, material=False)
    # One object, in real units: the Synty furniture keeps its centimetre meshes under a 0.01 scale.
    # Fewer objects is also fewer bake passes (Cycles re-syncs the whole scene for every object it bakes).
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    office = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    office.name = office.data.name = "arch"
    props = split_small(office)
    office.data.uv_layers.new(name="lightmap")
    office.data.uv_layers.active = office.data.uv_layers["lightmap"]
    bpy.ops.object.select_all(action="DESELECT"); office.select_set(True); bpy.context.view_layer.objects.active = office
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    # pieces sized by their real surface area, so floors and walls get their share
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.0, area_weight=0.0, scale_to_bounds=False)
    bpy.ops.uv.average_islands_scale()
    bpy.ops.uv.pack_islands(udim_source="CLOSEST_UDIM", rotate=True, margin_method="FRACTION", margin=3 / SIZE)
    bpy.ops.object.mode_set(mode="OBJECT")
    # the models' own vertex colours (all white) would be exported first and read as the day's light
    for ob in (office, props):
        for attr in list(ob.data.color_attributes):
            ob.data.color_attributes.remove(attr)
    for name in ("day", "night"):
        props.data.color_attributes.new(name, "FLOAT_COLOR", "CORNER")
    return office, props


def lights(when):
    for o in [o for o in bpy.data.objects if o.type == "LIGHT"]:
        bpy.data.objects.remove(o)
    sc = bpy.context.scene
    # the sky: the page's hemisphere light (sky colour above, ground colour below) plus its soft room
    # reflections (scene.environment), which add about as much again as their intensity
    sky = LIGHTS["sky"][when]
    world = bpy.data.worlds.get("sky") or bpy.data.worlds.new("sky")
    sc.world = world; world.use_nodes = True
    nt = world.node_tree; nt.nodes.clear()
    coord = nt.nodes.new("ShaderNodeTexCoord"); sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    ramp = nt.nodes.new("ShaderNodeMapRange")
    ramp.inputs["From Min"].default_value = -1.0; ramp.inputs["From Max"].default_value = 1.0
    mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"
    sock = lambda node, ident: next(x for x in list(node.inputs) + list(node.outputs) if x.identifier == ident)
    sock(mix, "A_Color").default_value = (*linear(sky["ground"]), 1); sock(mix, "B_Color").default_value = (*linear(sky["sky"]), 1)
    bg = nt.nodes.new("ShaderNodeBackground"); out = nt.nodes.new("ShaderNodeOutputWorld")
    bg.inputs["Strength"].default_value = (sky["intensity"] + sky["env"]) / math.pi * SKY_BOOST
    nt.links.new(coord.outputs["Generated"], sep.inputs["Vector"]); nt.links.new(sep.outputs["Z"], ramp.inputs["Value"])
    nt.links.new(ramp.outputs["Result"], mix.inputs["Factor"]); nt.links.new(sock(mix, "Result_Color"), bg.inputs["Color"])
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])
    # the sun, from where the page's sun is
    s = LIGHTS["sun"]
    sun = bpy.data.lights.new("sun", "SUN"); sun.energy = s[when]["intensity"] * SUN_BOOST; sun.angle = math.radians(2)
    sun.color = linear(s[when]["color"])
    so = bpy.data.objects.new("sun", sun); sc.collection.objects.link(so)
    so.rotation_euler = (b(s["to"]) - b(s["from"])).normalized().to_track_quat("-Z", "Y").to_euler()
    # the room lights (at night) and the neon signs' glow (always)
    for i, p in enumerate(LIGHTS["points"]):
        if when == "day" and not p["always"]:
            continue
        l = bpy.data.lights.new(f"point{i}", "POINT"); l.energy = p["intensity"] * 4 * math.pi * POINT_BOOST
        l.color = linear(p["color"]); l.shadow_soft_size = 0.25
        lo = bpy.data.objects.new(l.name, l); lo.location = b(p["at"]); sc.collection.objects.link(lo)
    # the page's soft panels (RectAreaLight; only on its HIGH quality)
    for i, r in enumerate(LIGHTS.get("rects", [])):
        if not r[when]:
            continue
        l = bpy.data.lights.new(f"panel{i}", "AREA"); l.shape = "RECTANGLE"; l.size = r["width"]; l.size_y = r["height"]
        l.energy = r[when] * math.pi * r["width"] * r["height"] * RECT_BOOST; l.color = linear(r["color"])
        lo = bpy.data.objects.new(l.name, l); lo.location = b(r["at"]); sc.collection.objects.link(lo)
        lo.rotation_euler = (b(r["to"]) - b(r["at"])).normalized().to_track_quat("-Z", "Y").to_euler()


def cycles():
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "OPTIX"; prefs.get_devices()
    for d in prefs.devices:
        d.use = d.type == "OPTIX"
    sc.cycles.device = "GPU"
    sc.cycles.samples = SAMPLES
    sc.cycles.max_bounces = 6; sc.cycles.diffuse_bounces = 4
    bk = sc.render.bake
    bk.use_pass_direct = True; bk.use_pass_indirect = True; bk.use_pass_color = False
    bk.margin = 4; bk.margin_type = "EXTEND"


def bake_arch(office, when):
    img = bpy.data.images.new(f"lm_{when}", SIZE, SIZE, float_buffer=True, alpha=True)
    img.generated_color = (0, 0, 0, 0)
    for slot in office.material_slots:
        nt = slot.material.node_tree
        node = nt.nodes.get("LM") or nt.nodes.new("ShaderNodeTexImage"); node.name = "LM"; node.image = img
        uv = nt.nodes.get("LMUV") or nt.nodes.new("ShaderNodeUVMap"); uv.name = "LMUV"; uv.uv_map = "lightmap"
        nt.links.new(uv.outputs["UV"], node.inputs["Vector"])
        nt.nodes.active = node
    bpy.ops.object.select_all(action="DESELECT"); office.select_set(True)
    bpy.context.view_layer.objects.active = office
    bpy.context.scene.render.bake.target = "IMAGE_TEXTURES"
    t = time.time()
    bpy.ops.object.bake(type="DIFFUSE")
    print(f"BAKED building, {when}, in {time.time() - t:.0f}s", flush=True)
    px = np.empty(SIZE * SIZE * 4, dtype=np.float32); img.pixels.foreach_get(px)
    px = px.reshape(SIZE, SIZE, 4)
    rgb, cover = px[..., :3], px[..., 3] > 0.5
    # a light blur inside each piece (weighted by coverage, so pieces don't bleed into each other)
    # takes out the last of the sampling noise
    w = cover.astype(np.float32)
    def blur(a):
        k = np.array([1, 2, 1], np.float32) / 4
        for axis in (0, 1):
            a = sum(np.roll(a, s, axis=axis) * kk for s, kk in zip((-1, 0, 1), k))
        return a
    ws = blur(w)
    smooth = blur(rgb * w[..., None]) / np.maximum(ws, 1e-6)[..., None]
    rgb = np.where(cover[..., None] & (ws[..., None] > 0.3), smooth, rgb)
    scale = float(np.percentile(rgb[cover].max(axis=1), 99.7)) or 1.0
    v = np.clip(rgb / scale, 0, 1)
    v = np.where(v <= 0.0031308, v * 12.92, 1.055 * np.power(v, 1 / 2.4) - 0.055)
    files = {}
    for suffix, n in (("", SIZE), ("-2k", SIZE // 2)):
        out = bpy.data.images.new(f"lm_{when}{suffix}", SIZE, SIZE, alpha=False)
        flat = np.concatenate([v, np.ones((SIZE, SIZE, 1), np.float32)], axis=2).ravel()
        out.pixels.foreach_set(flat)
        if n != SIZE:
            out.scale(n, n)
        path = os.path.join(OUT, f"office-{when}{suffix}.png")
        out.filepath_raw = path; out.file_format = "PNG"; out.save()
        files[suffix] = os.path.basename(path)
    bpy.data.images.remove(img)
    return {"scale": round(scale, 5), "small": True}


def bake_props(props, when):
    """The furniture's light, per corner, into its colour attribute for this time of day (stored as a
    fraction of a scale, so it fits a glTF colour)."""
    attrs = props.data.color_attributes
    # Cycles bakes into the active colour attribute: both "active" settings point at this time of day
    attrs.active_color = attrs[when]; attrs.render_color_index = attrs.find(when); attrs.active_color_index = attrs.find(when)
    bpy.ops.object.select_all(action="DESELECT"); props.select_set(True)
    bpy.context.view_layer.objects.active = props
    bpy.context.scene.render.bake.target = "VERTEX_COLORS"
    t = time.time()
    bpy.ops.object.bake(type="DIFFUSE")
    print(f"BAKED furniture, {when}, in {time.time() - t:.0f}s", flush=True)
    a = attrs[when]
    v = np.empty(len(a.data) * 4, dtype=np.float32); a.data.foreach_get("color", v)
    v = v.reshape(-1, 4)
    bad = ~np.isfinite(v[:, :3]).all(axis=1)
    print(f"CORNERS {when}: {len(v)} corners, {int(bad.sum())} not finite, max {np.nanmax(v[:, :3]):.3f}, p99.7 {np.nanpercentile(v[:, :3].max(axis=1), 99.7):.3f}", flush=True)
    # a corner touching another piece reads as fully shaded: none darker than half its face's brightest
    polys = props.data.polygons
    starts = np.empty(len(polys), np.int32); polys.foreach_get("loop_start", starts)
    counts = np.empty(len(polys), np.int32); polys.foreach_get("loop_total", counts)
    face_of = np.repeat(np.arange(len(polys)), counts)
    brightest = np.zeros((len(polys), 3), np.float32); np.maximum.at(brightest, face_of, v[:, :3])
    v[:, :3] = np.maximum(v[:, :3], 0.5 * brightest[face_of])
    # and no piece's face darker than 40% of the piece's typical light (faces pressed against another
    # piece, like a cushion's rounded edge, otherwise read as black stripes)
    piece = np.zeros(len(polys), np.int32)
    for i, faces in enumerate(PIECES):
        piece[faces] = i
    lum = v[:, :3].mean(axis=1)
    typical = np.zeros(len(PIECES), np.float32)
    order = np.argsort(piece[face_of], kind="stable"); groups = np.split(lum[order], np.cumsum(np.bincount(piece[face_of], minlength=len(PIECES)))[:-1])
    for i, g in enumerate(groups):
        typical[i] = np.median(g) if len(g) else 0
    floor = 0.4 * typical[piece[face_of]]
    lift = np.where(lum < floor, floor / np.maximum(lum, 1e-6), 1.0)
    v[:, :3] *= np.minimum(lift, 50)[:, None]
    scale = float(np.percentile(v[:, :3].max(axis=1), 99.7)) or 1.0
    v[:, :3] = np.clip(v[:, :3] / scale, 0, 1); v[:, 3] = 1
    a.data.foreach_set("color", v.ravel())
    return round(scale, 5)


def main():
    office, props = load()
    cycles()
    meta = {"version": time.strftime("%Y%m%d%H%M%S"), "size": SIZE, "samples": SAMPLES}
    for when in ("day", "night"):
        lights(when)
        meta[when] = bake_arch(office, when)
        meta[when]["props"] = bake_props(props, when)
    # Per point rather than per corner (averaged), so faces share their points and the file stays small.
    # Day's light is the vertex colour (glTF COLOR_0, three.js "color"); night's goes in a plain
    # attribute (glTF _NIGHT, three.js "_night"): with more than one vertex colour, the exporter makes
    # up a white COLOR_0 when no material uses one.
    mesh = props.data
    li = np.empty(len(mesh.loops), np.int32); mesh.loops.foreach_get("vertex_index", li)
    count = np.maximum(np.bincount(li, minlength=len(mesh.vertices)), 1)[:, None]
    point = {}
    for name in ("day", "night"):
        c = np.empty(len(mesh.loops) * 4, np.float32); mesh.color_attributes[name].data.foreach_get("color", c)
        total = np.zeros((len(mesh.vertices), 4), np.float32); np.add.at(total, li, c.reshape(-1, 4))
        point[name] = total / count
        mesh.color_attributes.remove(mesh.color_attributes[name])
    day = mesh.color_attributes.new("day", "FLOAT_COLOR", "POINT"); day.data.foreach_set("color", point["day"].ravel())
    night = mesh.attributes.new("_NIGHT", "FLOAT_VECTOR", "POINT"); night.data.foreach_set("vector", point["night"][:, :3].ravel())
    attrs = mesh.color_attributes
    attrs.active_color = attrs["day"]; attrs.render_color_index = attrs.find("day"); attrs.active_color_index = attrs.find("day")
    # the building with both UV sets; the bake nodes go
    for slot in office.material_slots:
        nt = slot.material.node_tree
        for name in ("LM", "LMUV"):
            if nt.nodes.get(name):
                nt.nodes.remove(nt.nodes[name])
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, "office.glb"), export_format="GLB", use_selection=False,
                              export_lights=False, export_cameras=False, export_vertex_color="ACTIVE", export_all_vertex_colors=False,
                              export_attributes=True, export_normals=False)  # the baked look needs no normals
    json.dump(meta, open(os.path.join(OUT, "office.json"), "w"), indent=1)
    print("DONE", json.dumps(meta), flush=True)


main()
