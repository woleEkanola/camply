"use client";

import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  vr: number;
  size: number;
  color: string;
}

/**
 * Hand-rolled canvas confetti, fired only when #1 changes, using the
 * winning tribe's own colour (plus white/gold accents) — deliberately not
 * a generic library effect, so it reads as native to this app. ~90 lines,
 * no dependency. Never mounts under prefers-reduced-motion.
 */
export function Confetti({ color, trigger }: { color: string; trigger: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduceMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (reduceMotion || trigger === 0) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = [color, "#FFD700", "#FFFFFF"];
    const particles: Particle[] = Array.from({ length: 150 }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * canvas.height * 0.3,
      vx: (Math.random() - 0.5) * 4,
      vy: 2 + Math.random() * 4,
      rotation: Math.random() * 360,
      vr: (Math.random() - 0.5) * 10,
      size: 6 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));

    let frame: number;
    let elapsed = 0;
    const DURATION_MS = 3500;

    function tick(dt: number) {
      elapsed += dt;
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.05; // gravity
        p.rotation += p.vr;

        ctx!.save();
        ctx!.translate(p.x, p.y);
        ctx!.rotate((p.rotation * Math.PI) / 180);
        ctx!.fillStyle = p.color;
        ctx!.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx!.restore();
      }
      if (elapsed < DURATION_MS) {
        frame = requestAnimationFrame((t2) => tick(t2 - lastT));
      } else {
        ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
      }
    }

    let lastT = performance.now();
    frame = requestAnimationFrame((t) => {
      lastT = t;
      tick(16);
    });

    function handleResize() {
      if (canvas) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }
    }
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", handleResize);
    };
  }, [trigger, color, reduceMotion]);

  if (reduceMotion) return null;
  return <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-50" />;
}
