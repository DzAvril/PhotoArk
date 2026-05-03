import { useLocation } from "react-router-dom";
import { getSyncPageMode } from "../navigation/navigation-model";
import { JobDiffPage } from "./job-diff-page";
import { JobsPage } from "./jobs-page";

export function SyncPage() {
  const location = useLocation();
  const mode = getSyncPageMode(location.search);

  if (mode === "jobs" || mode === "running") {
    return <JobsPage />;
  }

  return <JobDiffPage />;
}
