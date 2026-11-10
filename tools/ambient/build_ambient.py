"""通过 Blender MCP 执行；保留原始 CampusLife，生成可独立运动的车辆和新版行人。"""
import bpy
import json
import math
from pathlib import Path
from collections import Counter
from mathutils import Vector
from mathutils.bvhtree import BVHTree

base = Path(PROJECT_ROOT)
limit = globals().get('PERSON_LIMIT', 36)
moving_limit = globals().get('MOVING_LIMIT', 13)
source = base / 'assets/blender/tongji-current.blend'
bpy.ops.wm.open_mainfile(filepath=str(source))
scene = bpy.data.scenes['Tongji_Current']
bpy.context.window.scene = scene
old = bpy.data.objects['CampusLife']
environment = bpy.data.objects['environment']
previous = bpy.data.collections.get('TJ_AmbientMotion')
if previous:
    for obj in list(previous.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.collections.remove(previous)
collection = bpy.data.collections.new('TJ_AmbientMotion')
scene.collection.children.link(collection)


def empty(name, parent):
    obj = bpy.data.objects.new(name, None)
    collection.objects.link(obj)
    obj.parent = parent
    obj['objectId'] = 'environment'
    return obj


def components(obj):
    mesh = obj.data
    adjacency = [[] for _ in mesh.vertices]
    for edge in mesh.edges:
        a, b = edge.vertices
        adjacency[a].append(b)
        adjacency[b].append(a)
    polygon_for_vertex = [[] for _ in mesh.vertices]
    for polygon in mesh.polygons:
        for index in polygon.vertices:
            polygon_for_vertex[index].append(polygon.index)
    visited = set()
    parts = []
    for vertex in mesh.vertices:
        if vertex.index in visited:
            continue
        stack = [vertex.index]
        visited.add(vertex.index)
        indices = []
        while stack:
            index = stack.pop()
            indices.append(index)
            for other in adjacency[index]:
                if other not in visited:
                    visited.add(other)
                    stack.append(other)
        faces = set(i for v in indices for i in polygon_for_vertex[v])
        points = [obj.matrix_world @ mesh.vertices[i].co for i in indices]
        low = Vector([min(v[k] for v in points) for k in range(3)])
        high = Vector([max(v[k] for v in points) for k in range(3)])
        materials = Counter(mesh.polygons[i].material_index for i in faces)
        parts.append(dict(ids=indices, faces=faces, center=(low + high) / 2,
                          size=high-low, material=materials.most_common(1)[0][0]))
    return parts


parts = components(old)
heads = [p for p in parts if old.data.materials[p['material']].name == 'Life_skin']
bodies = [p for p in parts if abs(p['center'].z-.9) < .001 and abs(p['size'].z-.72) < .001 and max(p['size'].x, p['size'].y) > 3]
assert len(heads) == 36 and len(bodies) == 13, '静态人车识别与当前源资产不符'
car_parts = [[] for _ in bodies]
people_parts = [[] for _ in heads]
for part in parts:
    distances = [(part['center'].xy-body['center'].xy).length for body in bodies]
    if min(distances) < 3.2:
        car_parts[distances.index(min(distances))].append(part)
    else:
        distances = [(part['center'].xy-head['center'].xy).length for head in heads]
        assert min(distances) < 1, '未归属的人车部件'
        people_parts[distances.index(min(distances))].append(part)
assert all(len(group) == 13 for group in car_parts)
assert all(len(group) == 6 for group in people_parts)
root = empty('campus_life', environment)
root['notice'] = '动态车辆与多样化行人氛围示意，不代表真实交通流量'


def subset(name, selected, parent, origin=Vector((0, 0, 0))):
    indices = sorted(set(i for part in selected for i in part['ids']))
    mapping = {old_index: new_index for new_index, old_index in enumerate(indices)}
    transform = parent.matrix_world.inverted()
    vertices = [(transform @ (old.matrix_world @ old.data.vertices[i].co)) - origin for i in indices]
    face_indices = sorted(set(i for part in selected for i in part['faces']))
    polygons = [[mapping[i] for i in old.data.polygons[f].vertices] for f in face_indices]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], polygons)
    for material in old.data.materials:
        mesh.materials.append(material)
    for face, original in zip(mesh.polygons, face_indices):
        face.material_index = old.data.polygons[original].material_index
        face.use_smooth = old.data.polygons[original].use_smooth
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.parent = parent
    obj.location = origin
    obj['objectId'] = 'environment'
    return obj


car_names = []
for index, (body, group) in enumerate(zip(bodies, car_parts)):
    car = empty(f'ambient_car_{index:02}', root)
    car.location = (body['center'].x, body['center'].y, 0)
    lamps = [p for p in group if old.data.materials[p['material']].name == 'Life_lamp']
    front = sum((p['center'] for p in lamps), Vector()) / len(lamps) - body['center']
    car.rotation_euler.z = math.atan2(front.y, front.x)
    car['vehicleId'] = car.name
    bpy.context.view_layer.update()
    tyres = [p for p in group if old.data.materials[p['material']].name == 'Life_rubber']
    wheel_parts = []
    for wheel_index, tyre in enumerate(tyres):
        matching = [p for p in group if old.data.materials[p['material']].name == 'Life_silver'
                    and (p['center'] - tyre['center']).length < .25]
        wheel_parts.extend([tyre, *matching])
        wheel = empty(f'{car.name}_wheel_{wheel_index}', car)
        wheel.location = car.matrix_world.inverted() @ tyre['center']
        wheel['wheel'] = True
        bpy.context.view_layer.update()
        subset(wheel.name+'_mesh', [tyre, *matching], wheel)
    remaining = [p for p in group if all(p is not w for w in wheel_parts)]
    subset(car.name+'_body', remaining, car)
    car_names.append(car.name)

people_root = empty('campus_people', root)
legacy = [p for group in people_parts[limit:] for p in group]
if legacy:
    subset('ambient_people_legacy', legacy, people_root)


def material(name, hex_color, roughness=.78):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    values = [int(hex_color[i:i+2], 16)/255 for i in (0, 2, 4)]
    values = [c/12.92 if c <= .04045 else ((c+.055)/1.055)**2.4 for c in values]
    mat.diffuse_color = (*values, 1)
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*values, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    return mat


coats = [material('Person_coat_'+str(i), color) for i, color in enumerate([
    'd5c6a3', '24425b', '9b6752', '65526e', '568078', 'dbdedb', '3e5363', '95846b', '758ca0', '714b50'])]
trousers = [material('Person_trouser_'+str(i), color) for i, color in enumerate(['26303a', '364e69', '877a67', '424448'])]
skins = [material('Person_skin_'+str(i), color, .6) for i, color in enumerate(['c78d67', 'e1b08b', '9a684c'])]
hair = material('Person_hair', '292522')
shoe = material('Person_shoes', '292c31', .6)
bag = material('Person_bag', '51463d')
collar = material('Person_collar', 'e9ebdf')
new_parts = []


def finish(obj, mat, parent):
    for linked in list(obj.users_collection):
        linked.objects.unlink(obj)
    collection.objects.link(obj)
    obj.parent = parent
    obj.data.materials.append(mat)
    obj['objectId'] = 'environment'
    new_parts.append(obj)
    return obj


def sphere(name, pos, size, mat, parent):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=1, location=pos)
    obj = bpy.context.object
    obj.name = name
    obj.scale = size
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return finish(obj, mat, parent)


def limb(name, start, end, radius, mat, parent):
    start, end = Vector(start), Vector(end)
    bpy.ops.mesh.primitive_cone_add(vertices=10, radius1=radius*.85, radius2=radius,
                                  depth=(end-start).length, location=(start+end)/2)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = (end-start).to_track_quat('Z', 'Y').to_euler()
    for polygon in obj.data.polygons:
        polygon.use_smooth = len(polygon.vertices) == 4
    return finish(obj, mat, parent)


def box(name, pos, size, mat, parent):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    obj = bpy.context.object
    obj.name = name
    obj.scale = size
    return finish(obj, mat, parent)


def torso(name, parent, mat, long_coat):
    outline = [(-.8,-1),(.8,-1),(1,-.6),(1,.6),(.8,1),(-.8,1),(-1,.6),(-1,-.6)]
    rings = [(.77 if long_coat else .94,.175,.12),(1.02,.16,.105),(1.32,.22,.12),(1.40,.15,.09)]
    vertices=[(x*w,y*d,z) for z,w,d in rings for x,y in outline]
    faces=[tuple(range(7,-1,-1))]
    for level in range(3):
        for j in range(8):
            a=level*8+j;b=level*8+(j+1)%8
            faces.append((a,b,b+8,a+8))
    faces.append(tuple(range(24,32)))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces)
    obj=bpy.data.objects.new(name,mesh);collection.objects.link(obj)
    return finish(obj,mat,parent)


positions = [Vector((head['center'].x, head['center'].y)) for head in heads]
# 保留原来的人群区域，小幅疏开过近站位，避免身体相互穿插。
for _ in range(45):
    for i in range(len(positions)):
        for j in range(i):
            difference = positions[i] - positions[j]
            distance = difference.length
            if 0 < distance < .75:
                correction = difference.normalized() * (.75-distance) * .5
                positions[i] += correction
                positions[j] -= correction
# 只投射低位铺地面，避免把门厅屋顶当作行人地面。
ground_vertices, ground_faces = [], []
for obj in scene.objects:
    if obj.type != 'MESH' or obj.get('floorId') or obj == old:
        continue
    for face in obj.data.polygons:
        if face.material_index >= len(obj.data.materials):
            continue
        mat_name = obj.data.materials[face.material_index].name.lower()
        if not any(word in mat_name for word in ['pavement', 'stone', 'road']):
            continue
        points = [obj.matrix_world @ obj.data.vertices[i].co for i in face.vertices]
        if max(p.z for p in points) > 2.5:
            continue
        start = len(ground_vertices)
        ground_vertices.extend(points)
        ground_faces.append(tuple(range(start, start+len(points))))
ground_tree = BVHTree.FromPolygons(ground_vertices, ground_faces)
for index, head in enumerate(heads[:limit]):
    person=empty(f'ambient_person_{index:02}', people_root)
    ground_hit = ground_tree.ray_cast(Vector((positions[index].x,positions[index].y,3)),Vector((0,0,-1)),5)[0]
    assert ground_hit is not None, '行人站位缺少铺地面'
    person.location=(positions[index].x,positions[index].y,ground_hit.z+.015)
    scale=.94+(index%7)*.018
    person.scale=(scale,scale,scale)
    person.rotation_euler.z=math.atan2(-28-head['center'].y,-head['center'].x)-math.pi/2+((index%5)-2)*.32
    coat=coats[index%len(coats)];pants=trousers[index%len(trousers)];skin=skins[index%len(skins)]
    stride=(.03,.13,.18,.07)[index%4]
    torso(person.name+'_jacket',person,coat,index%4==0)
    box(person.name+'_hips',(0,0,.87),(.30,.20,.20),pants,person)
    for side in [-1,1]:
        x=side*.105
        hip=(x,0,.87);knee=(x,side*stride*.6,.48);ankle=(x,side*stride,.12)
        limb(person.name+'_thigh',hip,knee,.085,pants,person)
        limb(person.name+'_shin',knee,ankle,.065,pants,person)
        sphere(person.name+'_shoe',(x,side*stride+.045,.065),(.073,.145,.065),shoe,person)
        shoulder=(side*.22,0,1.32);elbow=(side*.285,-side*stride*.5,1.08);wrist=(side*.29,-side*stride,.88)
        limb(person.name+'_sleeve',shoulder,elbow,.065,coat,person)
        limb(person.name+'_forearm',elbow,wrist,.049,skin if index%3==2 else coat,person)
        sphere(person.name+'_hand',wrist,(.045,.04,.063),skin,person)
    limb(person.name+'_neck',(0,0,1.40),(0,0,1.49),.06,skin,person)
    sphere(person.name+'_head',(0,.01,1.57),(.095,.10,.13),skin,person)
    sphere(person.name+'_hair',(0,-.015,1.665),(.101,.10,.065),hair,person)
    sphere(person.name+'_nose',(0,.103,1.575),(.023,.035,.027),skin,person)
    if index%3==1:
        sphere(person.name+'_long_hair',(0,-.07,1.565),(.106,.065,.14),hair,person)
    if index%4==0:
        pack=box(person.name+'_backpack',(0,-.175,1.13),(.27,.13,.34),bag,person)
        bpy.context.view_layer.objects.active=pack
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        bevel=pack.modifiers.new('Rounded fabric bag','BEVEL');bevel.width=.035;bevel.segments=3
        bpy.ops.object.modifier_apply(modifier=bevel.name)
        for side in [-1,1]:
            limb(person.name+'_strap',(side*.13,-.10,1.36),(side*.13,.10,1.08),.013,bag,person)
    box(person.name+'_collar',(0,.095,1.36),(.12,.018,.045),collar,person)

# 行人静态姿态按材质合并，避免36个人各自增加大量draw call。
bpy.context.view_layer.update()
material_groups = [(mat, [obj for obj in new_parts if obj.data.materials[0] == mat])
                   for mat in [*coats,*trousers,*skins,hair,shoe,bag,collar]]
for mat, objects in material_groups:
    if not objects:
        continue
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.object.join()
    joined=bpy.context.object
    matrix=joined.matrix_world.copy()
    joined.parent=people_root
    joined.matrix_world=matrix
    joined.name='pedestrians_'+mat.name
for obj in list(collection.objects):
    if obj.name.startswith('ambient_person_') and obj.type=='EMPTY' and not obj.children:
        bpy.data.objects.remove(obj,do_unlink=True)
old.hide_render=True
old.hide_set(True)

road=bpy.data.objects['environment_road']
lanes=[]
for offset,direction in [(-1.65,1),(1.65,-1)]:
    points=[]
    for index in range(0,384,4):
        a=road.matrix_world@road.data.vertices[index].co
        b=road.matrix_world@road.data.vertices[index+1].co
        point=(a+b)/2+(b-a).normalized()*offset
        points.append([round(point.x,5),0,round(-point.y,5)])
    if direction<0:
        points.reverse()
    lanes.append({'id':f'lane_{len(lanes)}','points':points})
vehicles=[{'node':name,'lane':index%2,'ordinal':index//2,'cruise':3.4+(index%6)*.42,
           'rhythm':13+(index*7)%19,'phase':index*.83,'stopFraction':(.12 if index%2==0 else .64)+(index%5)*.035,
           'dwell':3.5+(index%4)*1.4,'lapsBetweenStops':1+index%3}
          for index,name in enumerate(car_names[:moving_limit])]
metadata={'roadHalfWidth':4,'cars':13,'pedestrians':36,'mode':'animated-schematic','lanes':lanes,'vehicles':vehicles,
          'peopleUpgraded':limit,'notice':'道路路径从模型顶点提取；交通与人物仅为氛围演示，不代表真实人流车流'}
(base/'output/ambient-v2/ambient-life.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2))
# 输出先作为网页候选，不覆盖当前可用的源文件和运行GLB。
bpy.ops.wm.save_as_mainfile(filepath=str(base/'output/ambient-v2/tongji-ambient.blend'))
bpy.ops.object.select_all(action='DESELECT')
for obj in scene.objects:
    if obj != old and obj.type in {'MESH','EMPTY'}:
        obj.hide_set(False)
        obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(base/'public/scene/tongji-ambient-preview.glb'),export_format='GLB',
                         use_selection=True,use_active_scene=True,export_extras=True)
result={'cars':len(car_names),'peopleUpgraded':limit,'movingCars':moving_limit,
        'meshes':sum(obj.type=='MESH' for obj in collection.objects),
        'export':str(base/'public/scene/tongji-ambient-preview.glb')}
