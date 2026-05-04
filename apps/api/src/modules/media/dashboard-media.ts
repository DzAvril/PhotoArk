import type { BackupJob, StorageTarget } from "@photoark/shared";

type DashboardRootRef = {
  storageId: string;
  path: string;
};

function isDashboardLocalStorage(type: StorageTarget["type"]): boolean {
  return type === "local_fs" || type === "external_ssd";
}

function uniqueRootRefs(roots: DashboardRootRef[]): DashboardRootRef[] {
  const seen = new Set<string>();
  const result: DashboardRootRef[] = [];

  for (const root of roots) {
    const key = `${root.storageId}::${root.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(root);
  }

  return result;
}

function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const pathValue of paths) {
    const trimmed = pathValue.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }

  return result;
}

export function selectDashboardSourceActivityRoots(storages: StorageTarget[], jobs: BackupJob[]): DashboardRootRef[] {
  const localStorageIds = new Set(storages.filter((storage) => isDashboardLocalStorage(storage.type)).map((storage) => storage.id));
  const jobRoots = uniqueRootRefs(
    jobs
      .filter((job) => localStorageIds.has(job.sourceTargetId))
      .map((job) => ({
        storageId: job.sourceTargetId,
        path: job.sourcePath
      }))
  );

  if (jobRoots.length > 0) return jobRoots;

  return storages
    .filter((storage) => isDashboardLocalStorage(storage.type))
    .map((storage) => ({
      storageId: storage.id,
      path: storage.basePath
    }));
}

export function selectDashboardStorageMediaRoots(storage: StorageTarget, jobs: BackupJob[]): string[] {
  if (!isDashboardLocalStorage(storage.type)) return [storage.basePath];

  const jobPaths = jobs.flatMap((job) => {
    const paths: string[] = [];
    if (job.sourceTargetId === storage.id) paths.push(job.sourcePath);
    if (job.destinationTargetId === storage.id) paths.push(job.destinationPath);
    return paths;
  });

  return uniquePaths(jobPaths.length > 0 ? jobPaths : [storage.basePath]);
}
