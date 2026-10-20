// Собирает 3D-модели KayKit (CC0) из исходников в лёгкие файлы для приложения:
//   персонажи — каждый в свой .glb, только нужные анимации;
//   окружение — по библиотеке на мир (fantasy, space, city), предмет = узел с именем файла.
// Запуск: node scripts/build-assets.mjs <папка assets-src/kaykit> [библиотека — собрать только её, без персонажей;
//   anims — только общий файл анимаций, нужен лишь Skeleton_Minion.glb]
import { readdirSync, statSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, mergeDocuments, meshopt, prune, quantize, resample, unpartition, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

const SRC = process.argv[2];
const ONLY = process.argv[3];
const OUT = 'public/models';
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
// Сжатие meshopt: в браузере его распаковывает MeshoptDecoder из three.
const squeeze = () => meshopt({ encoder: MeshoptEncoder, level: 'medium' });

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(gltf|glb)$/.test(f)) out.push(p);
  }
  return out;
}
const files = walk(SRC);
const find = (name) => {
  const f = files.find((p) => basename(p).replace(/(\.gltf)?\.glb$|\.gltf$/, '') === name);
  if (!f) throw new Error(`нет модели ${name}`);
  return f;
};

// Анимации, которые используют сцены игры.
const KEEP = new Set([
  'Idle', 'Unarmed_Idle', 'Idle_Combat', 'Running_A', 'Walking_A', 'Walking_D_Skeletons', 'Jump_Full_Short', 'Cheer',
  '1H_Melee_Attack_Chop', 'Unarmed_Melee_Attack_Punch_A', 'Spellcast_Shoot', 'Hit_A', 'Death_A', 'Death_A_Pose',
  'Sit_Floor_Idle', 'Lie_Idle', 'Taunt', 'Skeletons_Awaken_Standing', 'Interact', 'PickUp', 'Block',
  // Отряды деревни в бою: выстрел лучника, удар великана двуручным топором, лечение целителя.
  '1H_Ranged_Shoot', '2H_Melee_Attack_Chop', 'Spellcasting',
]);

function dropAnimation(a) {
  const accessors = new Set();
  for (const s of a.listSamplers()) {
    accessors.add(s.getInput());
    accessors.add(s.getOutput());
  }
  for (const c of a.listChannels()) c.dispose();
  for (const s of a.listSamplers()) s.dispose();
  a.dispose();
  // Метки времени общие у разных анимаций: удаляем только то, что больше никому не нужно.
  for (const acc of accessors) if (acc && acc.listParents().every((p) => p.propertyType === 'Root')) acc.dispose();
}

// Убираем дорожки, где кость не двигается: они только раздувают файл.
function dropStill(a) {
  for (const c of a.listChannels()) {
    const out = c.getSampler()?.getOutput();
    if (!out || !out.getArray()) continue;
    const n = out.getCount();
    const first = out.getElement(0, []);
    let still = true;
    for (let i = 1; i < n && still; i++) {
      const e = out.getElement(i, []);
      still = e.every((v, k) => Math.abs(v - first[k]) < 1e-4);
    }
    const node = c.getTargetNode();
    const rest = c.getTargetPath() === 'rotation' ? node.getRotation() : c.getTargetPath() === 'translation' ? node.getTranslation() : c.getTargetPath() === 'scale' ? node.getScale() : null;
    if (still && rest && rest.every((v, k) => Math.abs(v - first[k]) < 1e-3)) c.dispose();
  }
}

const CHARACTERS = ['Knight', 'Mage', 'Barbarian', 'Rogue', 'Skeleton_Minion', 'Skeleton_Warrior', 'Skeleton_Mage', 'Skeleton_Rogue'];

// У всех персонажей KayKit один скелет, поэтому анимации храним в одном файле и делим между всеми.
mkdirSync(`${OUT}/chars`, { recursive: true });
if (!ONLY) for (const name of CHARACTERS) {
  const doc = await io.read(find(name));
  for (const a of doc.getRoot().listAnimations()) dropAnimation(a);
  await doc.transform(dedup(), prune({ keepLeaves: true }), squeeze());
  await io.write(`${OUT}/chars/${name}.glb`, doc);
  console.log('char', name, Math.round(statSync(`${OUT}/chars/${name}.glb`).size / 1024), 'KB');
}
if (!ONLY || ONLY === 'anims') {
  const doc = await io.read(find('Skeleton_Minion'));
  for (const a of doc.getRoot().listAnimations()) if (!KEEP.has(a.getName())) dropAnimation(a);
  for (const m of doc.getRoot().listMeshes()) m.dispose();
  await doc.transform(resample({ tolerance: 1e-3 }));
  for (const a of doc.getRoot().listAnimations()) dropStill(a);
  await doc.transform(dedup(), prune({ keepLeaves: true }), squeeze());
  await io.write(`${OUT}/chars/animations.glb`, doc);
  console.log('anims', doc.getRoot().listAnimations().length, Math.round(statSync(`${OUT}/chars/animations.glb`).size / 1024), 'KB');
}

const LIBS = {
  fantasy: [
    'hex_grass', 'hex_water', 'hex_road_A', 'hex_road_B', 'hex_road_D', 'hex_river_A', 'hex_river_B', 'hex_river_crossing_A', 'hex_coast_A',
    'hills_A_trees', 'hills_B_trees', 'hills_C', 'hill_single_A', 'hill_single_B', 'mountain_A', 'mountain_B_grass_trees', 'mountain_C_grass',
    'mountain_A_grass_trees', 'trees_A_large', 'trees_A_medium', 'trees_A_small', 'trees_B_large', 'trees_B_medium', 'trees_B_small',
    'tree_single_A', 'tree_single_B', 'rock_single_A', 'rock_single_B', 'rock_single_C', 'rock_single_D', 'cloud_big', 'cloud_small',
    'building_home_A_blue', 'building_home_B_red', 'building_home_A_yellow', 'building_home_B_green', 'building_windmill_yellow',
    'building_watermill_blue', 'building_well_blue', 'building_tavern_red', 'building_market_green', 'building_blacksmith_red',
    'building_church_blue', 'building_tower_A_red', 'building_castle_red', 'building_castle_blue', 'building_mine_yellow',
    'building_lumbermill_green', 'building_bridge_A', 'building_destroyed', 'building_scaffolding', 'building_stage_A', 'building_grain',
    'tent', 'barrel', 'crate_A_big', 'crate_open', 'sack', 'wheelbarrow', 'fence_wood_straight', 'fence_stone_straight', 'flag_red',
    'flag_blue', 'target', 'weaponrack', 'resource_lumber', 'resource_stone', 'waterlily_A', 'waterplant_A', 'wall_straight',
    'wall_straight_gate', 'wall_corner_A_outside', 'ladder', 'bucket_water',
    'chest', 'chest_gold', 'torch_lit', 'barrel_large', 'barrel_small_stack', 'coin_stack_large', 'banner_red', 'banner_patternA_blue',
    'crates_stacked', 'column', 'box_stacked',
  ],
  space: [
    'basemodule_A', 'basemodule_B', 'basemodule_C', 'basemodule_D', 'basemodule_E', 'basemodule_garage', 'cargo_A', 'cargo_A_stacked',
    'cargo_B_packed', 'cargodepot_A', 'cargodepot_B', 'containers_A', 'containers_B', 'containers_C', 'drill_structure', 'lander_A',
    'lander_B', 'landingpad_large', 'landingpad_small', 'lights', 'rock_A', 'rock_B', 'rocks_A', 'rocks_B', 'roofmodule_solarpanels',
    'solarpanel', 'spacetruck', 'spacetruck_large', 'structure_low', 'structure_tall', 'terrain_low', 'terrain_mining', 'terrain_tall',
    'terrain_slope', 'tunnel_straight_A', 'windturbine_tall', 'windturbine_low',
  ],
  city: [
    'base', 'building_A', 'building_B', 'building_C', 'building_D', 'building_E', 'building_F', 'building_G', 'building_H', 'bench',
    'box_A', 'box_B', 'bush', 'car_hatchback', 'car_police', 'car_sedan', 'car_stationwagon', 'car_taxi', 'dumpster', 'firehydrant',
    'road_straight', 'road_corner_curved', 'road_junction', 'road_straight_crossing', 'streetlight', 'trafficlight_A', 'trash_A', 'trash_B',
    'watertower',
  ],
  // Деревня игрока и лагеря Князя Дивана: синие постройки — свои, красные — чужие.
  village: [
    'building_barracks_blue', 'building_barracks_red', 'building_tower_A_blue', 'building_tower_catapult_blue',
    'building_tower_catapult_red', 'building_archeryrange_blue', 'building_mine_blue', 'building_lumbermill_blue',
    'building_market_blue', 'building_blacksmith_blue', 'building_tavern_blue', 'building_home_A_red', 'building_dirt',
    // Ступени уровней: башни и пристройки, которые вырастают у ратуши и построек с уровнем.
    'building_tower_B_blue', 'building_tower_B_red', 'building_tower_base_blue', 'building_tower_base_red', 'building_home_B_blue',
    'building_windmill_blue', 'building_well_red', 'building_church_red', 'building_stage_B', 'building_stage_C',
    // Мелочи для земли вокруг: пни, кусты, поддоны, вода.
    'tree_single_A_cut', 'trees_A_cut', 'bush', 'pallet', 'crate_long_A', 'bucket_arrows', 'hills_C_trees', 'hill_single_C',
    'rock_single_E', 'waterlily_B', 'waterplant_B',
    // Мелочи у построек: ящики, вёдра, ядра катапульты, калитки.
    'crate_A_small', 'crate_B_small', 'crate_B_big', 'crate_long_B', 'bucket_empty', 'projectile_catapult', 'fence_wood_straight_gate',
  ],
};

mkdirSync(`${OUT}/lib`, { recursive: true });
for (const [lib, names] of Object.entries(LIBS)) {
  if (ONLY && lib !== ONLY) continue;
  const doc = await io.read(find(names[0]));
  const scene = doc.getRoot().listScenes()[0];
  const wrap = (d, sceneList, name) => {
    const holder = d.createNode(name);
    for (const s of sceneList) for (const n of s.listChildren()) {
      s.removeChild(n);
      holder.addChild(n);
    }
    return holder;
  };
  scene.addChild(wrap(doc, [scene], names[0]));
  for (const name of names.slice(1)) {
    let f;
    try {
      f = find(name);
    } catch (e) {
      console.warn(String(e));
      continue;
    }
    const other = await io.read(f);
    const map = mergeDocuments(doc, other);
    const scenes = other.getRoot().listScenes().map((s) => map.get(s));
    scene.addChild(wrap(doc, scenes, name));
    for (const s of scenes) s.dispose();
  }
  for (const s of doc.getRoot().listScenes()) if (s !== scene) s.dispose();
  await doc.transform(dedup(), weld(), prune(), unpartition(), squeeze());
  await io.write(`${OUT}/lib/${lib}.glb`, doc);
  console.log('lib', lib, names.length, Math.round(statSync(`${OUT}/lib/${lib}.glb`).size / 1024), 'KB');
}
