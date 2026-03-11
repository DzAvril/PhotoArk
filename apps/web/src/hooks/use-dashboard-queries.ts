import { useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  getJobExecutions,
  getJobs,
  getSourceMediaActivity,
  getStorageCapacities,
  getStorageMediaSummary,
  getStorageRelations
} from "../lib/api";
import type { JobExecution } from "../types/api";
import { usePageVisibility } from "./use-page-visibility";

const DASHBOARD_CACHE_TTL_MS = 60000;
const DASHBOARD_ACTIVITY_CACHE_TTL_MS = 120000;

export function useStorageCapacities() {
  return useQuery({
    queryKey: ["dashboard", "storageCapacities"],
    queryFn: () => getStorageCapacities(),
    staleTime: DASHBOARD_CACHE_TTL_MS,
    refetchOnWindowFocus: true
  });
}

export function useStorageMediaSummary() {
  return useQuery({
    queryKey: ["dashboard", "storageMediaSummary"],
    queryFn: () => getStorageMediaSummary(),
    staleTime: DASHBOARD_CACHE_TTL_MS,
    refetchOnWindowFocus: true
  });
}

export function useStorageRelations() {
  return useQuery({
    queryKey: ["dashboard", "storageRelations"],
    queryFn: () => getStorageRelations(),
    staleTime: DASHBOARD_CACHE_TTL_MS,
    refetchOnWindowFocus: true
  });
}

export function useSourceMediaActivity(year: number) {
  return useQuery({
    queryKey: ["dashboard", "sourceMediaActivity", year],
    queryFn: () => getSourceMediaActivity(year),
    staleTime: DASHBOARD_ACTIVITY_CACHE_TTL_MS,
    refetchOnWindowFocus: true
  });
}

export function useJobs() {
  return useQuery({
    queryKey: ["dashboard", "jobs"],
    queryFn: () => getJobs(),
    staleTime: DASHBOARD_CACHE_TTL_MS,
    refetchOnWindowFocus: true
  });
}

function isExecutionActive(execution: JobExecution): boolean {
  return execution.status === "queued" || execution.status === "running";
}

export function useJobExecutionsWithPolling() {
  const queryClient = useQueryClient();
  const isVisible = usePageVisibility();
  const timerRef = useRef<number | null>(null);

  const query = useQuery({
    queryKey: ["dashboard", "jobExecutions"],
    queryFn: () => getJobExecutions(),
    staleTime: 0,
    refetchOnWindowFocus: true
  });

  const executions = query.data?.items ?? [];
  const hasActiveExecution = executions.some(isExecutionActive);

  useEffect(() => {
    if (!isVisible) {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const scheduleNextPoll = (delay: number) => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["dashboard", "jobExecutions"] });
      }, delay);
    };

    scheduleNextPoll(hasActiveExecution ? 1200 : 8000);

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [isVisible, hasActiveExecution, queryClient]);

  return query;
}

export function useRefreshRelationOnExecutionComplete() {
  const queryClient = useQueryClient();
  const hadActiveExecutionRef = useRef(false);

  const executionsQuery = useQuery({
    queryKey: ["dashboard", "jobExecutions"],
    queryFn: () => getJobExecutions(),
    staleTime: 0
  });

  const executions = executionsQuery.data?.items ?? [];
  const hasActiveExecution = executions.some(isExecutionActive);

  useEffect(() => {
    if (hasActiveExecution) {
      hadActiveExecutionRef.current = true;
      return;
    }

    if (!hadActiveExecutionRef.current) return;
    hadActiveExecutionRef.current = false;

    queryClient.invalidateQueries({ queryKey: ["dashboard", "storageRelations"] });
  }, [hasActiveExecution, queryClient]);
}

export function useDashboardPrimaryData() {
  const capacitiesQuery = useStorageCapacities();
  const mediaSummaryQuery = useStorageMediaSummary();
  const jobsQuery = useJobs();
  const executionsQuery = useJobExecutionsWithPolling();

  const isLoading =
    capacitiesQuery.isLoading ||
    mediaSummaryQuery.isLoading ||
    jobsQuery.isLoading ||
    executionsQuery.isLoading;

  const errors: string[] = [];
  if (capacitiesQuery.error) errors.push("存储容量");
  if (mediaSummaryQuery.error) errors.push("媒体分布");
  if (jobsQuery.error) errors.push("任务列表");
  if (executionsQuery.error) errors.push("任务进度");

  const hasError = errors.length > 0;
  const hasSuccess =
    capacitiesQuery.data || mediaSummaryQuery.data || jobsQuery.data || executionsQuery.data;

  let errorMessage = "";
  if (errors.length === 4) {
    errorMessage = `首页数据加载失败：${errors.join("、")}`;
  } else if (errors.length > 0) {
    errorMessage = `部分数据加载失败：${errors.join("、")}`;
  }

  return {
    capacities: capacitiesQuery.data?.items ?? [],
    storageMediaSummary: mediaSummaryQuery.data?.items ?? [],
    jobs: jobsQuery.data?.items ?? [],
    executions: executionsQuery.data?.items ?? [],
    isLoading,
    hasError,
    hasSuccess,
    errorMessage,
    refetchAll: useCallback(() => {
      capacitiesQuery.refetch();
      mediaSummaryQuery.refetch();
      jobsQuery.refetch();
      executionsQuery.refetch();
    }, [capacitiesQuery, mediaSummaryQuery, jobsQuery, executionsQuery])
  };
}

export function useDashboardRelationGraph() {
  const relationsQuery = useStorageRelations();
  useRefreshRelationOnExecutionComplete();

  return {
    relationNodes: relationsQuery.data?.nodes ?? [],
    relationEdges: relationsQuery.data?.edges ?? [],
    isLoading: relationsQuery.isLoading,
    error: relationsQuery.error,
    refetch: relationsQuery.refetch
  };
}

export function useDashboardSourceActivity(initialYear?: number) {
  const [selectedYear, setSelectedYear] = useState(
    initialYear ?? new Date().getFullYear()
  );

  const activityQuery = useSourceMediaActivity(selectedYear);

  useEffect(() => {
    if (activityQuery.data && activityQuery.data.year !== selectedYear) {
      setSelectedYear(activityQuery.data.year);
    }
  }, [activityQuery.data, selectedYear]);

  return {
    sourceActivity: activityQuery.data ?? null,
    selectedYear,
    setSelectedYear,
    isLoading: activityQuery.isLoading,
    error: activityQuery.error,
    years: activityQuery.data?.years ?? []
  };
}
