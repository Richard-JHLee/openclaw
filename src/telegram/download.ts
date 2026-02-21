import { fetchRemoteMedia } from "../media/fetch.js";
import { type SavedMedia, saveMediaBuffer } from "../media/store.js";

export type TelegramFileInfo = {
  file_id: string;
  file_unique_id?: string;
  file_size?: number;
  file_path?: string;
};

export async function getTelegramFile(
  token: string,
  fileId: string,
  timeoutMs = 30_000,
): Promise<TelegramFileInfo> {
  const res = await fetch(
    `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`,
    { signal: AbortSignal.timeout(timeoutMs) },
  );
  if (!res.ok) {
    throw new Error(`getFile failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as { ok: boolean; result?: TelegramFileInfo };
  if (!json.ok || !json.result?.file_path) {
    throw new Error("getFile returned no file_path");
  }
  return json.result;
}

export async function downloadTelegramFile(
  token: string,
  info: TelegramFileInfo,
  maxBytes?: number,
  timeoutMs = 60_000,
): Promise<SavedMedia> {
  if (!info.file_path) {
    throw new Error("file_path missing");
  }
  if (maxBytes && typeof info.file_size === "number" && Number.isFinite(info.file_size)) {
    if (info.file_size > maxBytes) {
      throw new Error(`Telegram file exceeds maxBytes ${maxBytes} (file_size: ${info.file_size})`);
    }
  }
  const url = `https://api.telegram.org/file/bot${token}/${info.file_path}`;
  const fetched = await fetchRemoteMedia({
    url,
    maxBytes,
    timeoutMs,
    filePathHint: info.file_path,
  });
  // save with inbound subdir (saveMediaBuffer re-sniffs mime defensively)
  return await saveMediaBuffer(
    fetched.buffer,
    fetched.contentType,
    "inbound",
    maxBytes,
    info.file_path,
  );
}
