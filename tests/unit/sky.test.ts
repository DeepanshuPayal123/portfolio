import { describe, expect, test } from "vitest";
import { createLoop, type LoopDeps } from "@/lib/sky/loop";
import { palette, planetRise, pointerParallax } from "@/lib/sky/params";

describe("planetRise: the planet frames the hero and the closing section", () => {
  const vh = 800;
  const doc = 8000;

  test("fully risen at the top and at the very bottom", () => {
    expect(planetRise(0, vh, doc)).toBe(1);
    expect(planetRise(doc - vh, vh, doc)).toBe(1);
  });

  test("set in the middle of the page", () => {
    expect(planetRise(doc / 2, vh, doc)).toBe(0);
  });

  test("sinks monotonically as the hero scrolls away", () => {
    const samples = [0, 100, 200, 400, 600, 720].map((y) =>
      planetRise(y, vh, doc),
    );
    for (let i = 1; i < samples.length; i++)
      expect(samples[i]).toBeLessThanOrEqual(samples[i - 1]!);
    expect(planetRise(vh, vh, doc)).toBe(0);
  });

  test("stays in [0, 1] and is fully risen on pages shorter than the viewport", () => {
    expect(planetRise(-50, vh, doc)).toBe(1);
    expect(planetRise(doc * 2, vh, doc)).toBe(1);
    expect(planetRise(0, vh, 600)).toBe(1);
  });
});

describe("pointerParallax", () => {
  test("is centred at the middle of the viewport and clamped to [-1, 1]", () => {
    expect(pointerParallax(500, 400, 1000, 800)).toEqual([0, 0]);
    expect(pointerParallax(1000, 0, 1000, 800)).toEqual([1, 1]);
    expect(pointerParallax(-500, 5000, 1000, 800)).toEqual([-1, -1]);
  });
});

describe("palette", () => {
  const luminance = ([r, g, b]: readonly number[]) =>
    0.2126 * r! + 0.7152 * g! + 0.0722 * b!;

  test("channels are normalised to [0, 1]", () => {
    for (const mode of ["night", "dawn"] as const) {
      for (const colour of Object.values(palette(mode)).filter(Array.isArray)) {
        for (const channel of colour as number[]) {
          expect(channel).toBeGreaterThanOrEqual(0);
          expect(channel).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  test("dawn is a brighter sky with fainter stars than night", () => {
    expect(luminance(palette("dawn").skyTop)).toBeGreaterThan(
      luminance(palette("night").skyTop),
    );
    expect(palette("dawn").stars).toBeLessThan(palette("night").stars);
  });
});

describe("render loop", () => {
  function fakeDeps() {
    let idle: (() => void) | null = null;
    let frame: ((t: number) => void) | null = null;
    const deps: LoopDeps = {
      idle: (cb) => {
        idle = cb;
      },
      raf: (cb) => {
        frame = cb;
        return 1;
      },
      caf: () => {
        frame = null;
      },
    };
    return {
      deps,
      fireIdle: () => idle?.(),
      tick: (t: number) => {
        const cb = frame;
        frame = null;
        cb?.(t);
      },
      scheduled: () => frame !== null,
    };
  }

  test("waits for idle before the first frame", () => {
    const f = fakeDeps();
    const rendered: number[] = [];
    createLoop((t) => rendered.push(t), f.deps, {
      reducedMotion: false,
    }).start();
    expect(f.scheduled()).toBe(false);
    f.fireIdle();
    f.tick(0);
    expect(rendered).toEqual([0]);
  });

  test("caps the frame rate", () => {
    const f = fakeDeps();
    const rendered: number[] = [];
    createLoop((t) => rendered.push(t), f.deps, {
      reducedMotion: false,
      maxFps: 60,
    }).start();
    f.fireIdle();
    for (const t of [0, 8, 16, 24, 33]) f.tick(t);
    expect(rendered).toEqual([0, 16, 33]);
  });

  test("pause stops scheduling and resume picks up again", () => {
    const f = fakeDeps();
    const rendered: number[] = [];
    const loop = createLoop((t) => rendered.push(t), f.deps, {
      reducedMotion: false,
    });
    loop.start();
    f.fireIdle();
    f.tick(0);
    loop.pause();
    expect(f.scheduled()).toBe(false);
    expect(loop.running()).toBe(false);
    loop.resume();
    f.tick(50);
    expect(rendered).toEqual([0, 50]);
  });

  test("reduced motion renders exactly one frame and never schedules another", () => {
    const f = fakeDeps();
    const rendered: number[] = [];
    const loop = createLoop((t) => rendered.push(t), f.deps, {
      reducedMotion: true,
    });
    loop.start();
    f.fireIdle();
    expect(rendered).toEqual([0]);
    expect(f.scheduled()).toBe(false);
    loop.resume();
    expect(f.scheduled()).toBe(false);
  });
});
