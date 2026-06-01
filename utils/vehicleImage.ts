export const VEHICLE_IMAGE_REQUIRED_MSG = 'صورة السيارة إجباري — يرجى رفع صورة';

export function hasVehicleImage(image?: string | null): boolean {
  return Boolean(String(image ?? '').trim());
}

const MAX_WIDTH = 480;
const MAX_HEIGHT = 320;
const JPEG_QUALITY = 0.82;
const MAX_FILE_BYTES = 8 * 1024 * 1024;

export async function fileToVehicleImageDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('يرجى اختيار ملف صورة');
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('حجم الصورة كبير — الحد الأقصى 8 ميجابايت');
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_WIDTH / bitmap.width, MAX_HEIGHT / bitmap.height);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('تعذّر معالجة الصورة');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  if (dataUrl.length > 900_000) {
    throw new Error('الصورة كبيرة بعد الضغط — جرّب صورة أصغر');
  }
  return dataUrl;
}
