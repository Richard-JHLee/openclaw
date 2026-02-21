import { describe, expect, it, vi } from "vitest";
import type { TelegramFileInfo } from "./download.js";

vi.mock("../media/fetch.js", () => ({
  fetchRemoteMedia: vi.fn(async () => ({
    buffer: Buffer.from([1, 2, 3, 4]),
    contentType: "image/jpeg",
    fileName: "1.jpg",
  })),
}));

const { downloadTelegramFile, getTelegramFile } = await import("./download.js");

describe("telegram download", () => {
  it("fetches file info", async () => {
    const json = vi.fn().mockResolvedValue({ ok: true, result: { file_path: "photos/1.jpg" } });
    vi.spyOn(global, "fetch" as never).mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      json,
    } as Response);
    const info = await getTelegramFile("tok", "fid");
    expect(info.file_path).toBe("photos/1.jpg");
  });

  it("downloads and saves", async () => {
    const { fetchRemoteMedia } = (await import("../media/fetch.js")) as unknown as {
      fetchRemoteMedia: ReturnType<typeof vi.fn>;
    };
    const info: TelegramFileInfo = {
      file_id: "fid",
      file_path: "photos/1.jpg",
    };
    const saved = await downloadTelegramFile("tok", info, 1024 * 1024);
    expect(fetchRemoteMedia).toHaveBeenCalledWith({
      url: "https://api.telegram.org/file/bottok/photos/1.jpg",
      maxBytes: 1024 * 1024,
      timeoutMs: 60_000,
      filePathHint: "photos/1.jpg",
    });
    expect(saved.path).toBeTruthy();
    expect(saved.contentType).toBe("image/jpeg");
  });

  it("fails fast when file_size exceeds maxBytes", async () => {
    const info: TelegramFileInfo = {
      file_id: "fid",
      file_path: "photos/1.jpg",
      file_size: 5 * 1024 * 1024,
    };
    await expect(downloadTelegramFile("tok", info, 1024 * 1024)).rejects.toThrow(
      /exceeds maxBytes/i,
    );
  });
});
