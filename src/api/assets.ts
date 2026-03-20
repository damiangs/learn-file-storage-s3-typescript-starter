import { existsSync, mkdirSync } from "fs";
import path from "path";

import type { ApiConfig } from "../config";

export function ensureAssetsDir(cfg: ApiConfig) {
  if (!existsSync(cfg.assetsRoot)) {
    mkdirSync(cfg.assetsRoot, { recursive: true });
  }
}

export function getAssetURL(cfg: ApiConfig, assetPath: string) {
  return `http://localhost:${cfg.port}/assets/${assetPath}`;
}

export function mediaTypeToExt(str: string) {
  const parts = str.split("/");

  if (parts.length !== 2) {
    return ".bin";
  }
  const extension = "." + parts[1];

  return extension;
}

export function getAssetDiskPath(cfg: ApiConfig, filename: string) {
  const fullDiskPath = path.join(cfg.assetsRoot, filename);

  return fullDiskPath;
}
