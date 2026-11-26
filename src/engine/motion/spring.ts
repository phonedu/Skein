/**
 * A damped spring, in the app's motion units. `response` is about how long
 * it takes to reach the target; `damping` 1 is critical (no overshoot), the
 * 0.86 of `--ease-spring` a slight one. The release hands the finger's speed
 * over as the spring's own, so a flick keeps going instead of stopping and
 * easing from rest.
 */

export const SPRING_RESPONSE = 0.32;
export const SPRING_DAMPING = 0.86;

/** Ended where it is: no further frames, and no `done`. */
export interface SpringRun {
  stop(): void;
}

/** The value at `t` seconds, from `from` to `to` at `velocity` px/s: the
 *  closed form of a damped oscillator, exact at any frame rate. */
export function springAt(
  t: number,
  from: number,
  to: number,
  velocity = 0,
  response = SPRING_RESPONSE,
  damping = SPRING_DAMPING,
): number {
  if (response <= 0 || !Number.isFinite(response)) return to;
  const x0 = from - to;
  const w = (2 * Math.PI) / response;
  if (damping > 0 && damping < 1) {
    const wd = w * Math.sqrt(1 - damping * damping);
    const b = (velocity + damping * w * x0) / wd;
    return (
      to +
      Math.exp(-damping * w * t) *
        (x0 * Math.cos(wd * t) + b * Math.sin(wd * t))
    );
  }
  // Critical (or over-damped): no oscillation, one term for the release.
  const b = velocity + w * x0;
  return to + (x0 + b * t) * Math.exp(-w * t);
}

/** Close enough to the target, and slow enough, that another frame would
 *  not be seen: the run comes to rest and may hand over. */
export function springAtRest(
  value: number,
  to: number,
  speed: number,
): boolean {
  return Math.abs(value - to) <= 0.5 && Math.abs(speed) <= 20;
}

/**
 * Runs the spring on the frame clock; `draw` gets the value in px and
 * `done` runs once at rest. A run where motion is not allowed (reduced
 * motion, the e2e's animations off) draws the target and is done at once.
 */
export function runSpring({
  from,
  to,
  velocity = 0,
  response = SPRING_RESPONSE,
  damping = SPRING_DAMPING,
  allowed = true,
  draw,
  done,
}: {
  from: number;
  to: number;
  /** px/s at release: the finger's speed handed to the spring. */
  velocity?: number;
  response?: number;
  damping?: number;
  allowed?: boolean;
  draw: (value: number) => void;
  done: () => void;
}): SpringRun {
  if (!allowed) {
    draw(to);
    done();
    return { stop: () => {} };
  }
  const start = performance.now();
  let frame = 0;
  let ended = false;
  let lastValue = from;
  let lastAt = start;
  const end = () => {
    if (ended) return;
    ended = true;
    cancelAnimationFrame(frame);
    // The target exactly, so a rounding tail never leaves it a hair off.
    draw(to);
    done();
  };
  const step = (now: number) => {
    if (ended) return;
    const t = (now - start) / 1000;
    const value = springAt(t, from, to, velocity, response, damping);
    draw(value);
    const span = Math.max(1, now - lastAt);
    const speed = ((value - lastValue) / span) * 1000;
    lastValue = value;
    lastAt = now;
    if (springAtRest(value, to, speed)) end();
    else frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
  return {
    stop: () => {
      ended = true;
      cancelAnimationFrame(frame);
    },
  };
}
