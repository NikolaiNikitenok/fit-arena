// Мультяшный вид персонажей: ступенчатый свет (три тона вместо плавного градиента — уходит «пластилин»),
// светлый ободок по краю силуэта и тёмная обводка. Обводка — «вывернутая оболочка»: копия меша,
// чуть раздутая по нормалям и видимая только изнутри; двигается вместе со скелетом и не требует
// перерисовки всей сцены в текстуру, поэтому дешёвая и на телефоне.
import * as THREE from 'three';

// Обводка включена (не экономный режим). Ставит холст 3D (Canvas3D): он и так знает про режим и при его смене
// собирает сцену заново — персонажи создаются уже с новым значением.
let outlinesEnabled = true;
export const setOutlines = (on: boolean) => {
  outlinesEnabled = on;
};
export const outlinesOn = () => outlinesEnabled;

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
// У редкого облика кромка — цвета редкости и ярче (setRim): светится только край, сам облик виден как есть.
const RIM = /* glsl */ `
  {
    vec3 viewDir = normalize(vViewPosition);
    float rim = smoothstep(0.62, 0.95, 1.0 - abs(dot(normal, viewDir)));
    outgoingLight += mix(diffuseColor.rgb, uRimColor, uRimMix) * rim * uRimStrength;
  }
`;
const RIM_BASE = 0.28;

interface RimUniforms {
  uRimColor: { value: THREE.Color };
  uRimMix: { value: number };
  uRimStrength: { value: number };
}

/** Цвет ободка: color — цвет редкости (null — обычный, в цвет поверхности), strength — яркость кромки. */
export function setRim(m: THREE.Material, color: THREE.Color | null, strength = 0.9): void {
  const u = m.userData.rim as RimUniforms | undefined;
  if (!u) return;
  if (color) u.uRimColor.value.copy(color);
  u.uRimMix.value = color ? 1 : 0;
  u.uRimStrength.value = color ? strength : RIM_BASE;
}

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
  const rim: RimUniforms = { uRimColor: { value: new THREE.Color('#ffffff') }, uRimMix: { value: 0 }, uRimStrength: { value: RIM_BASE } };
  m.userData.rim = rim;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, rim);
    shader.fragmentShader = `uniform vec3 uRimColor;\nuniform float uRimMix;\nuniform float uRimStrength;\n${shader.fragmentShader.replace('#include <opaque_fragment>', `${RIM}\n#include <opaque_fragment>`)}`;
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

// Когда оболочка по нормалям не сработает и нужна «тень» (sheetMaterial):
// — тонкий открытый лист (плащ): много рёбер принадлежат одному треугольнику, края при раздувании шире не станут;
// — предмет с острыми гранями (меч, топор): у каждой грани свои нормали, и раздутые грани расходятся, а не образуют контур.
const sheets = new WeakMap<THREE.BufferGeometry, boolean>();
export function isSheet(geo: THREE.BufferGeometry): boolean {
  const hit = sheets.get(geo);
  if (hit != null) return hit;
  const index = geo.index;
  const pos = geo.getAttribute('position');
  let result = false;
  if (index && pos) {
    // Вершины с одинаковыми координатами — одна точка (швы текстуры дублируют вершины).
    const id = new Map<string, number>();
    const key = (i: number) => {
      const k = `${pos.getX(i)},${pos.getY(i)},${pos.getZ(i)}`;
      return id.get(k) ?? id.set(k, id.size).get(k)!;
    };
    const edges = new Map<string, number>();
    const a = index.array;
    for (let t = 0; t + 2 < a.length; t += 3) {
      const v = [key(a[t]), key(a[t + 1]), key(a[t + 2])];
      for (let e = 0; e < 3; e++) {
        const x = v[e];
        const y = v[(e + 1) % 3];
        const k = x < y ? `${x}_${y}` : `${y}_${x}`;
        edges.set(k, (edges.get(k) ?? 0) + 1);
      }
    }
    let open = 0;
    for (const n of edges.values()) if (n === 1) open++;
    // Острые грани: вершины на каждом углу продублированы ради своих нормалей.
    const hard = id.size > 0 && pos.count / id.size > 1.8;
    result = (edges.size > 0 && open / edges.size > 0.06) || hard;
  }
  sheets.set(geo, result);
  return result;
}

// На сколько «тень» листа отодвигается от камеры (метры сцены): больше, чем изгиб плаща, иначе выпуклая
// сторона увеличенной копии окажется перед ним и зальёт его тёмным.
const SHEET_PUSH = 0.12;

/** «Тень» листа: тёмная копия, чуть увеличенная от центра и отодвинутая от камеры — лист закрывает
 *  её середину, а по краям остаётся контур. grow — во сколько раз увеличить по каждой оси. */
function sheetMaterial(center: THREE.Vector3, grow: THREE.Vector3): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color: OUTLINE, side: THREE.DoubleSide });
  const c = center.toArray().map((x) => x.toFixed(4)).join(', ');
  const g = grow.toArray().map((x) => x.toFixed(4)).join(', ');
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed = vec3(${c}) + (transformed - vec3(${c})) * vec3(${g});`)
      .replace('#include <project_vertex>', `#include <project_vertex>\nmvPosition.z -= ${SHEET_PUSH.toFixed(3)};\ngl_Position = projectionMatrix * mvPosition;`);
  };
  m.customProgramCacheKey = () => `sheet-${c}-${g}`;
  return m;
}

// Куда смотрят нормали: у части моделей (оружие KayKit) они внутрь — двусторонний материал это прячет,
// а оболочка по таким нормалям сжимается внутрь предмета. 1 — наружу, −1 — внутрь.
const facing = new WeakMap<THREE.BufferGeometry, number>();
function normalsOut(geo: THREE.BufferGeometry): number {
  const hit = facing.get(geo);
  if (hit != null) return hit;
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  let sum = 0;
  if (pos && nor) {
    geo.computeBoundingBox();
    const c = geo.boundingBox!.getCenter(new THREE.Vector3());
    for (let i = 0; i < pos.count; i++) sum += (pos.getX(i) - c.x) * nor.getX(i) + (pos.getY(i) - c.y) * nor.getY(i) + (pos.getZ(i) - c.z) * nor.getZ(i);
  }
  const out = sum < 0 ? -1 : 1;
  facing.set(geo, out);
  return out;
}

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
  const local = thickness / Math.max(1e-4, worldPerUnit(mesh));
  let mat: THREE.MeshBasicMaterial;
  if (isSheet(mesh.geometry)) {
    const bb = mesh.geometry.boundingBox!;
    const c = bb.getCenter(new THREE.Vector3());
    const sz = bb.getSize(new THREE.Vector3());
    // По каждой оси — на две толщины шире, но не больше чем на четверть (по тонкой оси иначе раздуется).
    const grow = new THREE.Vector3(...[sz.x, sz.y, sz.z].map((v) => Math.min(1.25, 1 + (2 * local) / Math.max(v, 1e-4))));
    mat = sheetMaterial(c, grow);
  } else mat = outlineOf(local * normalsOut(mesh.geometry));
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
