import "server-only";
import { cache } from "react";
import { db } from "./db";
import { SETTING_DEFAULTS } from "./settings-defaults";

export { SETTING_DEFAULTS };

export type SettingKey = keyof typeof SETTING_DEFAULTS;

export const getSettings = cache(async () => {
  const rows = await db.setting.findMany();
  const map = { ...SETTING_DEFAULTS } as Record<SettingKey, string>;
  for (const r of rows) if (r.key in map) map[r.key as SettingKey] = r.value;
  return map;
});
