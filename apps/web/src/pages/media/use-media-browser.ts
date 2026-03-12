import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { browseStorageMedia } from "../../lib/api";
import type { MediaBrowseResult, StorageTarget } from "../../types/api";
import type { LivePhotoPair, MediaKindFilter } from "./media-types";
import { buildDisplayItems, buildMediaSummary, detectLivePhotoPairs } from "./media-utils";

const MAX_CACHED_ITEMS = 2000;
const MEDIA_CACHE_TTL_MS = 5 * 60 * 1000;
const MEDIA_CACHE_MAX_ENTRIES = 2;
const MEDIA_CACHE_INACTIVE_KEEP = 600;

type MediaCacheEntry = {
  updatedAt: number;
  media: MediaBrowseResult;
  livePhotoCache: Map<string, LivePhotoPair>;
  cachedPaths: Set<string>;
};

const mediaCache = new Map<string, MediaCacheEntry>();

function getMediaCacheKey(storage: StorageTarget): string {
  return `${storage.id}:${storage.basePath}`;
}

function pruneMediaCache(now: number): void {
  for (const [key, entry] of mediaCache.entries()) {
    if (now - entry.updatedAt > MEDIA_CACHE_TTL_MS) {
      mediaCache.delete(key);
    }
  }

  if (mediaCache.size <= MEDIA_CACHE_MAX_ENTRIES) return;

  const sorted = [...mediaCache.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt);
  const overflow = sorted.length - MEDIA_CACHE_MAX_ENTRIES;
  for (let i = 0; i < overflow; i++) {
    mediaCache.delete(sorted[i][0]);
  }
}

function trimMediaCacheEntry(entry: MediaCacheEntry, keepCount: number): void {
  if (entry.media.files.length <= keepCount) return;
  const trimmedFiles = entry.media.files.slice(-keepCount);
  const removedPaths = new Set(entry.media.files.slice(0, entry.media.files.length - keepCount).map((f) => f.path));
  for (const path of removedPaths) {
    entry.livePhotoCache.delete(path);
    entry.cachedPaths.delete(path);
  }
  entry.media = { ...entry.media, files: trimmedFiles };
  entry.updatedAt = Date.now();
}

export function useMediaBrowser(selectedStorage: StorageTarget | undefined, kindFilter: MediaKindFilter) {
  const [media, setMedia] = useState<MediaBrowseResult | null>(null);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const pageSize = 300;
  const livePhotoCacheRef = useRef<Map<string, LivePhotoPair> | null>(null);
  const cachedPathsRef = useRef<Set<string>>(new Set());
  const cacheKey = selectedStorage ? getMediaCacheKey(selectedStorage) : null;

  const refresh = useCallback(async () => {
    if (!selectedStorage) return;
    setLoadingMedia(true);
    setError("");
    livePhotoCacheRef.current = null;
    cachedPathsRef.current.clear();
    if (selectedStorage.type === "cloud_115") {
      setError("当前版本暂不支持直接浏览 115 存储媒体");
      setLoadingMedia(false);
      return;
    }
    try {
      setMedia(await browseStorageMedia(selectedStorage.id, selectedStorage.basePath, 1, pageSize));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingMedia(false);
    }
  }, [pageSize, selectedStorage]);

  const loadMore = useCallback(async () => {
    if (!selectedStorage || loadingMore || loadingMedia) return;
    if (!media || media.page >= media.totalPages) return;
    setLoadingMore(true);
    setError("");
    try {
      const nextPage = media.page + 1;
      const next = await browseStorageMedia(selectedStorage.id, selectedStorage.basePath, nextPage, pageSize);
      setMedia((prev) => {
        if (!prev) return next;
        const combinedFiles = [...prev.files, ...next.files];
        if (combinedFiles.length > MAX_CACHED_ITEMS) {
          const trimmedFiles = combinedFiles.slice(-MAX_CACHED_ITEMS);
          const removedPaths = new Set(combinedFiles.slice(0, combinedFiles.length - MAX_CACHED_ITEMS).map(f => f.path));
          if (livePhotoCacheRef.current) {
            for (const path of removedPaths) {
              livePhotoCacheRef.current.delete(path);
            }
          }
          for (const path of removedPaths) {
            cachedPathsRef.current.delete(path);
          }
          return {
            ...next,
            files: trimmedFiles,
            page: next.page,
            totalPages: next.totalPages,
            total: next.total
          };
        }
        return {
          ...next,
          files: combinedFiles
        };
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMedia, loadingMore, media, pageSize, selectedStorage]);

  useEffect(() => {
    if (!selectedStorage) {
      setMedia(null);
      setLoadingMedia(false);
      livePhotoCacheRef.current = null;
      cachedPathsRef.current.clear();
      return;
    }
    const now = Date.now();
    const cached = cacheKey ? mediaCache.get(cacheKey) : null;
    if (cached) {
      livePhotoCacheRef.current = cached.livePhotoCache;
      cachedPathsRef.current = cached.cachedPaths;
      setMedia(cached.media);
      setLoadingMedia(false);
      if (now - cached.updatedAt <= MEDIA_CACHE_TTL_MS) {
        return;
      }
      mediaCache.delete(cacheKey as string);
    }
    void refresh();
  }, [cacheKey, refresh, selectedStorage]);

  useEffect(() => {
    if (!selectedStorage || !media || !cacheKey) return;
    const livePhotoCache = livePhotoCacheRef.current ?? new Map<string, LivePhotoPair>();
    if (!livePhotoCacheRef.current) {
      livePhotoCacheRef.current = livePhotoCache;
    }
    const entry: MediaCacheEntry = {
      updatedAt: Date.now(),
      media,
      livePhotoCache,
      cachedPaths: cachedPathsRef.current,
    };
    mediaCache.set(cacheKey, entry);
    pruneMediaCache(entry.updatedAt);
  }, [cacheKey, media, selectedStorage]);

  useEffect(() => {
    if (!selectedStorage || !cacheKey) return;
    return () => {
      const entry = mediaCache.get(cacheKey);
      if (entry) {
        trimMediaCacheEntry(entry, MEDIA_CACHE_INACTIVE_KEEP);
        pruneMediaCache(Date.now());
      }
    };
  }, [cacheKey, selectedStorage]);

  const allFiles = media?.files ?? [];
  const livePhotoPairByPath = useMemo(() => {
    if (!media) {
      livePhotoCacheRef.current = null;
      cachedPathsRef.current.clear();
      return new Map<string, LivePhotoPair>();
    }
    const cache = livePhotoCacheRef.current ?? new Map<string, LivePhotoPair>();
    const cachedPaths = cachedPathsRef.current;
    const newFiles = media.files.filter(f => !cachedPaths.has(f.path));
    if (newFiles.length > 0) {
      const newPairs = detectLivePhotoPairs({ ...media, files: newFiles });
      for (const [path, pair] of newPairs) {
        cache.set(path, pair);
      }
      for (const file of newFiles) {
        cachedPaths.add(file.path);
      }
      livePhotoCacheRef.current = cache;
    }
    return cache;
  }, [media]);
  const displayItems = useMemo(
    () => buildDisplayItems(allFiles, livePhotoPairByPath, kindFilter),
    [allFiles, livePhotoPairByPath, kindFilter]
  );
  const mediaSummary = useMemo(
    () => buildMediaSummary(allFiles, livePhotoPairByPath),
    [allFiles, livePhotoPairByPath]
  );

  const hasMore = Boolean(media && media.page < media.totalPages);

  const clearCache = useCallback(() => {
    livePhotoCacheRef.current = null;
    cachedPathsRef.current.clear();
    if (cacheKey) {
      mediaCache.delete(cacheKey);
    }
  }, [cacheKey]);

  const releaseOldItems = useCallback((keepCount: number = 500) => {
    setMedia((prev) => {
      if (!prev || prev.files.length <= keepCount) return prev;
      const trimmedFiles = prev.files.slice(-keepCount);
      const removedPaths = new Set(prev.files.slice(0, prev.files.length - keepCount).map(f => f.path));
      if (livePhotoCacheRef.current) {
        for (const path of removedPaths) {
          livePhotoCacheRef.current.delete(path);
        }
      }
      for (const path of removedPaths) {
        cachedPathsRef.current.delete(path);
      }
      return { ...prev, files: trimmedFiles };
    });
  }, []);

  return {
    media,
    setMedia,
    loadingMedia,
    loadingMore,
    error,
    setError,
    displayItems,
    mediaSummary,
    refresh,
    livePhotoPairByPath,
    hasMore,
    loadMore,
    clearCache,
    releaseOldItems
  };
}
