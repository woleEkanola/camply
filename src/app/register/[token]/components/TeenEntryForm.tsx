"use client";

import { useState } from "react";
import { DatePicker } from "./DatePicker";

interface TeenEntryFormProps {
  onSubmit: (data: { firstName: string; lastName: string; dateOfBirth: string; gender: string }) => void;
  onCancel?: () => void;
  loading?: boolean;
}

export function TeenEntryForm({ onSubmit, onCancel, loading }: TeenEntryFormProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate() {
    const e: Record<string, string> = {};
    if (!firstName.trim()) e.firstName = "First name is required.";
    if (!lastName.trim()) e.lastName = "Last name is required.";
    if (!dateOfBirth) e.dateOfBirth = "Date of birth is required.";
    if (!gender) e.gender = "Please select a gender.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    onSubmit({ firstName: firstName.trim(), lastName: lastName.trim(), dateOfBirth, gender });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="teen-fn" className="mb-1 block text-sm font-medium text-neutral-700">First Name</label>
        <input
          id="teen-fn"
          type="text"
          value={firstName}
          onChange={(e) => { setFirstName(e.target.value); setErrors((p) => ({ ...p, firstName: "" })); }}
          autoFocus
          className="block w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-900 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
          aria-invalid={!!errors.firstName}
        />
        {errors.firstName && <p className="mt-1 text-xs text-danger-600">{errors.firstName}</p>}
      </div>

      <div>
        <label htmlFor="teen-ln" className="mb-1 block text-sm font-medium text-neutral-700">Last Name</label>
        <input
          id="teen-ln"
          type="text"
          value={lastName}
          onChange={(e) => { setLastName(e.target.value); setErrors((p) => ({ ...p, lastName: "" })); }}
          className="block w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-900 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
          aria-invalid={!!errors.lastName}
        />
        {errors.lastName && <p className="mt-1 text-xs text-danger-600">{errors.lastName}</p>}
      </div>

      <DatePicker
        label="Date of Birth"
        value={dateOfBirth}
        onChange={(v) => { setDateOfBirth(v); setErrors((p) => ({ ...p, dateOfBirth: "" })); }}
        error={errors.dateOfBirth}
        required
      />

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-neutral-700">Gender</legend>
        <div className="flex gap-3">
          {["Male", "Female"].map((g) => (
            <label
              key={g}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-neutral-300 px-4 py-3 cursor-pointer has-[:checked]:border-accent-500 has-[:checked]:bg-accent-50"
            >
              <input
                type="radio"
                name="teen-gender"
                value={g}
                checked={gender === g}
                onChange={() => { setGender(g); setErrors((p) => ({ ...p, gender: "" })); }}
                className="h-4 w-4 text-accent-600"
              />
              <span className="text-sm text-neutral-700">{g}</span>
            </label>
          ))}
        </div>
        {errors.gender && <p className="mt-1 text-xs text-danger-600">{errors.gender}</p>}
      </fieldset>

      <div className="flex gap-3">
        {onCancel && (
          <button type="button" onClick={onCancel} className="flex h-12 flex-1 items-center justify-center rounded-xl border border-neutral-300 bg-white text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50">
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={loading}
          className="flex h-12 flex-1 items-center justify-center rounded-xl bg-accent-600 text-sm font-medium text-white transition-colors hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            "Add Teen"
          )}
        </button>
      </div>
    </form>
  );
}
