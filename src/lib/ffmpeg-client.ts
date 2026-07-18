// Lazy ffmpeg.wasm loader — client only. Do not import from server code.
import type { FFmpeg } from "@ffmpeg/ffmpeg";

let instance: FFmpeg | null = null;
let loading: Promise<FFmpeg> | null = null;

export async function getFFmpeg(onLog?: (msg: string) => void): Promise<FFmpeg> {
  if (instance) return instance;
  if (loading) return loading;
  loading = (async () => {
    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    const { toBlobURL } = await import("@ffmpeg/util");
    const ff = new FFmpeg();
    if (onLog) ff.on("log", ({ message }) => onLog(message));
    const base = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";
    await ff.load({
      coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
    });
    instance = ff;
    return ff;
  })();
  return loading;
}

export async function runFFmpeg(
  inputName: string,
  inputData: Uint8Array | ArrayBuffer,
  args: string[],
  outputName: string,
  onProgress?: (p: number) => void,
): Promise<Uint8Array> {
  const ff = await getFFmpeg();
  const bytes = inputData instanceof Uint8Array ? inputData : new Uint8Array(inputData);
  const handler = onProgress ? ({ progress }: { progress: number }) => onProgress(Math.min(1, Math.max(0, progress))) : null;
  if (handler) ff.on("progress", handler);
  try {
    await ff.writeFile(inputName, bytes);
    await ff.exec(args);
    const out = await ff.readFile(outputName);
    await ff.deleteFile(inputName).catch(() => {});
    await ff.deleteFile(outputName).catch(() => {});
    return out as Uint8Array;
  } finally {
    if (handler) ff.off("progress", handler);
  }
}

export function downloadBlob(data: Uint8Array | Blob, filename: string, mime = "application/octet-stream") {
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
