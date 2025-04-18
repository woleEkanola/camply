"use client";

import { useEffect, useRef } from "react";

interface LineChartProps {
  data: number[];
  color?: string;
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

    // Find min and max values
    const maxValue = Math.max(...data);
    const minValue = Math.min(...data);
    const valueRange = maxValue - minValue;

    // Draw line
    ctx.beginPath();
    ctx.lineWidth = 3;
    
    // Set color based on prop
    switch (color) {
      case "emerald":
        ctx.strokeStyle = "#10b981";
        break;
      case "blue":
        ctx.strokeStyle = "#3b82f6";
        break;
      case "rose":
        ctx.strokeStyle = "#e11d48";
        break;
      default:
        ctx.strokeStyle = "#10b981";
    }

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
    switch (color) {
      case "emerald":
        gradient.addColorStop(0, "rgba(16, 185, 129, 0.2)");
        gradient.addColorStop(1, "rgba(16, 185, 129, 0.0)");
        break;
      case "blue":
        gradient.addColorStop(0, "rgba(59, 130, 246, 0.2)");
        gradient.addColorStop(1, "rgba(59, 130, 246, 0.0)");
        break;
      case "rose":
        gradient.addColorStop(0, "rgba(225, 29, 72, 0.2)");
        gradient.addColorStop(1, "rgba(225, 29, 72, 0.0)");
        break;
      default:
        gradient.addColorStop(0, "rgba(16, 185, 129, 0.2)");
        gradient.addColorStop(1, "rgba(16, 185, 129, 0.0)");
    }

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
