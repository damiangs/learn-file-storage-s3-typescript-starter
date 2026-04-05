import { respondWithJSON } from "./json";

import { type ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";
import { getBearerToken, validateJWT } from "../auth";
import { getVideo, updateVideo, type Video } from "../db/videos";
import { uploadVideoToS3 } from "../s3";
import { rm } from "fs/promises";
import path from "path";

export async function handlerUploadVideo(cfg: ApiConfig, req: BunRequest) {
  const MAX_UPLOAD_SIZE = 1 << 30;

  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  const video = getVideo(cfg.db, videoId);
  if (!video) {
    throw new NotFoundError("Video not found");
  }
  if (video.userID !== userID) {
    throw new UserForbiddenError("Not authorized to update this video");
  }

  const formData = await req.formData();
  const file = formData.get("video");
  if (!(file instanceof File)) {
    throw new BadRequestError("Thumbnail file missing");
  }
  if (file.size > MAX_UPLOAD_SIZE) {
    throw new BadRequestError("Upload file too large");
  }

  const mediaType = file.type;
  if (mediaType !== "video/mp4") {
    throw new BadRequestError("Invalid file type. Only MP4 allowed.");
  }

  const tempFilePath = path.join("/tmp", `${videoId}.mp4`);
  await Bun.write(tempFilePath, file);

  const aspectRatio = await getVideoAspectRatio(tempFilePath);

  const processedFilePath = await processVideoForFastStart(tempFilePath);

  const key = `${aspectRatio}/${videoId}.mp4`;
  const videoURL = `${cfg.s3CfDistribution}/${key}`;
  await uploadVideoToS3(cfg, key, processedFilePath, mediaType);
  video.videoURL = videoURL;
  updateVideo(cfg.db, video);

  await rm(tempFilePath, { force: true });
  await rm(processedFilePath, { force: true });

  return respondWithJSON(200, videoURL);
}

export async function getVideoAspectRatio(filePath: string) {
  const process = Bun.spawn(
    [
      "ffprobe",
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "json",
      filePath,
    ],
    {
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  const stdoutText = await new Response(process.stdout).text();
  const stderrText = await new Response(process.stderr).text();

  const exitCode = await process.exited;
  if (exitCode !== 0) {
    throw new Error(`ffprobe failed: ${stderrText}`);
  }

  const output = JSON.parse(stdoutText);
  const { width, height } = output.streams[0];

  return width === Math.floor((16 / 9) * height)
    ? "landscape"
    : height === Math.floor((16 / 9) * width)
      ? "portrait"
      : "other";
}

export async function processVideoForFastStart(inputFilePath: string) {
  const processedFilePath = `${inputFilePath}.processed.mp4`;

  const process = Bun.spawn(
    [
      "ffmpeg",
      "-i",
      inputFilePath,
      "-movflags",
      "faststart",
      "-map_metadata",
      "0",
      "-codec",
      "copy",
      "-f",
      "mp4",
      processedFilePath,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );

  const stderrText = await new Response(process.stderr).text();

  const exitCode = await process.exited;
  if (exitCode !== 0) {
    throw new Error(`ffmpeg failed: ${stderrText}`);
  }

  return processedFilePath;
}
