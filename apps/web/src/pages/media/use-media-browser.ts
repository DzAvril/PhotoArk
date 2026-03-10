import { useCallback, useEffect, useMemo, useState } from "react";
import { browseStorageMedia } from "../../lib/api";
import type { MediaBrowseResult, StorageTarget } from "../../types/api";
import type { MediaKindFilter } from "./media-types";
import { buildDisplayItems, buildMediaSummary, detectLivePhotoPairs } from "./media-utils";

export function useMediaBrowser(selectedStorage: StorageTarget | undefined, kindFilter: MediaKindFilter) {
  const [media, setMedia] = useState<MediaBrowseResult | null>(null);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!selectedStorage) return;
    setLoadingMedia(true);
    setError("");
    if (selectedStorage.type === "cloud_115") {
      setError("当前版本暂不支持直接浏览 115 存储媒体");
      setLoadingMedia(false);
      return;
    }
    try {
      setMedia(await browseStorageMedia(selectedStorage.id, selectedStorage.basePath));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingMedia(false);
    }
  }, [selectedStorage]);

  useEffect(() => {
    if (!selectedStorage) {
      setMedia(null);
      setLoadingMedia(false);
      return;
    }
    void refresh();
  }, [selectedStorage?.id, refresh]);

  const allFiles = media?.files ?? [];
  const livePhotoPairByPath = useMemo(() => detectLivePhotoPairs(media), [media]);
  const displayItems = useMemo(
    () => buildDisplayItems(allFiles, livePhotoPairByPath, kindFilter),
    [allFiles, livePhotoPairByPath, kindFilter]
  );
  const mediaSummary = useMemo(
    () => buildMediaSummary(allFiles, livePhotoPairByPath),
    [allFiles, livePhotoPairByPath]
  );

  return {
    media,
    setMedia,
    loadingMedia,
    error,
    setError,
    displayItems,
    mediaSummary,
    refresh,
    livePhotoPairByPath
  };
}
