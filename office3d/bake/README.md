# Baked lighting for the 3D office

The office's building and furniture can be lit by Blender (Cycles) instead of the page's live lights:
soft bounced light, contact shadows, warm room lights at night. The page uses the bake when it finds
it on the server and falls back to its live lights when it doesn't. `?baked=0` shows the live lights.

The baked files are made from the Synty models, so they're licensed to the owner like the models:
they live only on the host, in `private-assets/synty/baked/`, never in git.

## Re-baking (after changing the office's layout, furniture or lights)

1. Serve the office locally with your Synty folder (127.0.0.1 only):

       python office3d/bake/serve.py <synty folder>

2. Open `http://127.0.0.1:8770/?bake=export&demo=1`. The page sends what doesn't move, and its lights,
   to `<synty folder>/baked/` (`office-export.glb`, `office-lights.json`).

3. Bake (Blender 5.2; about 3.5 minutes on an RTX 5060):

       blender -b -P office3d/bake/build_office.py -- <synty folder>/baked 512 4096

   It writes `office.glb`, `office-day.png`, `office-night.png`, their `-2k` versions for phones,
   and `office.json` (the lightmap scales, and a version the page asks for files by).

4. Check it at `http://127.0.0.1:8770/?demo=1` (and `&night=1`), then copy those five-plus files to
   `private-assets/synty/baked/` on the host. The page picks the new version up on its next load.

## How it works

- Large surfaces (floors, walls, boxes) get a lightmap on a second UV set. Small or rounded pieces
  (furniture parts, books, cushions) get their light per corner instead: their lightmap pieces would
  be a few texels wide. Day's light is the vertex colour; night's is a `_NIGHT` attribute.
- Lightmaps hold light only, not colour: the page multiplies each surface's own texture by them, so
  textures stay sharp and one 4096 lightmap covers the whole office.
- Agents, screens, LEDs, signs, glass and the rocket stay live, as does the tailored furniture whose
  look is in its material (leather, fabric, wood grain: sheen and bump maps), and the page's lights
  for them. Live things' shadows fall on an invisible shadow-only floor.
- The Blender lights are the page's own (read back from `setNight` when exporting), converted to
  Cycles' units; `SUN_BOOST`, `SKY_BOOST`, `POINT_BOOST` in `build_office.py` were set by eye against
  the live office.
