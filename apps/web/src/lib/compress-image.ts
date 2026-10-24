/**
 * Shrinks a picked photo to about `maxSide` px on its longest side and
 * re-encodes it as JPEG, returning a data URL small enough for the catalog's
 * `localStorage` budget (owner-views §9, Photos). Browser-only.
 */
export async function compressImage(file: Blob, maxSide = 800, quality = 0.8): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  // JPEG has no alpha: paint transparent PNGs over white instead of black.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', quality);
}
