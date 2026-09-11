// Frame scheduling for the sky, with the browser APIs injected so it can be tested.

export interface LoopDeps {
  idle(cb: () => void): void;
  raf(cb: (time: number) => void): number;
  caf(handle: number): void;
}

export interface LoopOptions {
  reducedMotion: boolean;
  maxFps?: number;
}

export interface Loop {
  /** Waits for the browser to go idle, then renders (once, under reduced motion). */
  start(): void;
  pause(): void;
  resume(): void;
  running(): boolean;
}

export function createLoop(
  render: (timeMs: number) => void,
  deps: LoopDeps,
  options: LoopOptions,
): Loop {
  const { reducedMotion, maxFps = 60 } = options;
  // A millisecond of slack so 60 Hz displays don't drop every other frame to timer jitter.
  const minFrameMs = 1000 / maxFps - 1;
  let started = false;
  let ready = false;
  let active = false;
  let handle = 0;
  let last = Number.NEGATIVE_INFINITY;

  const tick = (time: number) => {
    if (!active) return;
    if (time - last >= minFrameMs) {
      last = time;
      render(time);
    }
    handle = deps.raf(tick);
  };

  const schedule = () => {
    if (active || !ready || reducedMotion) return;
    active = true;
    handle = deps.raf(tick);
  };

  return {
    start() {
      if (started) return;
      started = true;
      deps.idle(() => {
        ready = true;
        if (reducedMotion) render(0);
        else schedule();
      });
    },
    pause() {
      if (!active) return;
      active = false;
      deps.caf(handle);
    },
    resume: schedule,
    running: () => active,
  };
}
