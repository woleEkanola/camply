"use client";

import { useState } from "react";
import { api } from "@/utils/trpc";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

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
    setSuccess(false);
    
    if (minAge < 0 || maxAge < 0) {
      setError("Age limits cannot be negative");
      setSaving(false);
      return;
    }
    
    if (minAge > maxAge) {
      setError("Minimum age cannot be greater than maximum age");
      setSaving(false);
      return;
    }

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
      setTimeout(() => setSuccess(false), 3000);
    } catch (e: any) {
      setError(e?.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-neutral-900">Registration Age Rules</h3>
        <p className="text-sm text-neutral-500">
          Configure registration age limits and cutoff dates. These rules control camper eligibility.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Input
          label="Minimum Age"
          type="number"
          min={0}
          max={maxAge}
          value={minAge}
          onChange={e => setMinAge(Number(e.target.value))}
          required
        />
        <Input
          label="Maximum Age"
          type="number"
          min={minAge}
          value={maxAge}
          onChange={e => setMaxAge(Number(e.target.value))}
          required
        />
        <Input
          label="Cut-off Date"
          type="date"
          value={cutoffDate}
          onChange={e => setCutoffDate(e.target.value)}
          helpText="Age is calculated as of this date."
        />
      </div>

      {error && <div className="rounded-md bg-danger-50 p-3 text-sm text-danger-700">{error}</div>}
      {success && <div className="rounded-md bg-success-50 p-3 text-sm text-success-700">Age rules saved successfully!</div>}

      <div className="flex justify-end pt-2">
        <Button
          loading={saving}
          onClick={handleSave}
        >
          Save Age Rules
        </Button>
      </div>
    </div>
  );
}
