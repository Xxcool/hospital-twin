// 场景灯光、后处理与材质主题；不参与业务选择或相机导航。
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { SceneProps } from './types';
export function createLighting(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  camera: THREE.Camera,
) {
  const pmrem = new THREE.PMREMGenerator(renderer),
    room = new RoomEnvironment();
  const envTarget = pmrem.fromScene(room, 0.04);
  scene.environment = envTarget.texture;
  room.dispose();
  pmrem.dispose();
  const sky = new THREE.HemisphereLight(0xd8eaff, 0x526143, 1.5);
  scene.add(sky);
  const key = new THREE.DirectionalLight(0xfff5e7, 3);
  key.position.set(-80, 180, 120);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, {
    left: -190,
    right: 190,
    top: 170,
    bottom: -170,
    near: 1,
    far: 650,
  });
  key.shadow.bias = -0.0002;
  key.shadow.normalBias = 0.12;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x73a2df, 0.8);
  rim.position.set(120, 90, -130);
  scene.add(rim);
  const entry = new THREE.PointLight(0xffbd75, 0, 110, 1.7);
  entry.position.set(0, 18, 66);
  scene.add(entry);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(960, 540), 0.15, 0.3, 1.3);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  renderer.info.autoReset = false;
  const materialStates = new Map<
    THREE.MeshStandardMaterial,
    { color: THREE.Color; emission: THREE.Color; intensity: number; id: string; floorId: string }
  >();
  const colors: Record<string, [string, string]> = {
    ivory: ['#dce6ed', '#a9bcd1'],
    roof: ['#e7e9e3', '#9cabbf'],
    pavement: ['#c3d0d9', '#465971'],
    road: ['#768694', '#223247'],
    stone: ['#c5c3b2', '#6a7680'],
    line: ['#edf1ea', '#7b90a1'],
    grass: ['#416538', '#2b4738'],
    grassLight: ['#7b9147', '#506545'],
    leaf: ['#4d7547', '#274c3a'],
    leafLight: ['#7c9655', '#406044'],
    glass: ['#1b4e69', '#183752'],
    glassLight: ['#487f98', '#385b77'],
    roofOpal: ['#d7e4e8', '#94a8bd'],
    warmGlass: ['#6c99a6', '#795a35'],
    floorStone: ['#dbdbcf', '#a3acb4'],
    floorWall: ['#e9e4d4', '#b0bdc6'],
    floorSeat: ['#4886ad', '#396a97'],
  };
  let lastTheme = '';
  return {
    prepareMesh(o: THREE.Mesh) {
      lastTheme = '';
      o.castShadow = true;
      o.receiveShadow = true;
      const original = o.material as THREE.MeshStandardMaterial;
      const m = original.clone();
      o.material = m;
      original.dispose();
      m.envMapIntensity = 0.9;
      m.aoMapIntensity = 0.65;
      if (o.userData.zoneId) {
        m.transparent = true;
        m.opacity = 0.4;
        m.depthWrite = false;
        m.polygonOffset = true;
        m.polygonOffsetFactor = -2;
        o.castShadow = false;
        o.visible = false;
      }
      if (o.userData.floorId === 'roof') {
        m.transparent = true;
        m.opacity = 0.88;
        m.depthWrite = true;
        o.castShadow = false;
      }
      if (m.name.includes('leaf')) {
        m.flatShading = false;
        o.geometry.computeVertexNormals();
      }
      if (
        (m.name.replace('_surface', '').endsWith('glass') || m.name.includes('warmGlass')) &&
        o.userData.objectId === 'outpatient' &&
        !o.userData.floorId
      ) {
        m.transparent = true;
        m.opacity = 0.82;
        m.depthWrite = false;
        m.roughness = 0.2;
      }
      materialStates.set(m, {
        color: m.color.clone(),
        emission: m.emissive.clone(),
        intensity: m.emissiveIntensity,
        id: o.userData.objectId,
        floorId: o.userData.floorId ?? '',
      });
    },
    resize(width: number, height: number, dpr: number) {
      composer.setPixelRatio(dpr);
      composer.setSize(width, height);
    },
    update(p: SceneProps) {
      const theme = `${p.selected}/${p.night}/${p.floor}`;
      if (theme === lastTheme) return;
      lastTheme = theme;
      for (const [m, state] of materialStates) {
        const palette = colors[m.name.replace('TJ_', '').replace('_surface', '')];
        m.color.copy(state.color);
        if (palette) m.color.set(palette[p.night ? 1 : 0]);
        m.emissive.copy(state.emission);
        m.emissiveIntensity = state.intensity;
        if (m.name.includes('warmGlass')) {
          m.emissive.set('#ffb45d');
          m.emissiveIntensity = p.night ? 0.65 : 0.015;
        }
        if (m.name.includes('glow')) m.emissiveIntensity = p.night ? 3 : 0.05;
        if (state.id === p.selected && !m.name.includes('glow')) {
          m.emissive.add(new THREE.Color(0.005, 0.025, 0.06));
          m.emissiveIntensity = Math.max(0.25, m.emissiveIntensity);
        }
        if (m.name.includes('floorEdge')) {
          m.emissive.set('#0b63ff');
          m.emissiveIntensity = state.floorId === p.floor ? 1.8 : 0.35;
        }
      }
      renderer.toneMappingExposure = p.night ? 0.95 : 0.95;
      scene.environmentIntensity = p.night ? 0.28 : 0.42;
      sky.intensity = p.night ? 0.65 : 0.9;
      key.intensity = p.night ? 1.15 : 2.4;
      key.color.set(p.night ? '#b6c9ed' : '#fff4df');
      rim.intensity = p.night ? 0.65 : 0.8;
      entry.intensity = p.night ? 1200 : 0;
      bloom.strength = p.night ? 0.22 : 0.05;
    },
    render() {
      renderer.info.reset();
      composer.render();
    },
    dispose() {
      materialStates.clear();
      key.shadow.dispose();
      envTarget.dispose();
      composer.passes.forEach((pass) => pass.dispose());
      composer.dispose();
      scene.remove(sky, key, rim, entry);
      scene.environment = null;
    },
  };
}
