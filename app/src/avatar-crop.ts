import { checkPhotoAbort } from './photo-task';
export const AVATAR_SIZE = 320;
export const AVATAR_MAX_BYTES = 40_000;
export interface AvatarCrop { x: number; y: number; zoom: number }
export const CENTERED_AVATAR: AvatarCrop = { x: .5, y: .5, zoom: 1 };
export function avatarCropRect(width: number, height: number, crop: AvatarCrop) {
  const edge = Math.min(width, height) / Math.max(1, Math.min(4, crop.zoom));
  const x = Math.max(0, Math.min(width - edge, crop.x * width - edge / 2));
  const y = Math.max(0, Math.min(height - edge, crop.y * height - edge / 2));
  return { x, y, edge, centerX: (x + edge / 2) / width, centerY: (y + edge / 2) / height };
}
export function moveAvatarCrop(width: number, height: number, crop: AvatarCrop, dx: number, dy: number, viewport: number): AvatarCrop {
  const rect = avatarCropRect(width, height, crop);
  const next = { ...crop, x: rect.centerX - dx * rect.edge / viewport / width, y: rect.centerY - dy * rect.edge / viewport / height };
  const bounded = avatarCropRect(width, height, next);
  return { ...next, x: bounded.centerX, y: bounded.centerY };
}
export function drawAvatar(canvas: HTMLCanvasElement, image: ImageBitmap, crop: AvatarCrop) {
  canvas.width = canvas.height = AVATAR_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Recadrage indisponible.');
  const rect = avatarCropRect(image.width, image.height, crop);
  context.fillStyle = '#fff'; context.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
  context.drawImage(image, rect.x, rect.y, rect.edge, rect.edge, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
}
/** Pas de détection ni de floutage sur les portraits privés. Le rendu supprime les métadonnées. */
export async function encodeAvatar(image: ImageBitmap, crop: AvatarCrop, signal?: AbortSignal): Promise<string> {
  checkPhotoAbort(signal);
  const canvas = document.createElement('canvas');
  drawAvatar(canvas, image, crop);
  try {
    // Réduire aussi les dimensions si un portrait très détaillé dépasse 40 Ko.
    for (const size of [320, 256, 192, 128]) {
      drawAvatar(canvas, image, crop);
      if(size !== AVATAR_SIZE) {
        const copy=document.createElement('canvas'); copy.width=copy.height=size;
        copy.getContext('2d')!.drawImage(canvas,0,0,size,size);
        canvas.width=canvas.height=size;canvas.getContext('2d')!.drawImage(copy,0,0);copy.width=copy.height=1;
      }
      for (const quality of [.82,.65,.48,.32,.18,.08]) {
        const value=canvas.toDataURL('image/webp',quality);
        const base64=value.split(',')[1] || '';
        const bytes=base64.length*3/4-(base64.endsWith('==')?2:base64.endsWith('=')?1:0);
        if(value.startsWith('data:image/webp;base64,') && bytes<=AVATAR_MAX_BYTES) return value;
      }
    }
    throw new Error('Impossible de préparer ce portrait. Essayez une autre photo.');
  } finally { canvas.width = canvas.height = 1; }
}
