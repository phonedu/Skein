import { describe, expect, it, vi } from "vitest";
import { runSpring, springAt, springAtRest, SPRING_RESPONSE } from "./spring";

describe("a spring's curve", () => {
  it("starts where it was, at the speed the finger left it", () => {
    expect(springAt(0, 100, 0, 0)).toBe(100);
    // The first few milliseconds move at about the release's speed.
    const near = (springAt(0.001, 100, 0, -800) - 100) / 0.001;
    expect(Math.abs(near + 800)).toBeLessThan(20);
  });

  it("comes to the target and stays there", () => {
    expect(springAt(5, 100, 0, -800)).toBeCloseTo(0, 1);
    expect(springAt(5, -390, 0, 0)).toBeCloseTo(0, 1);
    expect(springAt(5, 100, 0, -800, 0.1)).toBeCloseTo(0, 1);
  });

  it("does not overshoot when critically damped", () => {
    for (let t = 0; t <= 1; t += 0.01) {
      expect(springAt(t, 100, 0, 0, SPRING_RESPONSE, 1)).toBeGreaterThanOrEqual(
        -0.0001,
      );
    }
  });

  it("keeps the slight bounce the app's spring curve has", () => {
    // Damping 0.86: it crosses the target once, a few tenths of a percent.
    let lowest = 0;
    for (let t = 0; t <= 0.6; t += 0.005)
      lowest = Math.min(lowest, springAt(t, 100, 0));
    expect(lowest).toBeLessThan(0);
    expect(Math.abs(lowest)).toBeLessThan(2);
  });

  it("arrives sooner with a shorter response", () => {
    const fast = springAt(0.15, 100, 0, 0, 0.2);
    const slow = springAt(0.15, 100, 0, 0, 0.5);
    expect(Math.abs(fast)).toBeLessThan(Math.abs(slow));
  });

  it("is at rest only when both near and slow", () => {
    expect(springAtRest(0.2, 0, 0)).toBe(true);
    expect(springAtRest(3, 0, 0)).toBe(false);
    expect(springAtRest(0.2, 0, 100)).toBe(false);
  });
});

describe("running a spring", () => {
  it("draws the target and is done at once where motion is off", () => {
    const draw = vi.fn();
    const done = vi.fn();
    const run = runSpring({
      from: 100,
      to: 0,
      velocity: -800,
      allowed: false,
      draw,
      done,
    });
    expect(draw).toHaveBeenCalledWith(0);
    expect(done).toHaveBeenCalledOnce();
    run.stop();
  });

  it("hands the release's speed to the spring", () => {
    // At 60ms a throw towards 0 has gone further than a release from rest.
    const thrown = springAt(0.06, 100, 0, -1200);
    const released = springAt(0.06, 100, 0, 0);
    expect(thrown).toBeLessThan(released);
  });
});
