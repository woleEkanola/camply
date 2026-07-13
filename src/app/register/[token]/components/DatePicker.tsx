"use client";

import { useMemo, useState, useRef, useEffect } from "react";

interface DatePickerProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
  helpText?: string;
}

function computeAge(dob: string): number | null {
  if (!dob) return null;
  const birth = new Date(dob + "T00:00:00");
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export function DatePicker({ label, value, onChange, error, required, helpText }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value) {
      const d = new Date(value + "T00:00:00");
      if (!isNaN(d.getTime())) {
        setDay(String(d.getDate()).padStart(2, "0"));
        setMonth(String(d.getMonth() + 1).padStart(2, "0"));
        setYear(String(d.getFullYear()));
      }
    }
  }, [value]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const age = computeAge(value);
  const display = value
    ? new Date(value + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : "";

  function applyDate() {
    const y = parseInt(year);
    const m = parseInt(month);
    const d = parseInt(day);
    if (y < 1900 || y > new Date().getFullYear()) { onChange(""); setOpen(false); return; }
    if (m < 1 || m > 12) { onChange(""); setOpen(false); return; }
    if (d < 1 || d > 31) { onChange(""); setOpen(false); return; }
    const iso = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    onChange(iso);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <label className="mb-1 block text-sm font-medium text-neutral-700">
        {label}{required && <span className="ml-0.5 text-danger-600">*</span>}
      </label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex w-full items-center rounded-xl border bg-white px-4 py-3 text-left text-sm transition-colors hover:border-accent-400 ${
          error ? "border-danger-400" : open ? "border-accent-500 ring-1 ring-accent-500" : "border-neutral-300"
        }`}
      >
        <svg className="mr-2 h-4 w-4 shrink-0 text-neutral-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
        </svg>
        <span className={display ? "text-neutral-900" : "text-neutral-400"}>
          {display || "Select date"}
        </span>
        {age != null && (
          <span className="ml-2 text-xs font-medium text-accent-600">· {age} yr{age !== 1 ? "s" : ""}</span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-20 mt-1 rounded-xl border border-neutral-200 bg-white p-4 shadow-lg">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-neutral-500">Month</label>
              <select
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="w-full rounded-lg border border-neutral-200 bg-white px-2 py-2 text-sm focus:border-accent-500 focus:outline-none"
              >
                <option value="">MM</option>
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i} value={String(i + 1).padStart(2, "0")}>
                    {new Date(2000, i).toLocaleString("en-US", { month: "short" })}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-neutral-500">Day</label>
              <select
                value={day}
                onChange={(e) => setDay(e.target.value)}
                className="w-full rounded-lg border border-neutral-200 bg-white px-2 py-2 text-sm focus:border-accent-500 focus:outline-none"
              >
                <option value="">DD</option>
                {Array.from({ length: 31 }, (_, i) => (
                  <option key={i} value={String(i + 1).padStart(2, "0")}>{i + 1}</option>
                ))}
              </select>
            </div>
            <div className="flex-[1.5]">
              <label className="mb-1 block text-xs font-medium text-neutral-500">Year</label>
              <select
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="w-full rounded-lg border border-neutral-200 bg-white px-2 py-2 text-sm focus:border-accent-500 focus:outline-none"
              >
                <option value="">YYYY</option>
                {Array.from({ length: 50 }, (_, i) => {
                  const y = new Date().getFullYear() - i;
                  return <option key={y} value={y}>{y}</option>;
                })}
              </select>
            </div>
          </div>
          <button
            type="button"
            onClick={applyDate}
            disabled={!month || !day || !year}
            className="mt-3 w-full rounded-lg bg-accent-600 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-700 disabled:opacity-40"
          >
            Apply
          </button>
        </div>
      )}

      {helpText && !error && <p className="mt-1 text-xs text-neutral-500">{helpText}</p>}
      {error && <p className="mt-1 text-xs text-danger-600">{error}</p>}
    </div>
  );
}
