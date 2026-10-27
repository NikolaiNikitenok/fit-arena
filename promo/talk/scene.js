// Сцена говорящего персонажа для рилсов: модель KayKit крупным планом, рот открывается по громкости голоса.
// Время управляется снаружи (window.talk.frame(t, open)), поэтому кадры рендерятся детерминированно.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

const q = new URLSearchParams(location.search);
const W = +(q.get('w') ?? 1080), H = +(q.get('h') ?? 1920);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setSize(W, H);
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 100);
scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a2a20, 1.4));
const key = new THREE.DirectionalLight(0xfff1dc, 2.6);
key.position.set(2.5, 4, 3.5);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
scene.add(key);
const rim = new THREE.DirectionalLight(0xff9a6a, 2.2);
rim.position.set(-3, 2.5, -2.5);
scene.add(rim);

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const load = (u) => loader.loadAsync(u);

const GEAR = {
  Knight: ['Knight_Helmet', 'Knight_Cape'],
  Barbarian: ['Barbarian_Hat', 'Barbarian_Cape'],
  Mage: ['Mage_Hat', 'Mage_Cape'],
  Rogue: ['Rogue_Cape'],
};

let mixer, actions = {}, mouth, model, anims;
export async function setup({ model: name = 'Barbarian', tint }) {
  if (model) scene.remove(model);
  actions = {};
  const g = await load(`/public/models/chars/${name}.glb`);
  anims ??= (await load('/public/models/chars/animations.glb')).animations;
  model = clone(g.scene);
  const keep = new Set(GEAR[name] ?? []);
  model.traverse((o) => {
    if (o.isMesh && !o.isSkinnedMesh && !keep.has(o.name)) o.visible = false;
    if (o.isMesh) {
      o.castShadow = true;
      // Окраска как в игре (src/game/npcs.ts): 'mul:r,g,b' умножает цвет материала.
      if (tint) {
        o.material = o.material.clone();
        const [r, gg, b] = tint.replace('mul:', '').split(',').map(Number);
        o.material.color.multiply(new THREE.Color(r, gg, b));
      }
    }
  });
  scene.add(model);
  mixer = new THREE.AnimationMixer(model);
  for (const c of anims) actions[c.name] = mixer.clipAction(c);
  model.updateMatrixWorld(true);

  // Рот: тёмный овал на кости головы, прямо поверх нарисованного рта.
  const head = model.getObjectByName('head');
  const mouthGeo = new THREE.CircleGeometry(1, 32);
  mouth = new THREE.Group();
  const outer = new THREE.Mesh(mouthGeo, new THREE.MeshBasicMaterial({ color: 0x2a0f12 }));
  const tongue = new THREE.Mesh(mouthGeo, new THREE.MeshBasicMaterial({ color: 0xc8505a }));
  tongue.scale.set(0.6, 0.45, 1);
  tongue.position.set(0, -0.45, 0.001);
  mouth.add(outer, tongue);
  head.add(mouth);
  placeMouth(name);
}

// Рот поверх нарисованного: высота и вылет вперёд у каждой модели свои (подобрано по кадрам).
const MOUTH = {
  Barbarian: [0.13, 0.6, 0.11, 0.075],
  Mage: [0.155, 0.6, 0.1, 0.07],
  Rogue: [0.155, 0.6, 0.1, 0.07],
  Skeleton_Mage: [0.12, 0.6, 0.11, 0.075],
};
export function placeMouth(name) {
  const [y, z, w, h] = MOUTH[name] ?? MOUTH.Barbarian;
  mouth.position.set(0, y, z);
  mouth.userData = { w, h };
}

/** Кадр: t — время анимации тела (с), open — насколько открыт рот (0..1), anim — клип тела. */
export function frame(t, open = 0, anim = 'Idle') {
  for (const [n, act] of Object.entries(actions)) {
    if (n === anim) act.play();
    else act.stop();
  }
  mixer.setTime(t);
  const o = Math.max(0, Math.min(1, open));
  // Закрытый рот прячем: у моделей уже нарисована линия губ.
  mouth.visible = o > 0.04;
  mouth.scale.set(mouth.userData.w * (0.75 + 0.3 * o), mouth.userData.h * (0.25 + o), 1);
  // Голова чуть кивает в такт речи.
  const head = model.getObjectByName('head');
  head.rotation.x += 0.07 * o;
  renderer.render(scene, camera);
}
window.talk = { setup, frame, scene, camera, THREE, renderer, get mouth() { return mouth; } };
window.talkReady = true;
