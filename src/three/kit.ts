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

export const useGltf = (url: string): GLTF => useLoader(GLTFLoader, url, extend);

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
