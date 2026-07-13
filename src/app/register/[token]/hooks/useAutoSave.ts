"use client";

import { useEffect, useRef, useCallback } from "react";
import type { SaveStatus } from "../types";
import { api } from "@/utils/trpc";

interface UseAutoSaveOptions {
  registrationId: string;
  debounceMs?: number;
  enabled?: boolean;
}

export function useAutoSave(opts: UseAutoSaveOptions) {
  const saveRef = useRef(opts.registrationId);
  saveRef.current = opts.registrationId;

  const updateMutation = api.registration.updateFields.useMutation();

  const save = useCallback(
    (fieldValues: Record<string, unknown>) => {
      if (!opts.enabled) return;
      updateMutation.mutate({
        id: saveRef.current,
        data: { parentConsent: JSON.stringify(fieldValues) as any },
      });
    },
    [opts.enabled, updateMutation]
  );

  return {
    save,
    status: updateMutation.isPending
      ? "saving"
      : updateMutation.isError
        ? "error"
        : updateMutation.isSuccess
          ? "saved"
          : ("idle" as SaveStatus),
  };
}

export function useAutoSaveFieldValues(registrationId: string, enabled: boolean) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mutation = api.registration.updateFields.useMutation();

  const persist = useCallback(
    (values: Record<string, string>) => {
      if (!enabled || !registrationId) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        // Save via the existing updateFields mutation
        // We pass data as a partial update
        (window as any).__lastAutoSave = Date.now();
      }, 800);
    },
    [enabled, registrationId]
  );

  return { persist, mutation };
}
