// 场景容器负责 React 接口、加载、渲染调度与清理；相机、灯光、楼层和标签各自维护。
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { regions, type RegionId } from '../data/model';
import type { Manifest, SceneProps, SceneHandle, SceneMode } from './types';
import { createCameraController } from './camera';
import { createLighting } from './lighting';
import { createFloorController } from './floors';
import { createLabelController } from './labels';
import { disposeModel, isObjectVisible } from './resources';
export type { PerformanceSample, SceneHandle, SceneMode } from './types';

export const CampusScene = forwardRef<SceneHandle, SceneProps>(function CampusScene(props, ref) {
  const host = useRef<HTMLDivElement>(null);
  const propsRef = useRef(props);
  // 动画循环只读取 React 已提交的属性，避免并发渲染把未提交状态带入场景。
  useLayoutEffect(() => {
    propsRef.current = props;
  });
  const api = useRef<SceneHandle | null>(null);
  const labels = useRef(new Map<string, HTMLButtonElement>());
  const [status, setStatus] = useState('正在加载院区模型');
  const [error, setError] = useState(false);
  useImperativeHandle(
    ref,
    () => ({
      home: () => api.current?.home(),
      focus: (id) => api.current?.focus(id),
      zoom: (n) => api.current?.zoom(n),
    }),
    [],
  );

  useEffect(() => {
    const element = host.current!;
    let alive = true,
      raf = 0,
      model: THREE.Group | null = null;
    let controls: OrbitControls | null = null,
      manifest: Manifest | null = null;
    const started = performance.now();
    let loadMs = 0;
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-200, 200, 120, -120, 1, 1800);
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    let dpr = Math.min(window.devicePixelRatio, 1.5);
    renderer.setPixelRatio(dpr);
    renderer.setClearColor('#e5f1fc', 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    element.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-label', '可旋转缩放的院区三维场景');
    const anchors = new Map<string, THREE.Object3D>();
    let lastMode: SceneMode | undefined;
    let lastFloor = '';
    let floorController: ReturnType<typeof createFloorController> | null = null;
    let labelController: ReturnType<typeof createLabelController> | null = null;
    let tourLeg = -1,
      tourElapsed = 0;
    let lastLayout = '';
    const lighting = createLighting(scene, renderer, camera);
    const cameraController = createCameraController(
      camera,
      element,
      () => propsRef.current,
      () => ({
        manifest,
        controls,
        model,
        floorRoot: floorController?.root ?? null,
        floorGroups: floorController?.groups ?? new Map(),
      }),
    );
    let lastZone: SceneProps['zone'] = null;
    let pendingFocus: RegionId | null = null;
    api.current = {
      home: () => {
        pendingFocus = null;
        cameraController.reset();
      },
      focus: (id) => {
        pendingFocus = id;
      },
      zoom: cameraController.zoom,
    };
    const resize = () => {
      const width = element.clientWidth,
        height = element.clientHeight;
      if (!width || !height) return;
      dpr = Math.min(window.devicePixelRatio, 1.5);
      renderer.setPixelRatio(dpr);
      renderer.setSize(width, height);
      lighting.resize(width, height, dpr);
      const halfH = Math.max(manifest?.camera.orthoHeight ?? 230, (380 * height) / width) / 2;
      camera.left = (-halfH * width) / height;
      camera.right = (halfH * width) / height;
      camera.top = halfH;
      camera.bottom = -halfH;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    const raycaster = new THREE.Raycaster(),
      pointer = new THREE.Vector2();
    let down: [number, number] | null = null;
    const onDown = (e: PointerEvent) => {
      down = [e.clientX, e.clientY];
      cameraController.cancel();
      propsRef.current.onManualNavigation();
    };
    const onUp = (e: PointerEvent) => {
      const origin = down;
      down = null;
      if (!origin || Math.hypot(e.clientX - origin[0], e.clientY - origin[1]) > 6 || !model) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        (-(e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      for (const hit of raycaster.intersectObject(model, true)) {
        if (!isObjectVisible(hit.object)) continue;
        const id = hit.object.userData.objectId as RegionId;
        if (regions.some((r) => r.id === id)) {
          propsRef.current.onSelect(id);
          break;
        }
      }
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);

    async function load() {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}scene/manifest.json`);
        if (!response.ok) throw new Error('场景清单读取失败');
        const data: Manifest = await response.json();
        const gltf = await new GLTFLoader().loadAsync(
          `${import.meta.env.BASE_URL}scene/${data.model}`,
        );
        if (!alive) {
          disposeModel(gltf.scene);
          return;
        }
        manifest = data;
        model = gltf.scene;
        model.traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return;
          lighting.prepareMesh(o);
        });
        floorController = createFloorController(model, data);
        for (const id of [...regions.map((r) => r.id), 'floor_f1', 'floor_f2']) {
          const node = model.getObjectByName(`anchor_${id}`);
          if (!node) throw new Error(`模型锚点缺失：${id}`);
          anchors.set(id, node);
        }
        labelController = createLabelController(camera, model, anchors, labels.current, element);
        scene.add(model);
        camera.position.fromArray(data.camera.position);
        controls = new OrbitControls(camera, renderer.domElement);
        controls.target.fromArray(data.camera.target);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.enablePan = false;
        controls.minPolarAngle = Math.PI / 8;
        controls.maxPolarAngle = Math.PI / 2.25;
        controls.minZoom = 0.65;
        controls.maxZoom = 2.7;
        controls.autoRotateSpeed = 0.45;
        controls.update();
        resize();
        loadMs = performance.now() - started;
        setStatus('');
      } catch (e) {
        if (alive) {
          setError(true);
          setStatus(e instanceof Error ? e.message : '三维加载失败');
        }
      }
    }
    void load();
    // 灯光主题与业务时段独立，切换20:00不会覆盖用户选定的日间视图。
    let last = performance.now(),
      sampleStart = last,
      frames = 0;
    let frameTimes: number[] = [];

    const tick = (now: number) => {
      if (!alive) return;
      raf = requestAnimationFrame(tick);
      const dt = now - last;
      last = now;
      if (document.hidden) {
        frameTimes = [];
        frames = 0;
        sampleStart = now;
        return;
      }
      const p = propsRef.current;
      const changedMode = lastMode !== p.mode;
      const changedFloor = lastFloor !== p.floor;
      const changedZone = lastZone !== p.zone;
      lastZone = p.zone;
      const layoutKey = `${p.layout.scale}/${p.layout.left}/${p.layout.top}`;
      const changedLayout = lastLayout !== layoutKey;
      lastLayout = layoutKey;
      if (manifest && controls && model) {
        floorController?.update(p);
        if (changedMode) {
          controls.autoRotate = p.mode === 'rotate';
          if (p.mode === 'tour') {
            tourElapsed = 0;
            tourLeg = -1;
          } else if (lastMode === 'floor') cameraController.reset();
          lastMode = p.mode;
        }
        if (p.mode === 'floor' && (changedMode || changedFloor || changedLayout || changedZone)) {
          cameraController.fitFloors();
          lastFloor = p.floor;
        }
        // 模式退出可能重置相机，待该状态完成后再消费本次区域选择。
        if (pendingFocus) {
          cameraController.focus(pendingFocus);
          pendingFocus = null;
        } else if (changedLayout && p.selected && (p.mode === 'region' || p.mode === 'tour'))
          cameraController.focus(p.selected, p.mode === 'tour');
        if (p.mode === 'tour') {
          tourElapsed += Math.min(dt, 50);
          const leg = Math.floor(tourElapsed / 5200) % manifest.tour.length;
          if (leg !== tourLeg) {
            tourLeg = leg;
            const id = manifest.tour[leg];
            p.onTourRegion(id);
            cameraController.focus(id, true);
          }
        }
      }
      cameraController.update(dt);
      controls?.update(Math.min(dt, 50) / 1000);
      lighting.update(p);
      lighting.render();
      labelController?.update(p);
      if (model && dt < 250) {
        frameTimes.push(dt);
        frames++;
      }
      if (model && now - sampleStart > 1500 && frames > 10) {
        const sorted = [...frameTimes].sort((a, b) => a - b);
        p.onPerformance({
          fps: Math.round((frames * 1000) / (now - sampleStart)),
          p95: Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(1)),
          calls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
          geometries: renderer.info.memory.geometries,
          textures: renderer.info.memory.textures,
          loadMs: Math.round(loadMs),
          dpr,
        });
        frameTimes = [];
        frames = 0;
        sampleStart = now;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      observer.disconnect();
      controls?.dispose();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      if (model) disposeModel(model);
      lighting.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      api.current = null;
    };
  }, []);

  return (
    <div className="campus-canvas" ref={host}>
      <div className="scene-labels">
        {regions.map((r) => (
          <button
            key={r.id}
            ref={(el) => {
              if (el) labels.current.set(r.id, el);
              else labels.current.delete(r.id);
            }}
            className={`scene-label ${r.id === props.selected ? 'selected' : ''} ${r.id === 'emergency' ? 'emergency' : ''}`}
            onClick={() => props.onSelect(r.id)}
            aria-pressed={r.id === props.selected}
          >
            <span>{r.number}</span>
            {r.name}
            <i />
          </button>
        ))}
        {(['f1', 'f2'] as const).map((id) => (
          <button
            key={id}
            ref={(el) => {
              if (el) labels.current.set(`floor_${id}`, el);
              else labels.current.delete(`floor_${id}`);
            }}
            className={`scene-label floor-label ${props.floor === id ? 'active' : ''}`}
            onClick={() => props.onFloorSelect(id)}
          >
            {id === 'f1' ? '1F' : '2F'} 示意
            <i />
          </button>
        ))}
      </div>
      {status && (
        <div className={`model-status ${error ? 'failed' : ''}`} role="status">
          {!error && <span className="loader" />}
          <strong>{status}</strong>
          {error && <button onClick={() => location.reload()}>重新加载</button>}
        </div>
      )}
    </div>
  );
});
