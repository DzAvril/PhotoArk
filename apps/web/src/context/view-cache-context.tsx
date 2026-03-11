import { createContext, useContext, useRef, ReactNode } from "react";
import type { JobDiffResult } from "../types/api";

export type JobDiffCache = {
  selectedJobId: string;
  result: JobDiffResult | null;
  items: any[]; // JobDiffItem[] but avoiding circular deps if type is complex
  page: number;
  hasMore: boolean;
  scrollTop: number;
};

export type MediaBrowserCache = {
  selectedStorageId: string | undefined;
  kindFilter: "all" | "image" | "video";
};

type ViewCache = {
  jobDiff: JobDiffCache | null;
  mediaBrowser: MediaBrowserCache | null;
};

const ViewCacheContext = createContext<{
  cache: React.MutableRefObject<ViewCache>;
} | null>(null);

export function ViewCacheProvider({ children }: { children: ReactNode }) {
  const cache = useRef<ViewCache>({ jobDiff: null, mediaBrowser: null });
  return (
    <ViewCacheContext.Provider value={{ cache }}>
      {children}
    </ViewCacheContext.Provider>
  );
}

export function useViewCache() {
  const context = useContext(ViewCacheContext);
  if (!context) {
    throw new Error("useViewCache must be used within ViewCacheProvider");
  }
  return context.cache;
}
