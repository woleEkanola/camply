"use client";
import { useState } from "react";
import { api } from "@/utils/trpc";

export default function AgeRangeSettings({
  organizationId,
  initialMin = 5,
  initialMax = 18,
  initialCutoffDate,
  onSave,
  onSettingsSaved
}: {
  organizationId: string;
  initialMin?: number;
  initialMax?: number;
  initialCutoffDate?: string;
  onSave?: (min: number, max: number, cutoffDate: string) => void;
  onSettingsSaved?: () => void;
}) {
  const [minAge, setMinAge] = useState(initialMin);
  const [maxAge, setMaxAge] = useState(initialMax);
  const [cutoffDate, setCutoffDate] = useState(initialCutoffDate || "");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const updateSettings = api.organization.updateSettings.useMutation();

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      await updateSettings.mutateAsync({
        organizationId,
        settings: {
          minAge,
          maxAge,
          cutoffDate,
        },
      });
      setSuccess(true);
      if (onSave) onSave(minAge, maxAge, cutoffDate);
      if (onSettingsSaved) onSettingsSaved();
      setTimeout(() => setSuccess(false), 2000);
    } catch (e: any) {
      setError(e?.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };


  return (
    <div className="max-w-md p-6 bg-white rounded shadow">
      <h2 className="text-lg font-bold mb-4">Set Registration Age Range</h2>
      <div className="flex gap-4 mb-4">
        <label className="flex flex-col">
          <span className="text-sm text-gray-600">Minimum Age</span>
          <input
            type="number"
            min={0}
            max={maxAge}
            value={minAge}
            onChange={e => setMinAge(Number(e.target.value))}
            className="border rounded px-2 py-1"
          />
        </label>
        <label className="flex flex-col">
          <span className="text-sm text-gray-600">Maximum Age</span>
          <input
            type="number"
            min={minAge}
            value={maxAge}
            onChange={e => setMaxAge(Number(e.target.value))}
            className="border rounded px-2 py-1"
          />
        </label>
        <label className="flex flex-col">
          <span className="text-sm text-gray-600">Cut-off Date</span>
          <input
            type="date"
            value={cutoffDate}
            onChange={e => setCutoffDate(e.target.value)}
            className="border rounded px-2 py-1"
          />
        </label>
      </div>
      {error && <div className="text-red-600 mb-2">{error}</div>}
      {success && <div className="text-green-600 mb-2">Saved!</div>}
      <button
        className="bg-blue-600 text-white rounded px-4 py-2"
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? "Saving..." : "Save Settings"}
      </button>
    </div>
  );
}
