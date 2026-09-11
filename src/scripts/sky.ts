import { createLoop } from "@/lib/sky/loop";
import {
  palette,
  planetRise,
  pointerParallax,
  type SkyMode,
} from "@/lib/sky/params";

// The live background: one fullscreen triangle and one fragment shader — stars, a faint
// nebula, and a planet limb whose atmosphere glows toward a sun flare on the horizon.

const VERTEX = `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

const FRAGMENT = `
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform float uRise;
uniform vec2 uPointer;
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform vec3 uGlow;
uniform vec3 uFlare;
uniform vec3 uPlanet;
uniform float uStars;
uniform float uNebula;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p = p * 2.03 + 17.0;
    amplitude *= 0.5;
  }
  return value;
}

// One layer of sparse stars on a jittered grid, each twinkling at its own rate.
float stars(vec2 uv, float scale, float seed) {
  vec2 cell = uv * scale;
  vec2 id = floor(cell);
  vec2 local = fract(cell) - 0.5;
  float h = hash(id + seed);
  if (h < 0.92) return 0.0;
  vec2 jitter = (vec2(hash(id + seed + 1.3), hash(id + seed + 7.1)) - 0.5) * 0.7;
  float size = mix(0.025, 0.07, hash(id + seed + 3.7));
  float twinkle = 0.6 + 0.4 * sin(uTime * (0.8 + 2.5 * h) + h * 40.0);
  return smoothstep(size, 0.0, length(local - jitter)) * twinkle * (h - 0.92) * 12.5;
}

void main() {
  float aspect = uResolution.x / uResolution.y;
  vec2 uv = gl_FragCoord.xy / uResolution.y;
  vec2 p = vec2(uv.x - aspect * 0.5, uv.y);

  vec3 col = mix(uSkyHorizon, uSkyTop, smoothstep(0.0, 0.85, uv.y));

  float cloud = fbm(p * 1.6 + vec2(uTime * 0.01, 0.0) + uPointer * 0.05);
  col += uGlow * 0.09 * uNebula * smoothstep(0.45, 0.9, cloud);

  float s = stars(p + uPointer * 0.004, 70.0, 1.0)
          + stars(p + uPointer * 0.010, 42.0, 7.0) * 0.8
          + stars(p + uPointer * 0.020, 24.0, 13.0) * 0.6;
  col += vec3(0.85, 0.9, 1.0) * s * uStars;

  // A huge disc whose limb sits near the bottom of the view; uRise lifts it into frame.
  float radius = 2.4;
  float horizon = mix(-0.25, 0.16, uRise);
  vec2 centre = vec2(-uPointer.x * 0.02, horizon - radius);
  float dist = length(p - centre) - radius;

  float sunX = 0.18 + uPointer.x * 0.03;
  float sunward = exp(-pow((p.x - sunX) * 1.6, 2.0));
  float above = max(dist, 0.0);
  vec3 atmosphere = uGlow * (exp(-above * 18.0) * (0.35 + 0.9 * sunward) + exp(-above * 4.0) * 0.25 * (0.4 + sunward));
  col += atmosphere * uRise;
  col += uFlare * smoothstep(0.012, 0.0, abs(dist)) * (0.35 + 1.2 * sunward) * uRise;

  float inside = smoothstep(0.002, -0.004, dist);
  vec3 surface = uPlanet + uGlow * 0.12 * exp(dist * 14.0) * (0.5 + sunward);
  col = mix(col, surface, inside);

  vec2 sun = vec2(sunX, horizon + 0.004);
  float core = exp(-length(p - sun) * 38.0);
  float streak = exp(-abs(p.y - sun.y) * 90.0) * exp(-abs(p.x - sun.x) * 1.8);
  col += uFlare * (core * 1.4 + streak * 0.35) * (0.92 + 0.08 * sin(uTime * 0.6)) * uRise;

  float vignette = smoothstep(1.4, 0.3, length((uv - vec2(aspect * 0.5, 0.55)) / vec2(aspect, 1.0)));
  col *= mix(0.82, 1.0, vignette);
  col += (hash(gl_FragCoord.xy + uTime) - 0.5) / 255.0;

  gl_FragColor = vec4(col, 1.0);
}
`;

const RESOLUTION_SCALE = 0.6;
const MAX_DPR = 1.5;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

function link(gl: WebGLRenderingContext) {
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  return gl.getProgramParameter(program, gl.LINK_STATUS) ? program : null;
}

const modeFromTheme = (): SkyMode =>
  document.documentElement.dataset.theme === "light" ? "dawn" : "night";

function start(canvas: HTMLCanvasElement) {
  const root = document.documentElement;
  const fallback = () => {
    root.dataset.sky = "fallback";
  };

  const gl = canvas.getContext("webgl", {
    alpha: false,
    antialias: false,
    powerPreference: "low-power",
    preserveDrawingBuffer: true,
  }) as WebGLRenderingContext | null;
  const program = gl && link(gl);
  if (!gl || !program) return fallback();

  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  const position = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const u = (name: string) => gl.getUniformLocation(program, name);
  const uniforms = {
    resolution: u("uResolution"),
    time: u("uTime"),
    rise: u("uRise"),
    pointer: u("uPointer"),
    skyTop: u("uSkyTop"),
    skyHorizon: u("uSkyHorizon"),
    glow: u("uGlow"),
    flare: u("uFlare"),
    planet: u("uPlanet"),
    stars: u("uStars"),
    nebula: u("uNebula"),
  };

  const applyPalette = () => {
    const colours = palette(modeFromTheme());
    gl.uniform3fv(uniforms.skyTop, colours.skyTop);
    gl.uniform3fv(uniforms.skyHorizon, colours.skyHorizon);
    gl.uniform3fv(uniforms.glow, colours.glow);
    gl.uniform3fv(uniforms.flare, colours.flare);
    gl.uniform3fv(uniforms.planet, colours.planet);
    gl.uniform1f(uniforms.stars, colours.stars);
    gl.uniform1f(uniforms.nebula, colours.nebula);
  };

  const resize = () => {
    const scale =
      Math.min(window.devicePixelRatio || 1, MAX_DPR) * RESOLUTION_SCALE;
    const width = Math.max(1, Math.round(window.innerWidth * scale));
    const height = Math.max(1, Math.round(window.innerHeight * scale));
    if (canvas.width === width && canvas.height === height) return;
    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);
    gl.uniform2f(uniforms.resolution, width, height);
  };

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const riseTarget = () =>
    planetRise(window.scrollY, window.innerHeight, root.scrollHeight);
  let rise = riseTarget();
  let pointer: [number, number] = [0, 0];
  let pointerTarget: [number, number] = [0, 0];

  const draw = (timeMs: number) => {
    // Ease toward the targets so scrolling and pointer moves feel weighted, not twitchy.
    const ease = reducedMotion ? 1 : 0.06;
    rise += (riseTarget() - rise) * ease;
    pointer = [
      pointer[0] + (pointerTarget[0] - pointer[0]) * ease,
      pointer[1] + (pointerTarget[1] - pointer[1]) * ease,
    ];
    gl.uniform1f(uniforms.time, timeMs / 1000);
    gl.uniform1f(uniforms.rise, rise);
    gl.uniform2f(uniforms.pointer, pointer[0], pointer[1]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  applyPalette();
  resize();

  const loop = createLoop(
    (time) => {
      draw(time);
      canvas.dataset.motion = reducedMotion ? "static" : "live";
    },
    {
      idle: (cb) =>
        "requestIdleCallback" in window
          ? window.requestIdleCallback(cb, { timeout: 1500 })
          : setTimeout(cb, 300),
      raf: (cb) => window.requestAnimationFrame(cb),
      caf: (handle) => window.cancelAnimationFrame(handle),
    },
    { reducedMotion },
  );
  loop.start();

  const redrawStill = () => {
    if (reducedMotion && canvas.dataset.motion) draw(0);
  };

  window.addEventListener("resize", () => {
    resize();
    redrawStill();
  });

  if (!reducedMotion && window.matchMedia("(pointer: fine)").matches) {
    window.addEventListener(
      "pointermove",
      (e) => {
        pointerTarget = pointerParallax(
          e.clientX,
          e.clientY,
          window.innerWidth,
          window.innerHeight,
        );
      },
      { passive: true },
    );
  }

  new MutationObserver(() => {
    applyPalette();
    redrawStill();
  }).observe(root, { attributes: true, attributeFilter: ["data-theme"] });

  document.addEventListener("visibilitychange", () => {
    if (reducedMotion || !canvas.dataset.motion) return;
    if (document.hidden) {
      loop.pause();
      canvas.dataset.motion = "paused";
    } else {
      loop.resume();
      canvas.dataset.motion = "live";
    }
  });

  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    loop.pause();
    fallback();
  });
}

const canvas = document.querySelector<HTMLCanvasElement>("canvas[data-sky]");
if (canvas) start(canvas);
