import { useEffect, useState } from "react";

export function usePageVisibility(): boolean {
  const [isVisible, setIsVisible] = useState(() => {
    if (typeof document === "undefined") return true;
    return !document.hidden;
  });

  useEffect(() => {
    if (typeof document === "undefined") return;

    const handleChange = () => {
      setIsVisible(!document.hidden);
    };

    document.addEventListener("visibilitychange", handleChange);
    return () => {
      document.removeEventListener("visibilitychange", handleChange);
    };
  }, []);

  return isVisible;
}
