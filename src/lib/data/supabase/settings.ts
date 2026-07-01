import "server-only";

import { DEFAULT_THRESHOLDS } from "@/lib/domain";
import type { DashThresholds, StockAlert } from "@/lib/domain";
import type { SettingsRepository } from "../repository";
import type { RepoContext } from "./context";

export function makeSettingsRepo(ctx: RepoContext): SettingsRepository {
  const { sb, svc } = ctx;

  const settingsRepo: SettingsRepository = {
    async getThresholds() {
      const { data, error } = await sb
        .from("settings_kv")
        .select("value")
        .eq("key", "dash_thresholds")
        .maybeSingle();
      if (error) throw error;
      const value = (data?.value as Partial<DashThresholds> | undefined) ?? {};
      return { ...DEFAULT_THRESHOLDS, ...value };
    },

    async setThresholds(patch) {
      const current = await this.getThresholds();
      const next = { ...current, ...patch };
      const { error } = await svc
        .from("settings_kv")
        .upsert(
          { key: "dash_thresholds", value: next },
          { onConflict: "key" },
        );
      if (error) throw error;
      return next;
    },

    async getDismissedNotifications() {
      const { data, error } = await sb
        .from("settings_kv")
        .select("value")
        .eq("key", "dismissed_notifications")
        .maybeSingle();
      if (error) throw error;
      const value = data?.value as { ids?: string[] } | undefined;
      return value?.ids ?? [];
    },

    async setNotificationDismissed(id, dismissed) {
      const current = new Set(await this.getDismissedNotifications());
      if (dismissed) current.add(id);
      else current.delete(id);
      const { error } = await svc
        .from("settings_kv")
        .upsert(
          { key: "dismissed_notifications", value: { ids: [...current] } },
          { onConflict: "key" },
        );
      if (error) throw error;
    },

    async getStockAlerts() {
      const { data, error } = await sb
        .from("settings_kv")
        .select("value")
        .eq("key", "stock_alerts")
        .maybeSingle();
      if (error) throw error;
      const value = data?.value as { alerts?: StockAlert[] } | undefined;
      return value?.alerts ?? [];
    },

    async setStockAlerts(alerts) {
      const { error } = await svc
        .from("settings_kv")
        .upsert(
          { key: "stock_alerts", value: { alerts } },
          { onConflict: "key" },
        );
      if (error) throw error;
    },
  };

  return settingsRepo;
}
