"use client";

import { useEffect, useRef } from "react";

interface LineChartProps {
  data: number[];
  color?: string;
}

const NAMED_PALETTE: Record<string, string> = {
  emerald: "#10b981",
  blue: "#3b82f6",
  rose: "#e11d48",
};

/** The three named entries are a convenience alias; anything else (a hex
 * string, an rgb()/hsl() string, a CSS named color) passes through
 * unchanged — canvas's strokeStyle/fillStyle accept any valid CSS color, so
 * there's no reason to silently substitute emerald for a value that isn't
 * one of the three magic strings. Both of this component's actual callers
 * (admin/campuses/[id]/page.tsx, admin/venues/[id]/page.tsx) already pass
 * arbitrary hex colors, not named-palette strings, so every real usage was
 * silently rendering emerald before this fix. */
function resolveStrokeColor(color: string): string {
  return NAMED_PALETTE[color] ?? color;
}

/** Reuses the canvas's own CSS color parser (via a 1x1 scratch canvas)
 * rather than hand-rolling a hex/rgb/hsl/named-color parser, so this works
 * for any valid CSS color string, not just #RRGGBB. */
function withAlpha(cssColor: string, alpha: number): string {
  if (typeof document === "undefined") return cssColor;
  const scratch = document.createElement("canvas");
  scratch.width = 1;
  scratch.height = 1;
  const scratchCtx = scratch.getContext("2d");
  if (!scratchCtx) return cssColor;
  scratchCtx.fillStyle = cssColor;
  scratchCtx.fillRect(0, 0, 1, 1);
  const [r, g, b] = scratchCtx.getImageData(0, 0, 1, 1).data;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function LineChart({ data, color = "emerald" }: LineChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Set dimensions
    const width = canvas.width;
    const height = canvas.height;
    const padding = 20;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    if (data.length === 0) return;

    // Find min and max values
    const maxValue = Math.max(...data);
    const minValue = Math.min(...data);
    const valueRange = maxValue - minValue;

    // A single point has no line to draw (index / (data.length - 1) is 0/0
    // = NaN, previously silently producing a blank canvas) — draw a single
    // centered dot instead.
    if (data.length === 1) {
      ctx.beginPath();
      ctx.fillStyle = resolveStrokeColor(color);
      ctx.arc(padding + chartWidth / 2, height / 2, 4, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    // Named palette entries are a convenience; any other string (including
    // an arbitrary hex like the venue/campus detail pages already pass) is
    // used as-is — canvas accepts any valid CSS color for strokeStyle/
    // fillStyle, so there's no reason to silently substitute emerald for it.
    const strokeColor = resolveStrokeColor(color);

    // Draw line
    ctx.beginPath();
    ctx.lineWidth = 3;
    ctx.strokeStyle = strokeColor;

    // Calculate points and draw line
    data.forEach((value, index) => {
      const x = padding + (index / (data.length - 1)) * chartWidth;
      const normalizedValue = valueRange === 0 ? 0.5 : (value - minValue) / valueRange;
      const y = height - padding - normalizedValue * chartHeight;

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    // Add gradient fill
    const gradient = ctx.createLinearGradient(0, padding, 0, height - padding);
    gradient.addColorStop(0, withAlpha(strokeColor, 0.2));
    gradient.addColorStop(1, withAlpha(strokeColor, 0.0));

    ctx.beginPath();
    data.forEach((value, index) => {
      const x = padding + (index / (data.length - 1)) * chartWidth;
      const normalizedValue = valueRange === 0 ? 0.5 : (value - minValue) / valueRange;
      const y = height - padding - normalizedValue * chartHeight;

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.lineTo(padding + chartWidth, height - padding);
    ctx.lineTo(padding, height - padding);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
  }, [data, color]);

  return (
    <canvas 
      ref={canvasRef} 
      className="h-full w-full"
      width={500}
      height={200}
    />
  );
}
