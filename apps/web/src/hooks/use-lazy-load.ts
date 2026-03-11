import { useCallback, useEffect, useRef, useState } from "react";

interface UseLazyLoadOptions {
  rootMargin?: string;
  threshold?: number;
  maxConcurrent?: number;
  priority?: number;
}

interface UseLazyLoadResult {
  ref: (element: HTMLElement | null) => void;
  isVisible: boolean;
  isLoading: boolean;
  hasError: boolean;
}

interface QueueItem {
  id: string;
  priority: number;
  element: HTMLElement;
  onLoadStart: () => void;
  onLoadSuccess: () => void;
  onLoadError: () => void;
}

class LazyLoadQueueManager {
  private static instance: LazyLoadQueueManager;
  private queue: QueueItem[] = [];
  private activeCount = 0;
  private maxConcurrent: number;
  private observers: Map<string, IntersectionObserver> = new Map();
  private idCounter = 0;
  private pageVisible: boolean = true;
  private pausedQueue: QueueItem[] = [];

  private constructor(maxConcurrent = 10) {
    this.maxConcurrent = maxConcurrent;
    this.setupVisibilityListener();
  }

  static getInstance(maxConcurrent = 10): LazyLoadQueueManager {
    if (!LazyLoadQueueManager.instance) {
      LazyLoadQueueManager.instance = new LazyLoadQueueManager(maxConcurrent);
    }
    return LazyLoadQueueManager.instance;
  }

  private setupVisibilityListener(): void {
    if (typeof document === "undefined") return;

    this.pageVisible = !document.hidden;

    const handleChange = () => {
      const wasHidden = !this.pageVisible;
      this.pageVisible = !document.hidden;

      if (wasHidden && this.pageVisible) {
        this.processQueue();
      }
    };

    document.addEventListener("visibilitychange", handleChange);
  }

  setPageVisible(visible: boolean): void {
    const wasHidden = !this.pageVisible;
    this.pageVisible = visible;
    if (wasHidden && visible) {
      this.processQueue();
    }
  }

  setMaxConcurrent(max: number): void {
    this.maxConcurrent = max;
    if (this.pageVisible) {
      this.processQueue();
    }
  }

  generateId(): string {
    return `lazy-load-${++this.idCounter}`;
  }

  register(
    element: HTMLElement,
    options: {
      rootMargin: string;
      threshold: number;
      priority: number;
      onLoadStart: () => void;
      onLoadSuccess: () => void;
      onLoadError: () => void;
    }
  ): string {
    const id = this.generateId();

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            this.addToQueue({
              id,
              priority: options.priority,
              element,
              onLoadStart: options.onLoadStart,
              onLoadSuccess: options.onLoadSuccess,
              onLoadError: options.onLoadError,
            });
            this.disconnect(id);
          }
        });
      },
      {
        rootMargin: options.rootMargin,
        threshold: options.threshold,
      }
    );

    observer.observe(element);
    this.observers.set(id, observer);

    return id;
  }

  unregister(id: string): void {
    this.disconnect(id);
    this.queue = this.queue.filter((item) => item.id !== id);
    this.pausedQueue = this.pausedQueue.filter((item) => item.id !== id);
  }

  private disconnect(id: string): void {
    const observer = this.observers.get(id);
    if (observer) {
      observer.disconnect();
      this.observers.delete(id);
    }
  }

  private addToQueue(item: QueueItem): void {
    const existingIndex = this.queue.findIndex((q) => q.id === item.id);
    if (existingIndex !== -1) {
      this.queue[existingIndex] = item;
    } else {
      this.queue.push(item);
    }

    this.queue.sort((a, b) => b.priority - a.priority);

    this.processQueue();
  }

  private processQueue(): void {
    if (!this.pageVisible) {
      return;
    }

    while (this.activeCount < this.maxConcurrent && this.queue.length > 0) {
      const item = this.queue.shift();
      if (item) {
        this.loadItem(item);
      }
    }
  }

  private loadItem(item: QueueItem): void {
    this.activeCount++;
    item.onLoadStart();

    const images = item.element.querySelectorAll<HTMLImageElement>("img[data-src]");
    const videos = item.element.querySelectorAll<HTMLVideoElement>("video[data-src]");

    let totalAssets = images.length + videos.length;
    let loadedAssets = 0;
    let hasError = false;

    const checkComplete = () => {
      loadedAssets++;
      if (loadedAssets === totalAssets) {
        this.activeCount--;
        if (hasError) {
          item.onLoadError();
        } else {
          item.onLoadSuccess();
        }
        this.processQueue();
      }
    };

    const handleError = () => {
      hasError = true;
      checkComplete();
    };

    if (totalAssets === 0) {
      this.activeCount--;
      item.onLoadSuccess();
      this.processQueue();
      return;
    }

    images.forEach((img) => {
      const src = img.dataset.src;
      if (src) {
        img.src = src;
        img.onload = checkComplete;
        img.onerror = handleError;
      }
    });

    videos.forEach((video) => {
      const src = video.dataset.src;
      if (src) {
        video.src = src;
        video.onloadedmetadata = checkComplete;
        video.onerror = handleError;
      }
    });
  }
}

const defaultManager = LazyLoadQueueManager.getInstance();

export function useLazyLoad(options: UseLazyLoadOptions = {}): UseLazyLoadResult {
  const {
    rootMargin = "200px",
    threshold = 0,
    maxConcurrent = 10,
    priority = 0,
  } = options;

  const [isVisible, setIsVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  const elementRef = useRef<HTMLElement | null>(null);
  const idRef = useRef<string | null>(null);

  useEffect(() => {
    defaultManager.setMaxConcurrent(maxConcurrent);
  }, [maxConcurrent]);

  const ref = useCallback(
    (element: HTMLElement | null) => {
      if (idRef.current) {
        defaultManager.unregister(idRef.current);
        idRef.current = null;
      }

      elementRef.current = element;

      if (element) {
        setIsVisible(false);
        setIsLoading(false);
        setHasError(false);

        idRef.current = defaultManager.register(element, {
          rootMargin,
          threshold,
          priority,
          onLoadStart: () => {
            setIsLoading(true);
            setHasError(false);
          },
          onLoadSuccess: () => {
            setIsVisible(true);
            setIsLoading(false);
            setHasError(false);
          },
          onLoadError: () => {
            setIsVisible(true);
            setIsLoading(false);
            setHasError(true);
          },
        });
      }
    },
    [rootMargin, threshold, priority]
  );

  useEffect(() => {
    return () => {
      if (idRef.current) {
        defaultManager.unregister(idRef.current);
      }
    };
  }, []);

  return {
    ref,
    isVisible,
    isLoading,
    hasError,
  };
}

export { LazyLoadQueueManager };
