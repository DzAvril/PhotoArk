import path from "node:path";
import type { LivePhotoPair } from "@photoark/shared";

const IMAGE_EXTS = new Set([".heic", ".jpg", ".jpeg"]);
const VIDEO_EXTS = new Set([".mov"]);

export class LivePhotoService {
  detectPairs(paths: string[]): LivePhotoPair[] {
    const byBase = new Map<string, { image?: string; video?: string }>();

    for (const p of paths) {
      const ext = path.extname(p).toLowerCase();
      const base = p.slice(0, -ext.length);
      const curr = byBase.get(base) ?? {};

      if (IMAGE_EXTS.has(ext)) curr.image = p;
      if (VIDEO_EXTS.has(ext)) curr.video = p;

      byBase.set(base, curr);
    }

    const pairs: LivePhotoPair[] = [];
    for (const [assetId, { image, video }] of byBase.entries()) {
      if (image && video) {
        pairs.push({ assetId, imagePath: image, videoPath: video });
      }
    }

    return pairs;
  }
}
