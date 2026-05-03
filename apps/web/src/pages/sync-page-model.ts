import type { SyncTabValue } from "../navigation/navigation-model";

export const syncTabValues: SyncTabValue[] = ["diff", "jobs", "running"];

export function getSyncTabFromSearch(search: string): SyncTabValue {
  const params = new URLSearchParams(search);
  const raw = params.get("tab");
  return syncTabValues.includes(raw as SyncTabValue) ? (raw as SyncTabValue) : "diff";
}

export function setSyncTabInSearch(search: string, tab: SyncTabValue): string {
  const params = new URLSearchParams(search);
  params.set("tab", tab);
  const next = params.toString();
  return next ? `?${next}` : "";
}
