// Мультяшная картинка поверх обычной отрисовки: тёмная обводка по краям предметов (по скачкам
// глубины), чуть сочнее цвета и мягкое затемнение по углам экрана. Сцена рисуется в текстуру,
// затем один проход на весь экран. Включается там, где сцена ортографическая (деревня).
import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAG = /* glsl */ `
  #include <packing>
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform vec2 uTexel;
  uniform float uNear;
  uniform float uFar;
  uniform float uEdge;
  uniform float uSat;
  varying vec2 vUv;

  float lin(vec2 uv) {
    // Камера ортографическая: глубина в буфере уже линейная, переводим в метры.
    return uNear + texture2D(tDepth, uv).x * (uFar - uNear);
  }

  void main() {
    vec4 col = texture2D(tColor, vUv);
    float d = lin(vUv);
    // Скачок глубины к соседям: край силуэта. Берём самый ближний сосед, чтобы линия
    // ложилась на передний предмет, а не на фон за ним.
    float dl = lin(vUv - vec2(uTexel.x, 0.0));
    float dr = lin(vUv + vec2(uTexel.x, 0.0));
    float du = lin(vUv + vec2(0.0, uTexel.y));
    float dd = lin(vUv - vec2(0.0, uTexel.y));
    float jump = max(max(dl - d, dr - d), max(du - d, dd - d));
    float edge = smoothstep(uEdge, uEdge * 2.5, jump);

    vec3 c = col.rgb;
    // Сочнее: насыщенность чуть выше, тени чуть плотнее.
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(l), c, uSat);
    // Обводка — не чёрная, а тёмный оттенок самого предмета, как в мультфильме.
    c = mix(c, c * 0.25, edge);

    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    // Мягкая виньетка: углы экрана чуть темнее, взгляд — в центр.
    vec2 q = vUv - 0.5;
    gl_FragColor.rgb *= 1.0 - 0.28 * smoothstep(0.32, 0.85, length(q * vec2(0.85, 1.0)));
  }
`;

export function StylePass({ edge = 0.2, sat = 1.1 }: { edge?: number; sat?: number }) {
  const { gl, scene, camera, size, viewport } = useThree();
  const target = useMemo(() => {
    const t = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: gl.capabilities.isWebGL2 ? 4 : 0 });
    t.depthTexture = new THREE.DepthTexture(1, 1);
    t.depthTexture.type = THREE.UnsignedIntType;
    return t;
  }, [gl]);
  const quad = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        tColor: { value: target.texture },
        tDepth: { value: target.depthTexture },
        uTexel: { value: new THREE.Vector2() },
        uNear: { value: 1 },
        uFar: { value: 100 },
        uEdge: { value: edge },
        uSat: { value: sat },
      },
      depthTest: false,
      depthWrite: false,
      toneMapped: true,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    mesh.frustumCulled = false;
    const s = new THREE.Scene();
    s.add(mesh);
    return { scene: s, mat, mesh };
  }, [target, edge, sat]);
  const cam = useMemo(() => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), []);

  useEffect(() => {
    const w = Math.max(1, Math.floor(size.width * viewport.dpr));
    const h = Math.max(1, Math.floor(size.height * viewport.dpr));
    target.setSize(w, h);
    // Линия толщиной примерно в 1.3 пикселя CSS на любом экране.
    quad.mat.uniforms.uTexel.value.set((1.3 * viewport.dpr) / w, (1.3 * viewport.dpr) / h);
  }, [size, viewport.dpr, target, quad]);

  useEffect(
    () => () => {
      target.dispose();
      quad.mat.dispose();
      quad.mesh.geometry.dispose();
    },
    [target, quad],
  );

  // Приоритет 1: R3F больше не рисует сам, рисуем мы — сперва сцену в текстуру, потом на экран.
  useFrame(() => {
    const c = camera as THREE.OrthographicCamera;
    // Отдаление камеры (зум) меняет масштаб: порог обводки держим в «экранных» метрах.
    quad.mat.uniforms.uNear.value = c.near;
    quad.mat.uniforms.uFar.value = c.far;
    quad.mat.uniforms.uEdge.value = edge * (14 / Math.max(4, c.zoom ?? 14));
    gl.setRenderTarget(target);
    gl.render(scene, camera);
    gl.setRenderTarget(null);
    gl.render(quad.scene, cam);
  }, 1);
  return null;
}
