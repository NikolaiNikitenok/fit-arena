// Загрузка моделей KayKit (CC0, Kay Lousberg). Файлы собраны скриптом scripts/build-assets.mjs
// и сжаты meshopt, поэтому загрузчику нужен декодер.
import { useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const BASE = `${import.meta.env.BASE_URL}models`;

export type LibName = 'fantasy' | 'space' | 'city' | 'village';
export type CharName = 'Knight' | 'Mage' | 'Barbarian' | 'Rogue' | 'Skeleton_Minion' | 'Skeleton_Warrior' | 'Skeleton_Mage' | 'Skeleton_Rogue';

export const libUrl = (lib: LibName) => `${BASE}/lib/${lib}.glb`;
export const charUrl = (name: CharName) => `${BASE}/chars/${name}.glb`;
export const ANIMS_URL = `${BASE}/chars/animations.glb`;

const extend = (loader: GLTFLoader) => {
  loader.setMeshoptDecoder(MeshoptDecoder);
};

// Мультяшный «ободок»: края предметов, повёрнутые от камеры, чуть подсвечены собственным
// цветом — объём читается, как в больших мобильных стратегиях. Ставится один раз на материал.
const styled = new WeakSet<THREE.Material>();
export function stylize(m: THREE.Material) {
  if (styled.has(m) || !(m as THREE.MeshStandardMaterial).isMeshStandardMaterial) return;
  styled.add(m);
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, r) => {
    prev?.call(m, shader, r);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `{
        float rimF = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.6);
        outgoingLight += diffuseColor.rgb * rimF * 0.42;
      }
      #include <opaque_fragment>`,
    );
  };
  const key = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => key() + '|rim';
  m.needsUpdate = true;
}
const seen = new WeakSet<GLTF>();
function stylizeGltf(g: GLTF) {
  if (seen.has(g)) return;
  seen.add(g);
  g.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) stylize(m);
  });
}

export const useGltf = (url: string): GLTF => {
  const g = useLoader(GLTFLoader, url, extend);
  stylizeGltf(g);
  return g;
};

/** Загрузить модель заранее (в тот же кэш, что useGltf): сцена потом откроется без ожидания. */
export const preloadGltf = (url: string) => useLoader.preload(GLTFLoader, url, extend);

export interface Part {
  // Меши предмета с матрицами относительно его корня.
  meshes: { geometry: THREE.BufferGeometry; material: THREE.Material; matrix: THREE.Matrix4 }[];
}

const partCache = new WeakMap<GLTF, Map<string, Part>>();

/** Предметы библиотеки по имени: геометрия и материалы общие, чтобы рисовать их тысячами. */
export function useLib(lib: LibName): Map<string, Part> {
  const gltf = useGltf(libUrl(lib));
  let parts = partCache.get(gltf);
  if (!parts) {
    parts = new Map();
    gltf.scene.updateMatrixWorld(true);
    for (const root of gltf.scene.children) {
      const inv = root.matrixWorld.clone().invert();
      const meshes: Part['meshes'] = [];
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        meshes.push({ geometry: m.geometry, material: m.material as THREE.Material, matrix: inv.clone().multiply(m.matrixWorld) });
      });
      parts.set(root.name, { meshes });
    }
    partCache.set(gltf, parts);
  }
  return parts;
}
