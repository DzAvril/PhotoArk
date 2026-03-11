import { renderHook } from "@testing-library/react";
import { useViewCache, ViewCacheProvider } from "./view-cache-context";

describe("ViewCacheContext", () => {
  it("should provide a cache object", () => {
    const { result } = renderHook(() => useViewCache(), {
      wrapper: ViewCacheProvider,
    });

    expect(result.current.current).toEqual({
      jobDiff: null,
      mediaBrowser: null,
    });
  });

  it("should persist values across renders", () => {
    const { result, rerender } = renderHook(() => useViewCache(), {
      wrapper: ViewCacheProvider,
    });

    // Update cache
    result.current.current.jobDiff = {
      selectedJobId: "job-1",
      result: null,
      items: [],
      page: 1,
      hasMore: false,
      scrollTop: 100,
    };

    rerender();

    expect(result.current.current.jobDiff?.selectedJobId).toBe("job-1");
    expect(result.current.current.jobDiff?.scrollTop).toBe(100);
  });
});
