import { useEffect, useRef } from 'react';
import { avatarCropRect, drawAvatar, moveAvatarCrop, CENTERED_AVATAR, type AvatarCrop as Crop } from './avatar-crop';
export function AvatarCrop({ image, crop, onChange }: { image: ImageBitmap; crop: Crop; onChange: (crop: Crop) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const pointers = useRef(new Map<number, {x:number;y:number}>());
  const current = useRef(crop); current.current = crop;
  useEffect(() => { if (canvas.current) drawAvatar(canvas.current, image, crop); }, [image, crop]);
  function update(next: Crop) { current.current = next; onChange(next); }
  function zoom(value: number, base = current.current) {
    const next = {...base, zoom: Math.max(1, Math.min(4, value))};
    const rect = avatarCropRect(image.width, image.height, next);
    update({...next, x:rect.centerX, y:rect.centerY});
  }
  return <div className="avatar-crop" role="group" aria-label="Recadrage de la photo de profil">
    <div className="avatar-crop-frame">
      <canvas ref={canvas} width={320} height={320} tabIndex={0} role="img" aria-label="Déplacer le cadrage de la photo" aria-describedby="avatar-crop-help"
        onPointerDown={event => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY}); event.currentTarget.focus(); }}
        onPointerMove={event => {
          const previous = pointers.current.get(event.pointerId); if (!previous) return;
          const before = [...pointers.current.values()];
          pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});
          const after = [...pointers.current.values()];
          const center = (points: typeof before) => ({x:points.reduce((s,p)=>s+p.x,0)/points.length,y:points.reduce((s,p)=>s+p.y,0)/points.length});
          const a=center(before),b=center(after);
          const moved=moveAvatarCrop(image.width,image.height,current.current,b.x-a.x,b.y-a.y,event.currentTarget.getBoundingClientRect().width);
          if (before.length===2) {
            const distance=(points: typeof before)=>Math.hypot(points[1].x-points[0].x,points[1].y-points[0].y);
            const initial=distance(before); if(initial>0) zoom(moved.zoom*distance(after)/initial,moved);
          } else update(moved);
        }}
        onPointerUp={e => pointers.current.delete(e.pointerId)} onPointerCancel={e => pointers.current.delete(e.pointerId)} onLostPointerCapture={e => pointers.current.delete(e.pointerId)}
        onKeyDown={event => {
          if (['+','=','-'].includes(event.key)) { event.preventDefault(); zoom(current.current.zoom+(event.key==='-'?-.1:.1)); return; }
          const moves: Record<string,[number,number]>={ArrowLeft:[-12,0],ArrowRight:[12,0],ArrowUp:[0,-12],ArrowDown:[0,12]};
          const move=moves[event.key]; if(move) {event.preventDefault();update(moveAvatarCrop(image.width,image.height,current.current,...move,320));}
        }} />
      <span className="avatar-crop-circle" aria-hidden="true" />
    </div>
    <p id="avatar-crop-help">Déplacez la photo et pincez avec deux doigts pour zoomer. Au clavier : flèches et + / −.</p>
    <button type="button" className="text-button" onClick={() => update({...CENTERED_AVATAR})}>Recentrer</button>
  </div>;
}
