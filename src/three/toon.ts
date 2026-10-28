// Мультяшный вид персонажей: ступенчатый свет (три тона вместо плавного градиента — уходит «пластилин»),
// светлый ободок по краю силуэта и тёмная обводка. Обводка — «вывернутая оболочка»: копия меша,
// чуть раздутая по нормалям и видимая только изнутри; двигается вместе со скелетом и не требует
// перерисовки всей сцены в текстуру, поэтому дешёвая и на телефоне.
import * as THREE from 'three';

// Три ступени света: тень, полутон, свет.
let gradient: THREE.DataTexture | null = null;
function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient;
  const steps = [92, 165, 222];
  const data = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => data.set([v, v, v, 255], i * 4));
  gradient = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

// Ободок: светлая кромка по самому краю силуэта, в цвет поверхности (белый высвечивал тонкий плащ целиком).
const RIM = /* glsl */ `
  {
    vec3 viewDir = normalize(vViewPosition);
    float rim = smoothstep(0.62, 0.95, 1.0 - abs(dot(normal, viewDir)));
    outgoingLight += diffuseColor.rgb * rim * 0.28;
  }
`;

/** Мультяшный материал вместо обычного: та же текстура, цвет, прозрачность и свечение. */
export function toonOf(src: THREE.MeshStandardMaterial): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({
    map: src.map,
    color: src.color.clone(),
    emissive: src.emissive.clone(),
    emissiveIntensity: src.emissiveIntensity,
    transparent: src.transparent,
    opacity: src.opacity,
    alphaTest: src.alphaTest,
    side: src.side,
    gradientMap: toonGradient(),
  });
  m.name = src.name;
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `${RIM}\n#include <opaque_fragment>`);
  };
  // Свой ключ программы: иначе three возьмёт скомпилированный шейдер обычного мультяшного материала без ободка.
  m.customProgramCacheKey = () => 'toon-rim';
  return m;
}

// Обводка: тёмно-фиолетовая, а не чёрная — мягче на цветных фонах.
const OUTLINE = '#1b1326';

function outlineMaterial(thickness: number): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color: OUTLINE, side: THREE.BackSide });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed += normalize(normal) * ${thickness.toFixed(4)};`);
  };
  m.customProgramCacheKey = () => `outline-${thickness}`;
  return m;
}

const outlines = new Map<string, THREE.MeshBasicMaterial>();
const outlineOf = (thickness: number) => {
  // Близкие толщины — один материал (и одна программа шейдера).
  const t = Number(thickness.toPrecision(2));
  const key = String(t);
  return outlines.get(key) ?? outlines.set(key, outlineMaterial(t)).get(key)!;
};

const box = new THREE.Box3();
const size = new THREE.Vector3();
const scale = new THREE.Vector3();

/**
 * Во сколько раз единицы геометрии меньше мировых: модели сжаты (KHR_mesh_quantization), координаты каждой
 * части хранятся в своих единицах (голова «размером 2»), а настоящий масштаб — в узле или в матрицах скелета.
 * Матрицы мира у модели должны быть уже посчитаны.
 */
function worldPerUnit(mesh: THREE.Mesh): number {
  const geo = mesh.geometry;
  geo.computeBoundingBox();
  const raw = geo.boundingBox!.getSize(size).length();
  if (!raw) return 1;
  mesh.getWorldScale(scale);
  const skinned = mesh as THREE.SkinnedMesh;
  if (!skinned.isSkinnedMesh) return (raw * (scale.x + scale.y + scale.z)) / 3 / raw;
  // У скелетного меша масштаб сидит в костях: меряем позу после скелета.
  skinned.computeBoundingBox();
  const posed = (skinned.boundingBox ?? box).getSize(size).length();
  return (posed / raw) * ((scale.x + scale.y + scale.z) / 3);
}

/**
 * Добавить обводку к видимому мешу (скрытое снаряжение не обводим): для скелетного — соседний меш на том же скелете,
 * для обычного (оружие, шлем) — дочерний. thickness — в мировых единицах (метрах сцены).
 * Возвращает функцию, которая убирает обводку.
 */
export function addOutline(mesh: THREE.Mesh, thickness = 0.016): () => void {
  const mat = outlineOf(thickness / Math.max(1e-4, worldPerUnit(mesh)));
  const skinned = mesh as THREE.SkinnedMesh;
  let ol: THREE.Mesh;
  if (skinned.isSkinnedMesh) {
    const s = new THREE.SkinnedMesh(skinned.geometry, mat);
    s.bind(skinned.skeleton, skinned.bindMatrix);
    s.position.copy(skinned.position);
    s.quaternion.copy(skinned.quaternion);
    s.scale.copy(skinned.scale);
    s.frustumCulled = skinned.frustumCulled;
    skinned.parent?.add(s);
    ol = s;
  } else {
    ol = new THREE.Mesh(mesh.geometry, mat);
    mesh.add(ol);
  }
  ol.name = `${mesh.name}-outline`;
  ol.castShadow = false;
  ol.receiveShadow = false;
  ol.raycast = () => {};
  return () => ol.removeFromParent();
}
