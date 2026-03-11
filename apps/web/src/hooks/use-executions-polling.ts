import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getJobExecutions } from "../lib/api";
import type { JobExecution } from "../types/api";
import { usePageVisibility } from "./use-page-visibility";

function isExecutionActive(execution: JobExecution): boolean {
  return execution.status === "queued" || execution.status === "running";
}

const POLL_INTERVAL_ACTIVE = 1200;
const POLL_INTERVAL_IDLE = 8000;
const POLL_INTERVAL_MAX_BACKOFF = 30000;
const BACKOFF_MULTIPLIER = 1.5;
const NO_CHANGE_THRESHOLD = 3;

type ExecutionsPollingResult = {
  executions: JobExecution[];
  hasAnyActiveExecution: boolean;
  isLoading: boolean;
};

export function useExecutionsPolling(): ExecutionsPollingResult {
  const [currentInterval, setCurrentInterval] = useState(POLL_INTERVAL_IDLE);
  const isVisible = usePageVisibility();
  const noChangeCountRef = useRef(0);
  const prevExecutionsRef = useRef<string>("");

  const { data: executions = [], isLoading } = useQuery({
    queryKey: ["job-executions"],
    queryFn: async () => {
      const result = await getJobExecutions();
      return result.items;
    },
    refetchInterval: isVisible ? currentInterval : false,
    refetchIntervalInBackground: false,
    staleTime: 0,
    gcTime: 0,
  });

  const hasAnyActiveExecution = executions.some(isExecutionActive);

  useEffect(() => {
    const executionsKey = JSON.stringify(
      executions.map((e) => ({ id: e.id, status: e.status, updatedAt: e.updatedAt }))
    );

    if (executionsKey === prevExecutionsRef.current) {
      noChangeCountRef.current++;
    } else {
      noChangeCountRef.current = 0;
      prevExecutionsRef.current = executionsKey;
    }

    let nextInterval: number;
    if (hasAnyActiveExecution) {
      nextInterval = POLL_INTERVAL_ACTIVE;
    } else if (noChangeCountRef.current >= NO_CHANGE_THRESHOLD) {
      nextInterval = Math.min(
        POLL_INTERVAL_IDLE * Math.pow(BACKOFF_MULTIPLIER, noChangeCountRef.current - NO_CHANGE_THRESHOLD),
        POLL_INTERVAL_MAX_BACKOFF
      );
    } else {
      nextInterval = POLL_INTERVAL_IDLE;
    }

    setCurrentInterval(nextInterval);
  }, [executions, hasAnyActiveExecution]);

  return {
    executions,
    hasAnyActiveExecution,
    isLoading,
  };
}
