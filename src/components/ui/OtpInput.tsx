"use client";

import { useState, useRef, useEffect } from "react";

interface OtpInputProps {
  disabled?: boolean;
  onComplete: (code: string) => void;
}

export function OtpInput({ disabled, onComplete }: OtpInputProps) {
  const length = 6;
  const [values, setValues] = useState<string[]>(Array(length).fill(""));
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  function handleChange(index: number, value: string) {
    if (!/^\d*$/.test(value)) return;
    const next = [...values];
    next[index] = value.slice(-1);
    setValues(next);

    if (value && index < length - 1) {
      refs.current[index + 1]?.focus();
    }

    const code = next.join("");
    if (code.length === length) {
      onComplete(code);
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !values[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const paste = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    const next = Array(length).fill("");
    for (let i = 0; i < paste.length; i++) {
      next[i] = paste[i];
    }
    setValues(next);
    const focusIndex = Math.min(paste.length, length - 1);
    refs.current[focusIndex]?.focus();
    if (paste.length === length) {
      onComplete(paste);
    }
  }

  return (
    <div className="flex justify-center gap-2" onPaste={handlePaste}>
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={values[i]}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          disabled={disabled}
          aria-label={`Digit ${i + 1} of ${length}`}
          className="h-14 w-12 rounded-xl border border-neutral-300 text-center text-xl font-bold text-neutral-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500 disabled:opacity-50"
        />
      ))}
    </div>
  );
}
