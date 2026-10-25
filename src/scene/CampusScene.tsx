// 只消费Blender MCP导出的资产；负责日夜、巡游、楼层展开、拾取与相机生命周期。
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { regions, type Frame, type RegionId } from '../data/model';

export type SceneMode = 'overview' | 'region' | 'tour' | 'floor' | 'rotate';
interface Manifest {
  model: string;
  camera: { position: [number, number, number]; target: [number, number, number]; orthoHeight: number };
  tour: RegionId[];
  floors: { root: string; groups: Record<string, string>; explode: Record<string, number>; back: Record<string, number> };
}
export interface PerformanceSample { fps: number; p95: number; calls: number; triangles: number; geometries: number; textures: number; loadMs: number; dpr: number }
export interface SceneHandle { home: () => void; focus: (id: RegionId) => void; zoom: (direction: number) => void }
interface Props {
  selected: RegionId | null; frame: Frame; mode: SceneMode; floor: 'f1' | 'f2'; zone: 'waiting' | 'consultation' | null; night: boolean;
  layout: { scale: number; left: number; top: number };
  onSelect: (id: RegionId) => void; onTourRegion: (id: RegionId) => void; onManualNavigation: () => void;
  onPerformance: (sample: PerformanceSample) => void;
  onFloorSelect: (id: 'f1' | 'f2') => void;
}

export const CampusScene = forwardRef<SceneHandle, Props>(function CampusScene(props, ref) {
  const host = useRef<HTMLDivElement>(null);
  const propsRef = useRef(props); propsRef.current = props;
  const api = useRef<SceneHandle | null>(null);
  const labels = useRef(new Map<string, HTMLButtonElement>());
  const [status, setStatus] = useState('正在加载院区模型');
  const [error, setError] = useState(false);
  useImperativeHandle(ref, () => ({ home: () => api.current?.home(), focus: id => api.current?.focus(id), zoom: n => api.current?.zoom(n) }), []);

  useEffect(() => {
    const element = host.current!;
    let alive = true, raf = 0, model: THREE.Group | null = null;
    let controls: OrbitControls | null = null, manifest: Manifest | null = null;
    let floorRoot: THREE.Object3D | null = null, hall: THREE.Object3D | null = null;
    let lastMode: SceneMode | undefined, lastFloor = '', lastNight: boolean | undefined, lastSelected: RegionId | null | undefined;
    const started = performance.now();
    let loadMs = 0;
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-200, 200, 120, -120, 1, 1800);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    let dpr = Math.min(window.devicePixelRatio, 1.5);
    renderer.setPixelRatio(dpr);
    renderer.setClearColor('#e5f1fc', 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
    element.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-label', '可旋转缩放的院区三维场景');
    const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
    const envTarget = pmrem.fromScene(room, .04);
    scene.environment = envTarget.texture; room.dispose(); pmrem.dispose();
    const sky = new THREE.HemisphereLight(0xd8eaff, 0x526143, 1.5); scene.add(sky);
    const key = new THREE.DirectionalLight(0xfff5e7, 3); key.position.set(-80, 180, 120); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -190, right: 190, top: 170, bottom: -170, near: 1, far: 650 });
    key.shadow.bias = -.0002; key.shadow.normalBias = .12; scene.add(key);
    const rim = new THREE.DirectionalLight(0x73a2df, .8); rim.position.set(120, 90, -130); scene.add(rim);
    const entry = new THREE.PointLight(0xffbd75, 0, 110, 1.7); entry.position.set(0, 18, 66); scene.add(entry);
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(960, 540), .15, .3, 1.3);
    composer.addPass(bloom); composer.addPass(new OutputPass()); renderer.info.autoReset = false;
    const materialStates = new Map<THREE.MeshStandardMaterial, { color: THREE.Color; emission: THREE.Color; intensity: number; id: string; floorId: string }>();
    const anchors = new Map<string, THREE.Object3D>();
    const floorGroups = new Map<string, THREE.Object3D>();
    const goalPosition = new THREE.Vector3(), goalTarget = new THREE.Vector3();
    let goalZoom = 1, animating = false, tourLeg = -1, tourElapsed = 0;
    let lastLayout = '';
    let lastZone: Props['zone'] = null;
    let pendingFocus: RegionId | null = null;
    const reset = () => {
      if (!manifest || !controls) return;
      goalPosition.fromArray(manifest.camera.position); goalTarget.fromArray(manifest.camera.target); goalZoom = 1; animating = true;
    };
    const focus = (id: RegionId, tour = false) => {
      if (!manifest || !controls) return;
      const building = model?.getObjectByName(id);
      if (!building) return;
      building.updateWorldMatrix(true, true);
      const bounds = new THREE.Box3().setFromObject(building);
      if (bounds.isEmpty()) return;
      const direction = (id === 'outpatient' && !tour
        ? new THREE.Vector3(16, 90, 250)
        : new THREE.Vector3(tour && id === 'children' ? -75 : 65, 145, 240)).normalize();
      const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize();
      const up = new THREE.Vector3().crossVectors(direction, right).normalize();
      const center = bounds.getCenter(new THREE.Vector3());
      let halfWidth = 0, halfHeight = 0;
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
        const corner = new THREE.Vector3(x, y, z).sub(center);
        halfWidth = Math.max(halfWidth, Math.abs(corner.dot(right)));
        halfHeight = Math.max(halfHeight, Math.abs(corner.dot(up)));
      }
      // 所选建筑完整进入中央安全区；邻近建筑仍作为背景，可由侧栏遮挡。
      const scale = propsRef.current.layout.scale;
      const pixelsPerUnit = element.clientHeight / (camera.top - camera.bottom);
      goalZoom = Math.min(tour ? 1.2 : 1.55,
        980 * scale / (2 * halfWidth * pixelsPerUnit),
        530 * scale / (2 * halfHeight * pixelsPerUnit)) * .92;
      goalTarget.copy(center).addScaledVector(up, (550 * scale - element.clientHeight / 2) / (pixelsPerUnit * goalZoom));
      goalPosition.copy(goalTarget).addScaledVector(direction, 280);
      animating = true;
    };
    // 按展开终态的包围盒取景，预留两侧面板、顶部导航和底部工具栏。
    const fitFloors = () => {
      if (!manifest || !floorRoot || !controls) return;
      const saved = [...floorGroups].map(([id, group]) => ({ id, group, position: group.position.clone() }));
      for (const { id, group } of saved) {
        group.position.y = manifest.floors.explode[id];
        group.position.z = -manifest.floors.back[id];
      }
      floorRoot.updateWorldMatrix(true, true);
      const bounds = new THREE.Box3().setFromObject(floorRoot);
      for (const { group, position } of saved) group.position.copy(position);
      floorRoot.updateWorldMatrix(true, true);
      if (bounds.isEmpty()) return;
      const zone = propsRef.current.zone;
      const zoneMesh = zone ? model?.getObjectByName(`zone_${propsRef.current.floor}_${zone}`) : null;
      if (zoneMesh) {
        const zoneBounds = new THREE.Box3().setFromObject(zoneMesh);
        const center = zoneBounds.getCenter(new THREE.Vector3());
        const group = floorGroups.get(propsRef.current.floor)!;
        center.y += manifest.floors.explode[propsRef.current.floor] - group.position.y + 1.5;
        const direction = new THREE.Vector3(0, 200, 220).normalize();
        const up = new THREE.Vector3(0, direction.z, -direction.y);
        goalZoom = 2.35;
        const pixelsPerUnit = element.clientHeight / (camera.top - camera.bottom);
        goalTarget.copy(center).addScaledVector(up, (540 * propsRef.current.layout.scale - element.clientHeight / 2) / (pixelsPerUnit * goalZoom));
        goalPosition.copy(goalTarget).addScaledVector(direction, 280); animating = true;
        return;
      }
      const direction = new THREE.Vector3(8, 145, 250).normalize();
      const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize();
      const up = new THREE.Vector3().crossVectors(direction, right).normalize();
      const center = bounds.getCenter(new THREE.Vector3());
      // 楼层切换对准对应层，仍保留另一层作空间参照。
      const selectedGroup = floorGroups.get(propsRef.current.floor);
      if (selectedGroup) {
        const floorCenter = new THREE.Box3().setFromObject(selectedGroup).getCenter(new THREE.Vector3());
        floorCenter.y += manifest.floors.explode[propsRef.current.floor] - selectedGroup.position.y;
        center.lerp(floorCenter, .4);
      }
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
        const v = new THREE.Vector3(x, y, z).sub(center);
        minX = Math.min(minX, v.dot(right)); maxX = Math.max(maxX, v.dot(right));
        minY = Math.min(minY, v.dot(up)); maxY = Math.max(maxY, v.dot(up));
      }
      const { scale, top } = propsRef.current.layout;
      const pixelsPerUnit = element.clientHeight / (camera.top - camera.bottom);
      goalZoom = Math.min(1000 * scale / ((maxX - minX) * pixelsPerUnit), 540 * scale / ((maxY - minY) * pixelsPerUnit)) * .92;
      // 安全区中心位于逻辑画布y=575，补偿全视口与UI居中的位置差。
      goalTarget.copy(center).addScaledVector(up, (top + 550 * scale - element.clientHeight / 2) / (pixelsPerUnit * goalZoom));
      goalPosition.copy(goalTarget).addScaledVector(direction, 270);
      animating = true;
    };
    api.current = {
      home: () => { pendingFocus = null; reset(); }, focus: id => { pendingFocus = id; },
      zoom: n => {
        goalZoom = THREE.MathUtils.clamp(camera.zoom * (n > 0 ? 1.18 : .85), .65, 2.7);
        goalPosition.copy(camera.position); if (controls) goalTarget.copy(controls.target); animating = true;
      },
    };
    const resize = () => {
      const width = element.clientWidth, height = element.clientHeight;
      if (!width || !height) return;
      dpr = Math.min(window.devicePixelRatio, 1.5);
      renderer.setPixelRatio(dpr); renderer.setSize(width, height);
      composer.setPixelRatio(dpr); composer.setSize(width, height);
      const halfH = Math.max(manifest?.camera.orthoHeight ?? 230, 380 * height / width) / 2;
      camera.left = -halfH * width / height; camera.right = halfH * width / height;
      camera.top = halfH; camera.bottom = -halfH; camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize); observer.observe(element); resize();
    const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
    let down: [number, number] | null = null;
    const onDown = (e: PointerEvent) => { down = [e.clientX, e.clientY]; animating = false; propsRef.current.onManualNavigation(); };
    const isVisible = (o: THREE.Object3D): boolean => !o.visible ? false : o.parent ? isVisible(o.parent) : true;
    const onUp = (e: PointerEvent) => {
      const origin = down; down = null;
      if (!origin || Math.hypot(e.clientX - origin[0], e.clientY - origin[1]) > 6 || !model) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      for (const hit of raycaster.intersectObject(model, true)) {
        if (!isVisible(hit.object)) continue;
        const id = hit.object.userData.objectId as RegionId;
        if (regions.some(r => r.id === id)) { propsRef.current.onSelect(id); break; }
      }
    };
    renderer.domElement.addEventListener('pointerdown', onDown); renderer.domElement.addEventListener('pointerup', onUp);
    const disposeModel = (root: THREE.Object3D) => {
      root.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose(); } });
    };
    async function load() {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}scene/manifest.json`); if (!response.ok) throw new Error('场景清单读取失败');
        const data: Manifest = await response.json();
        const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}scene/${data.model}`);
        if (!alive) { disposeModel(gltf.scene); return; }
        manifest = data; model = gltf.scene;
        model.traverse(o => {
          if (!(o instanceof THREE.Mesh)) return;
          o.castShadow = true; o.receiveShadow = true;
          const original = o.material as THREE.MeshStandardMaterial;
          const m = original.clone(); o.material = m; original.dispose(); m.envMapIntensity = .9; m.aoMapIntensity = .65;
          if (o.userData.zoneId) { m.transparent = true; m.opacity = .4; m.depthWrite = false; m.polygonOffset = true; m.polygonOffsetFactor = -2; o.castShadow = false; o.visible = false; }
          if (o.userData.floorId === 'roof') { m.transparent = true; m.opacity = .88; m.depthWrite = true; o.castShadow = false; }
          if (m.name.includes('leaf')) { m.flatShading = false; o.geometry.computeVertexNormals(); }
          if ((m.name.replace('_surface', '').endsWith('glass') || m.name.includes('warmGlass')) && o.userData.objectId === 'outpatient' && !o.userData.floorId) {
            m.transparent = true; m.opacity = .82; m.depthWrite = false; m.roughness = .2;
          }
          materialStates.set(m, { color: m.color.clone(), emission: m.emissive.clone(), intensity: m.emissiveIntensity, id: o.userData.objectId, floorId: o.userData.floorId ?? '' });
        });
        floorRoot = model.getObjectByName(data.floors.root) ?? null; hall = model.getObjectByName('outpatient') ?? null;
        if (!floorRoot || !hall) throw new Error('模型缺少门诊楼层映射');
        floorRoot.visible = false;
        for (const [id, name] of Object.entries(data.floors.groups)) {
          const node = model.getObjectByName(name); if (!node) throw new Error(`楼层组缺失：${id}`);
          floorGroups.set(id, node);
        }
        for (const id of [...regions.map(r => r.id), 'floor_f1', 'floor_f2']) {
          const node = model.getObjectByName(`anchor_${id}`); if (!node) throw new Error(`模型锚点缺失：${id}`);
          anchors.set(id, node);
        }
        scene.add(model); camera.position.fromArray(data.camera.position);
        controls = new OrbitControls(camera, renderer.domElement); controls.target.fromArray(data.camera.target);
        controls.enableDamping = true; controls.dampingFactor = .08; controls.enablePan = false;
        controls.minPolarAngle = Math.PI / 8; controls.maxPolarAngle = Math.PI / 2.25;
        controls.minZoom = .65; controls.maxZoom = 2.7; controls.autoRotateSpeed = .45; controls.update(); resize();
        loadMs = performance.now() - started; setStatus('');
      } catch (e) { if (alive) { setError(true); setStatus(e instanceof Error ? e.message : '三维加载失败'); } }
    }
    void load();
    // 灯光主题与业务时段独立，切换20:00不会覆盖用户选定的日间视图。
    const colors: Record<string, [string, string]> = {
      ivory: ['#dce6ed', '#a9bcd1'], roof: ['#e7e9e3', '#9cabbf'], pavement: ['#c3d0d9', '#465971'],
      road: ['#768694', '#223247'], stone: ['#c5c3b2', '#6a7680'], line: ['#edf1ea', '#7b90a1'],
      grass: ['#416538', '#2b4738'], grassLight: ['#7b9147', '#506545'], leaf: ['#4d7547', '#274c3a'],
      leafLight: ['#7c9655', '#406044'], glass: ['#1b4e69', '#183752'], glassLight: ['#487f98', '#385b77'],
      roofOpal: ['#d7e4e8', '#94a8bd'],
      warmGlass: ['#6c99a6', '#795a35'], floorStone: ['#dbdbcf', '#a3acb4'], floorWall: ['#e9e4d4', '#b0bdc6'],
      floorSeat: ['#4886ad', '#396a97'],
    };
    let last = performance.now(), sampleStart = last, frames = 0;
    let frameTimes: number[] = [];
    const world = new THREE.Vector3(), projected = new THREE.Vector3();
    const tick = (now: number) => {
      if (!alive) return;
      raf = requestAnimationFrame(tick); const dt = now - last; last = now;
      if (document.hidden) { frameTimes = []; frames = 0; sampleStart = now; return; }
      const p = propsRef.current;
      const changedMode = lastMode !== p.mode;
      const changedFloor = lastFloor !== p.floor;
      const changedZone = lastZone !== p.zone; lastZone = p.zone;
      const layoutKey = `${p.layout.scale}/${p.layout.left}/${p.layout.top}`;
      const changedLayout = lastLayout !== layoutKey;
      lastLayout = layoutKey;
      if (manifest && controls && model) {
        if (changedMode || changedZone) {
          // 分区近景隐藏外围楼群，避免连接裙房遮住示意内装。
          for (const id of ['medtech', 'children', 'inpatient', 'parking', 'emergency']) {
            const context = model.getObjectByName(id);
            if (context) context.visible = !(p.mode === 'floor' && p.zone);
          }
        }
        if (changedMode) {
          if (floorRoot) floorRoot.visible = p.mode === 'floor';
          if (hall) hall.visible = p.mode !== 'floor';
          controls.autoRotate = p.mode === 'rotate';
          if (p.mode === 'tour') { tourElapsed = 0; tourLeg = -1; }
          else if (lastMode === 'floor') reset();
          lastMode = p.mode;
        }
        if (p.mode === 'floor' && (changedMode || changedFloor || changedLayout || changedZone)) {
          fitFloors();
          lastFloor = p.floor;
        }
        if (p.mode === 'floor') {
          if (changedMode || changedZone || changedFloor) model.traverse(o => { if (o.userData.zoneId) o.visible = o.userData.zoneId === p.zone && o.userData.floorId === p.floor; });
          for (const [id, group] of floorGroups) {
            group.visible = !p.zone || id === p.floor;
            group.position.y = THREE.MathUtils.lerp(group.position.y, manifest.floors.explode[id], .09);
            group.position.z = THREE.MathUtils.lerp(group.position.z, -manifest.floors.back[id], .09);
          }
        }
        // 模式退出可能重置相机，待该状态完成后再消费本次区域选择。
        if (pendingFocus) { focus(pendingFocus); pendingFocus = null; }
        else if (changedLayout && p.selected && (p.mode === 'region' || p.mode === 'tour')) focus(p.selected, p.mode === 'tour');
        if (p.mode === 'tour') {
          tourElapsed += Math.min(dt, 50);
          const leg = Math.floor(tourElapsed / 5200) % manifest.tour.length;
          if (leg !== tourLeg) { tourLeg = leg; const id = manifest.tour[leg]; p.onTourRegion(id); focus(id, true); }
        }
      }
      if (animating && controls) {
        const a = 1 - Math.exp(-Math.min(dt, 50) / (p.mode === 'tour' ? 600 : 180));
        camera.position.lerp(goalPosition, a); controls.target.lerp(goalTarget, a);
        camera.zoom = THREE.MathUtils.lerp(camera.zoom, goalZoom, a); camera.updateProjectionMatrix();
        if (camera.position.distanceTo(goalPosition) < .08 && Math.abs(camera.zoom - goalZoom) < .001) animating = false;
      }
      controls?.update(Math.min(dt, 50) / 1000);
      if (lastSelected !== p.selected || lastNight !== p.night || changedMode || (p.mode === 'floor' && changedFloor)) {
        for (const [m, state] of materialStates) {
          const palette = colors[m.name.replace('TJ_', '').replace('_surface', '')];
          m.color.copy(state.color); if (palette) m.color.set(palette[p.night ? 1 : 0]);
          m.emissive.copy(state.emission); m.emissiveIntensity = state.intensity;
          if (m.name.includes('warmGlass')) { m.emissive.set('#ffb45d'); m.emissiveIntensity = p.night ? .65 : .015; }
          if (m.name.includes('glow')) m.emissiveIntensity = p.night ? 3 : .05;
          if (state.id === p.selected && !m.name.includes('glow')) { m.emissive.add(new THREE.Color(.005, .025, .06)); m.emissiveIntensity = Math.max(.25, m.emissiveIntensity); }
          if (m.name.includes('floorEdge')) { m.emissive.set('#0b63ff'); m.emissiveIntensity = state.floorId === p.floor ? 1.8 : .35; }
        }
        renderer.toneMappingExposure = p.night ? .95 : .95;
        scene.environmentIntensity = p.night ? .28 : .42;
        sky.intensity = p.night ? .65 : .9; key.intensity = p.night ? 1.15 : 2.4;
        key.color.set(p.night ? '#b6c9ed' : '#fff4df'); rim.intensity = p.night ? .65 : .8;
        entry.intensity = p.night ? 1200 : 0; bloom.strength = p.night ? .22 : .05;
        lastNight = p.night; lastSelected = p.selected;
      }
      renderer.info.reset(); composer.render();
      const width = element.clientWidth, height = element.clientHeight;
      const { scale, left, top: uiTop } = p.layout;
      const rail = 392 * scale, padding = 18 * scale;
      const placed: { x: number; y: number; w: number; h: number }[] = [];
      const ordered = [...anchors].sort(([a], [b]) => a === p.selected ? -1 : b === p.selected ? 1 : 0);
      for (const [id, anchor] of ordered) {
        const label = labels.current.get(id); if (!label) continue;
        const floorLabel = id.startsWith('floor_');
        const permitted = p.mode === 'floor' ? floorLabel && (!p.zone || id === `floor_${p.floor}`) : !floorLabel;
        anchor.getWorldPosition(world); projected.copy(world).project(camera);
        const visible = permitted && projected.z < 1 && Math.abs(projected.x) < .99 && Math.abs(projected.y) < .99;
        label.style.visibility = visible ? 'visible' : 'hidden'; if (!visible) continue;
        const anchorX = (projected.x * .5 + .5) * width, anchorY = (-projected.y * .5 + .5) * height;
        const w = label.offsetWidth, h = label.offsetHeight;
        const x = THREE.MathUtils.clamp(anchorX, left + rail + padding * 2 + w / 2, left + 1920 * scale - rail - padding * 2 - w / 2);
        let y = anchorY - 20;
        for (let attempt = 0; attempt < 6; attempt++) {
          if (!placed.some(v => Math.abs(x - v.x) < (w + v.w) / 2 + 8 && y > v.y - v.h - 8 && y - h < v.y + 8)) break;
          y -= h + 10;
        }
        y = Math.max(uiTop + 1080 * scale * .23 + h, y);
        label.style.transform = `translate(${x}px,${y}px) translate(-50%,-100%)`;
        const leader = label.querySelector('i')!; leader.style.height = `${Math.max(7, anchorY - y)}px`; leader.style.left = `${w / 2 + anchorX - x}px`;
        placed.push({ x, y, w, h });
      }
      if (model && dt < 250) { frameTimes.push(dt); frames++; }
      if (model && now - sampleStart > 1500 && frames > 10) {
        const sorted = [...frameTimes].sort((a, b) => a - b);
        p.onPerformance({ fps: Math.round(frames * 1000 / (now - sampleStart)), p95: Number(sorted[Math.floor(sorted.length * .95)].toFixed(1)), calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, loadMs: Math.round(loadMs), dpr });
        frameTimes = []; frames = 0; sampleStart = now;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      alive = false; cancelAnimationFrame(raf); observer.disconnect(); controls?.dispose();
      renderer.domElement.removeEventListener('pointerdown', onDown); renderer.domElement.removeEventListener('pointerup', onUp);
      if (model) disposeModel(model);
      envTarget.dispose(); composer.passes.forEach(pass => pass.dispose()); composer.dispose(); renderer.dispose(); renderer.domElement.remove(); api.current = null;
    };
  }, []);

  return <div className="campus-canvas" ref={host}>
    <div className="scene-labels">
      {regions.map(r => <button key={r.id} ref={el => { if (el) labels.current.set(r.id, el); else labels.current.delete(r.id); }} className={`scene-label ${r.id === props.selected ? 'selected' : ''} ${r.id === 'emergency' ? 'emergency' : ''}`} onClick={() => props.onSelect(r.id)} aria-pressed={r.id === props.selected}><span>{r.number}</span>{r.name}<i/></button>)}
      {(['f1', 'f2'] as const).map(id => <button key={id} ref={el => { if (el) labels.current.set(`floor_${id}`, el); else labels.current.delete(`floor_${id}`); }} className={`scene-label floor-label ${props.floor === id ? 'active' : ''}`} onClick={() => props.onFloorSelect(id)}>{id === 'f1' ? '1F' : '2F'} 示意<i/></button>)}
    </div>
    {status && <div className={`model-status ${error ? 'failed' : ''}`} role="status">{!error && <span className="loader"/>}<strong>{status}</strong>{error && <button onClick={() => location.reload()}>重新加载</button>}</div>}
  </div>;
});
