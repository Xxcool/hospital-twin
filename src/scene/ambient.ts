import * as THREE from 'three';
import type { Manifest } from './types';
import { createTrafficSimulation } from './traffic';

export function createAmbientController(model: THREE.Group, config: Manifest['ambientLife']) {
  const curves = config.lanes.map(
    (lane) =>
      new THREE.CatmullRomCurve3(
        lane.points.map((point) => new THREE.Vector3(...point)),
        true,
        'centripetal',
      ),
  );
  const lengths = curves.map((curve) => curve.getLength());
  const simulation = createTrafficSimulation(config.vehicles, lengths);
  const vehicles = config.vehicles.map((spec) => {
    const node = model.getObjectByName(spec.node);
    if (!node) throw new Error(`车辆模型缺失：${spec.node}`);
    const wheels: THREE.Object3D[] = [];
    node.traverse((part) => {
      if (part.userData.wheel) wheels.push(part);
    });
    return { node, wheels };
  });
  // 车辆仍保留独立节点和车轮姿态，相同几何/材质用实例绘制，避免逐车增加draw call。
  const batches = new Map<string, { sources: THREE.Mesh[]; mesh: THREE.InstancedMesh }>();
  const groups = new Map<string, THREE.Mesh[]>();
  const signature = (mesh: THREE.Mesh) => {
    const geometry = mesh.geometry;
    const material = mesh.material as THREE.Material;
    const values = Object.entries(geometry.attributes).map(
      ([name, attribute]) =>
        `${name}:${Array.from(attribute.array, (value) => Math.round(value * 1000)).join(',')}`,
    );
    return `${material.name}/${values.join('/')}/${geometry.index?.array.join(',')}`;
  };
  vehicles.forEach(({ node }) =>
    node.traverse((part) => {
      if (!(part instanceof THREE.Mesh)) return;
      const key = signature(part);
      const group = groups.get(key) ?? [];
      group.push(part);
      groups.set(key, group);
    }),
  );
  const bounds = new THREE.Box3()
    .setFromPoints(
      config.lanes.flatMap((lane) => lane.points.map((point) => new THREE.Vector3(...point))),
    )
    .expandByScalar(5);
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  groups.forEach((sources, key) => {
    const mesh = new THREE.InstancedMesh(sources[0].geometry, sources[0].material, sources.length);
    mesh.name = 'ambient_vehicle_batch';
    mesh.userData.objectId = 'environment';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.boundingSphere = sphere.clone();
    model.add(mesh);
    sources.forEach((source) => {
      source.visible = false;
    });
    batches.set(key, { sources, mesh });
  });
  const matrix = new THREE.Matrix4();
  const inverse = new THREE.Matrix4();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const position = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const place = () =>
    simulation.states.forEach((state, index) => {
      const curve = curves[state.spec.lane];
      const progress = (state.distance % lengths[state.spec.lane]) / lengths[state.spec.lane];
      curve.getPointAt(progress, position);
      curve.getTangentAt(progress, tangent);
      const { node, wheels } = vehicles[index];
      node.position.copy(position);
      node.rotation.set(0, Math.atan2(-tangent.z, tangent.x), 0);
      wheels.forEach((wheel) => {
        wheel.rotation.z = -state.travelled / 0.36;
      });
      node.updateMatrixWorld(true);
    });
  const draw = () => {
    model.updateWorldMatrix(true, false);
    inverse.copy(model.matrixWorld).invert();
    batches.forEach(({ sources, mesh }) => {
      sources.forEach((source, index) => {
        matrix.multiplyMatrices(inverse, source.matrixWorld);
        mesh.setMatrixAt(index, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    });
  };
  place();
  draw();
  return {
    update(dt: number) {
      if (reduced.matches) return;
      simulation.update(dt);
      place();
      draw();
    },
  };
}
