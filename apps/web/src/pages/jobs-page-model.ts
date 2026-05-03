import type { BackupJob, StorageTarget } from "../types/api";

export type JobForm = {
  name: string;
  sourceTargetId: string;
  sourcePath: string;
  destinationTargetId: string;
  destinationPath: string;
  schedule: string;
  watchMode: boolean;
  enabled: boolean;
};

export function createInitialJobForm(sourceTargetId = "", destinationTargetId = ""): JobForm {
  return {
    name: "",
    sourceTargetId,
    sourcePath: "",
    destinationTargetId,
    destinationPath: "",
    schedule: "0 2 * * *",
    watchMode: false,
    enabled: true
  };
}

export function buildJobPayload(
  form: JobForm,
  sourceStorage: StorageTarget,
  destinationStorage: StorageTarget
): Omit<BackupJob, "id"> {
  return {
    name: form.name,
    sourceTargetId: form.sourceTargetId,
    sourcePath: form.sourcePath.trim() || sourceStorage.basePath,
    destinationTargetId: form.destinationTargetId,
    destinationPath: form.destinationPath.trim() || destinationStorage.basePath,
    schedule: form.schedule,
    watchMode: form.watchMode,
    enabled: form.enabled
  };
}
