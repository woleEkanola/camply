"use client";

import { useState, useEffect } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { soundManager } from "@/lib/soundManager";
import { vibrationManager } from "@/lib/vibrationManager";
import { registerPushSubscription, unregisterPushSubscription } from "@/lib/pushSubscription";
import { api } from "@/utils/trpc";
import {
  BellIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
  DevicePhoneMobileIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
} from "@heroicons/react/24/outline";

interface NotificationSettingsModalProps {
  open: boolean;
  onClose: () => void;
  organizationId: string;
}

export function NotificationSettingsModal({
  open,
  onClose,
  organizationId,
}: NotificationSettingsModalProps) {
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundVolume, setSoundVolume] = useState(80);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [isPushLoading, setIsPushLoading] = useState(false);

  const getVapidKeyQuery = api.push.getVapidPublicKey.useQuery(undefined, { enabled: open });
  const subscribeMutation = api.push.subscribe.useMutation();
  const unsubscribeMutation = api.push.unsubscribe.useMutation();

  useEffect(() => {
    if (open) {
      const s = soundManager.getSettings();
      setSoundEnabled(s.enabled && !s.muted);
      setSoundVolume(Math.round(s.volume * 100));

      const v = vibrationManager.getSettings();
      setVibrationEnabled(v.enabled);

      checkPushStatus();
    }
  }, [open]);

  const checkPushStatus = async () => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window) {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setPushEnabled(!!sub);
    }
  };

  const handleToggleSound = (enabled: boolean) => {
    setSoundEnabled(enabled);
    soundManager.saveSettings({ enabled, muted: !enabled });
  };

  const handleVolumeChange = (vol: number) => {
    setSoundVolume(vol);
    soundManager.saveSettings({ volume: vol / 100 });
  };

  const handleToggleVibration = (enabled: boolean) => {
    setVibrationEnabled(enabled);
    vibrationManager.saveSettings({ enabled });
  };

  const handleTogglePush = async () => {
    setIsPushLoading(true);
    try {
      if (pushEnabled) {
        await unregisterPushSubscription();
        setPushEnabled(false);
      } else {
        const vapidKey = getVapidKeyQuery.data?.publicKey;
        if (!vapidKey) return;

        const sub = await registerPushSubscription(vapidKey);
        if (sub) {
          const subJson = sub.toJSON();
          if (subJson.endpoint && subJson.keys?.p256dh && subJson.keys?.auth) {
            await subscribeMutation.mutateAsync({
              organizationId,
              endpoint: subJson.endpoint,
              p256dh: subJson.keys.p256dh,
              auth: subJson.keys.auth,
              browser: navigator.userAgent,
            });
            setPushEnabled(true);
          }
        }
      }
    } catch (err) {
      console.error("Push toggle error:", err);
    } finally {
      setIsPushLoading(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Notification Settings">
      <div className="space-y-6">
        {/* Push Notifications Section */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-txt-secondary uppercase tracking-wider">
            Web Push Notifications
          </h4>

          <div className="flex items-center justify-between rounded-xl border border-border-default p-3.5 bg-bg-surface">
            <div className="flex items-center space-x-3">
              <BellIcon className="h-5 w-5 text-teal-600 shrink-0" />
              <div>
                <div className="text-sm font-bold text-txt-primary">Push Notifications</div>
                <div className="text-xs text-txt-secondary">Receive broadcasts even when app is closed</div>
              </div>
            </div>

            <Button
              size="sm"
              variant={pushEnabled ? "secondary" : "primary"}
              loading={isPushLoading}
              onClick={handleTogglePush}
            >
              {pushEnabled ? "Enabled" : "Enable"}
            </Button>
          </div>
        </div>

        {/* Audio & Sound Settings */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-txt-secondary uppercase tracking-wider">
            Sound Cues & Audio
          </h4>

          <div className="flex items-center justify-between rounded-xl border border-border-default p-3.5 bg-bg-surface">
            <div className="flex items-center space-x-3">
              {soundEnabled ? (
                <SpeakerWaveIcon className="h-5 w-5 text-teal-600 shrink-0" />
              ) : (
                <SpeakerXMarkIcon className="h-5 w-5 text-txt-muted shrink-0" />
              )}
              <div>
                <div className="text-sm font-bold text-txt-primary">Audio Cues</div>
                <div className="text-xs text-txt-secondary">Play synthesized chimes for scans & alerts</div>
              </div>
            </div>

            <input
              type="checkbox"
              checked={soundEnabled}
              onChange={(e) => handleToggleSound(e.target.checked)}
              className="h-5 w-5 text-teal-600 rounded focus:ring-teal-500 cursor-pointer"
            />
          </div>

          {soundEnabled && (
            <div className="rounded-xl border border-border-default p-3.5 bg-bg-surface space-y-2">
              <div className="flex items-center justify-between text-xs text-txt-secondary">
                <span>Audio Volume</span>
                <span className="font-bold text-txt-primary">{soundVolume}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={soundVolume}
                onChange={(e) => handleVolumeChange(Number(e.target.value))}
                className="w-full accent-teal-600 cursor-pointer"
              />
            </div>
          )}
        </div>

        {/* Haptic Vibration Settings */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-txt-secondary uppercase tracking-wider">
            Haptic Vibration
          </h4>

          <div className="flex items-center justify-between rounded-xl border border-border-default p-3.5 bg-bg-surface">
            <div className="flex items-center space-x-3">
              <DevicePhoneMobileIcon className="h-5 w-5 text-teal-600 shrink-0" />
              <div>
                <div className="text-sm font-bold text-txt-primary">Vibration Cues</div>
                <div className="text-xs text-txt-secondary">Android haptic pulses (Skipped safely on iOS)</div>
              </div>
            </div>

            <input
              type="checkbox"
              checked={vibrationEnabled}
              onChange={(e) => handleToggleVibration(e.target.checked)}
              className="h-5 w-5 text-teal-600 rounded focus:ring-teal-500 cursor-pointer"
            />
          </div>
        </div>

        <Button className="w-full" onClick={onClose}>
          Done
        </Button>
      </div>
    </BottomSheet>
  );
}
