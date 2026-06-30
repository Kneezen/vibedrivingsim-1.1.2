import trimesh
import os

files = [
    "/home/kneezen/Downloads/Models/city.glb",
    "/home/kneezen/Downloads/Models/new_york_city.glb",
    "/home/kneezen/Downloads/Models/low_poly_city_pack.glb",
    "/home/kneezen/Downloads/Models/procedural_city_5.glb",
    "/home/kneezen/Downloads/Models/procedural_city_3.glb",
    "/home/kneezen/Downloads/city/source/Untitled.glb"
]

print(f"{'Filename':<25} | {'Size (MB)':<10} | {'Faces':<10} | {'Vertices':<10} | {'Extents (X, Y, Z)':<35}")
print("-" * 100)

for f in files:
    if not os.path.exists(f):
        print(f"Not found: {f}")
        continue
    size_mb = os.path.getsize(f) / (1024 * 1024)
    name = os.path.basename(f)
    try:
        scene = trimesh.load(f)
        if isinstance(scene, trimesh.Scene):
            faces = sum(len(g.faces) for g in scene.geometry.values())
            vertices = sum(len(g.vertices) for g in scene.geometry.values())
            extents = scene.extents
        else:
            faces = len(scene.faces)
            vertices = len(scene.vertices)
            extents = scene.extents
            
        extents_str = f"{extents[0]:.1f}, {extents[1]:.1f}, {extents[2]:.1f}"
        print(f"{name:<25} | {size_mb:<10.2f} | {faces:<10} | {vertices:<10} | {extents_str:<35}")
    except Exception as e:
        print(f"{name:<25} | {size_mb:<10.2f} | Error: {e}")
