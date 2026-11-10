// Downscale an image file in the browser to a JPEG data URL small enough to
// store on the note row (max 1600×900, cropped to the cover's wide shape).
export async function fileToCover(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  const bitmap = await createImageBitmap(file);
  const ratio = 16 / 6;
  let sw = bitmap.width;
  let sh = bitmap.height;
  if (sw / sh > ratio) sw = sh * ratio;
  else sh = sw / ratio;
  const sx = (bitmap.width - sw) / 2;
  const sy = (bitmap.height - sh) / 2;
  const width = Math.min(1600, Math.round(sw));
  const height = Math.round(width / ratio);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, width, height);
  bitmap.close();
  for (const quality of [0.82, 0.7, 0.55]) {
    const url = canvas.toDataURL("image/jpeg", quality);
    if (url.length < 1_500_000) return url;
  }
  throw new Error("That image is too large.");
}
