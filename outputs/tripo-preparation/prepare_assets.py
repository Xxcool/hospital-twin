# 仅通过 Blender MCP 执行：拆出装配参考与单体视图，不覆盖当前运行模型。
import bpy, json, math, hashlib
from pathlib import Path
from mathutils import Vector
# MCP exec 环境无固定 __file__，调用方显式传入仓库根目录。
if 'PROJECT_ROOT' not in globals():
    raise ValueError('请在 Blender MCP 执行前设置 PROJECT_ROOT 为仓库根目录')
base=Path(PROJECT_ROOT).resolve()/'outputs/tripo-preparation'
source=base.parent/'blender/tongji-current.blend'
if bpy.data.filepath != str(source): bpy.ops.wm.open_mainfile(filepath=str(source))
scene=bpy.context.scene
roots=['outpatient','emergency','children','inpatient','medtech','parking','environment','floor_f1','floor_f2','floor_roof']
groups={n:[bpy.data.objects[n],*bpy.data.objects[n].children_recursive] for n in roots}
links=[o for o in groups['medtech'] if o.name.startswith('ClinicalLink_')]
groups['clinical_links']=links
groups['medtech']=[o for o in groups['medtech'] if o not in links]
groups['zone_bindings']=[o for o in scene.objects if o.name.startswith('zone_')]
for n in ['floor_f1','floor_f2']: groups[n]=[o for o in groups[n] if not o.name.startswith('zone_')]
manifest={'source':str(source),'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'status':'preparation_only_not_submitted','units':'metres, photographic estimate','axes':'Blender X east Y north Z up; GLB X east Y up Z south','placement':'world coordinates preserved; do not recenter these assembly references','assets':[]}
for n,objs in groups.items():
    folder=base/'parts'/n; folder.mkdir(parents=True,exist_ok=True)
    for o in bpy.data.objects: o.select_set(False)
    for o in objs: o.hide_set(False); o.select_set(True)
    bpy.context.view_layer.objects.active=objs[0]
    bpy.ops.export_scene.gltf(filepath=str(folder/(n+'.glb')),export_format='GLB',use_selection=True,use_active_scene=True,export_extras=True)
    # Collection library keeps only the selected asset objects; mesh/material dependencies remain editable.
    c=bpy.data.collections.new('EXPORT_'+n)
    for o in objs: c.objects.link(o)
    bpy.data.libraries.write(str(folder/(n+'.blend')),{c},fake_user=True)
    bpy.data.collections.remove(c)
    points=[o.matrix_world@Vector(v) for o in objs if o.type=='MESH' for v in o.bound_box]
    lo=[min(v[i] for v in points) for i in range(3)]; hi=[max(v[i] for v in points) for i in range(3)]
    manifest['assets'].append({'id':n,'meshes':[o.name for o in objs if o.type=='MESH'],'bounds_blender':{'min':lo,'max':hi},'size':[hi[i]-lo[i] for i in range(3)],'glb':f'parts/{n}/{n}.glb','blend':f'parts/{n}/{n}.blend','views':[]})
(base/'asset-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
# Workbench references deliberately show existing geometry, not a new photoreal design promise.
scene.render.engine='BLENDER_WORKBENCH'
scene.display.shading.light='STUDIO'; scene.display.shading.color_type='MATERIAL'
scene.display.shading.show_shadows=True; scene.display.shading.show_cavity=True
scene.display.shading.background_type='WORLD'; scene.world.color=(0.85,0.88,0.92)
scene.render.resolution_x=1024; scene.render.resolution_y=768; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'; scene.render.film_transparent=False
cam=bpy.data.objects['TJ_Camera']; scene.camera=cam; cam.data.type='ORTHO'
for n in roots[:6]:
    meshes=[o for o in groups[n] if o.type=='MESH']
    for o in scene.objects:
        if o.type=='MESH': o.hide_render=o not in meshes
    entry=next(a for a in manifest['assets'] if a['id']==n)
    lo=Vector(entry['bounds_blender']['min']); hi=Vector(entry['bounds_blender']['max']); center=(lo+hi)*.5
    views={'front-three-quarter':Vector((1,-2,1.25))}
    if n=='outpatient': views.update({'front':Vector((0,-1,.18)),'back':Vector((0,1,.18)),'top':Vector((0,-.001,1))})
    for view,direction in views.items():
        cam.location=center+direction.normalized()*400
        cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
        bpy.context.view_layer.update()
        inverse=cam.matrix_world.inverted()
        pts=[inverse@(o.matrix_world@Vector(v)) for o in meshes for v in o.bound_box]
        width=max(p.x for p in pts)-min(p.x for p in pts); height=max(p.y for p in pts)-min(p.y for p in pts)
        cam.data.ortho_scale=max(width,height*1024/768)*1.16
        relative=f'parts/{n}/{view}.png'; scene.render.filepath=str(base/relative)
        bpy.ops.render.render(write_still=True)
        entry['views'].append(relative)
(base/'asset-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
# Restore the authoritative scene and all its saved visibility/camera settings.
bpy.ops.wm.open_mainfile(filepath=str(source))
result={'assets':len(manifest['assets']),'views':sum(len(a['views']) for a in manifest['assets']),'manifest':str(base/'asset-manifest.json'),'source_unchanged':hashlib.sha256(source.read_bytes()).hexdigest()==manifest['source_sha256']}
