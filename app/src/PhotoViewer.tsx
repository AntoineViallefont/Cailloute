import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Modal } from "./Modal";
import { PhotoCredit } from './PhotoCredit';
import { photoCredit } from './photo-credit';

export function PhotoViewer({
  photos,
  initialIndex = 0,
  placeName,
  onClose,
}: {
  photos: { url: string; caption?: string }[];
  placeName?: string;
  initialIndex?: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [natural, setNatural] = useState({ width: 1, height: 1 });
  const viewport = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const tap = useRef({ time: 0, x: 0, y: 0 });
  const down = useRef({ time: 0, x: 0, y: 0, moved: false });
  const scroll = useRef<{ left: number; top: number } | null>(null);
  const zoomRef = useRef(1);
  const lastTouch = useRef(0);
  const multi = useRef(false);
  const fit = Math.min(
    size.width / natural.width,
    size.height / natural.height,
  );
  const base = { width: natural.width * fit, height: natural.height * fit };
  useEffect(() => {
    const node = viewport.current!;
    const observer = new ResizeObserver(() =>
      setSize({ width: node.clientWidth, height: node.clientHeight }),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    if (scroll.current && viewport.current) {
      viewport.current.scrollLeft = scroll.current.left;
      viewport.current.scrollTop = scroll.current.top;
      scroll.current = null;
    }
  }, [zoom]);
  function zoomTo(value: number, x: number, y: number) {
    const node = viewport.current!;
    const next = Math.max(1, Math.min(6, value)),
      old = zoomRef.current;
    const rect = node.getBoundingClientRect();
    const px = x - rect.left,
      py = y - rect.top;
    scroll.current = {
      left:
        ((node.scrollLeft +
          px -
          Math.max(0, (size.width - base.width * old) / 2)) *
          next) /
          old +
        Math.max(0, (size.width - base.width * next) / 2) -
        px,
      top:
        ((node.scrollTop +
          py -
          Math.max(0, (size.height - base.height * old) / 2)) *
          next) /
          old +
        Math.max(0, (size.height - base.height * next) / 2) -
        py,
    };
    zoomRef.current = next;
    setZoom(next);
  }
  function change(next: number) {
    setIndex(next);
    zoomRef.current = 1;
    setZoom(1);
    setNatural({ width: 1, height: 1 });
    pointers.current.clear();
    tap.current.time = 0;
    viewport.current?.scrollTo(0, 0);
  }
  return (
    <Modal title="Photos" className="photo-viewer" onClose={onClose}>
      {placeName && <p className="photo-place-name">{placeName}</p>}
      <PhotoCredit caption={photos[index].caption||''} />
      <div
        ref={viewport}
        className="photo-canvas"
        tabIndex={0}
        role="region"
        aria-label="Photo agrandie, défilement horizontal et vertical"
        data-zoom={zoom}
        onKeyDown={(e) => {
          if (
            zoomRef.current === 1 &&
            e.key === "ArrowRight" &&
            index < photos.length - 1
          )
            change(index + 1);
          if (zoomRef.current === 1 && e.key === "ArrowLeft" && index > 0)
            change(index - 1);
        }}
        onDoubleClick={(e) => {
          if (Date.now() - lastTouch.current < 700) return;
          zoomTo(zoomRef.current > 1 ? 1 : 2.5, e.clientX, e.clientY);
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          if (e.pointerType !== "mouse") lastTouch.current = Date.now();
          e.currentTarget.setPointerCapture(e.pointerId);
          if (!pointers.current.size) multi.current = false;
          else multi.current = true;
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          down.current = {
            time: Date.now(),
            x: e.clientX,
            y: e.clientY,
            moved: pointers.current.size > 1,
          };
        }}
        onPointerMove={(e) => {
          const previous = pointers.current.get(e.pointerId);
          if (!previous) return;
          const next = { x: e.clientX, y: e.clientY };
          if (Math.hypot(next.x - down.current.x, next.y - down.current.y) > 8)
            down.current.moved = true;
          if (pointers.current.size === 2) {
            down.current.moved = true;
            tap.current.time = 0;
            const other = [...pointers.current.entries()].find(
              ([id]) => id !== e.pointerId,
            )![1];
            const before = Math.hypot(
              previous.x - other.x,
              previous.y - other.y,
            );
            const after = Math.hypot(next.x - other.x, next.y - other.y);
            if (before > 0)
              zoomTo(
                (zoomRef.current * after) / before,
                (next.x + other.x) / 2,
                (next.y + other.y) / 2,
              );
          } else {
            e.currentTarget.scrollLeft -= next.x - previous.x;
            e.currentTarget.scrollTop -= next.y - previous.y;
          }
          pointers.current.set(e.pointerId, next);
        }}
        onPointerUp={(e) => {
          pointers.current.delete(e.pointerId);
          const dx = e.clientX - down.current.x,
            dy = e.clientY - down.current.y;
          if (!multi.current && zoomRef.current===1 && dy>85 && dy>Math.abs(dx)*1.3) {
            onClose();return;
          }
          if (
            !multi.current &&
            zoomRef.current === 1 &&
            Math.abs(dx) > 50 &&
            Math.abs(dx) > Math.abs(dy) * 1.3
          ) {
            const next = index + (dx < 0 ? 1 : -1);
            if (next >= 0 && next < photos.length) change(next);
            return;
          }
          if (
            e.pointerType !== "mouse" &&
            !down.current.moved &&
            Date.now() - down.current.time < 300
          ) {
            if (
              Date.now() - tap.current.time < 320 &&
              Math.hypot(e.clientX - tap.current.x, e.clientY - tap.current.y) <
                30
            ) {
              zoomTo(zoomRef.current > 1 ? 1 : 2.5, e.clientX, e.clientY);
              tap.current.time = 0;
            } else
              tap.current = { time: Date.now(), x: e.clientX, y: e.clientY };
          }
        }}
        onPointerCancel={(e) => {
          pointers.current.delete(e.pointerId);
          tap.current.time = 0;
        }}
      >
        <div
          className="photo-surface"
          style={{
            width: Math.max(size.width, base.width * zoom),
            height: Math.max(size.height, base.height * zoom),
          }}
        >
          <img
            key={photos[index].url}
            src={photos[index].url}
            alt={photoCredit(photos[index].caption||'') ? `Photo ${index+1}` : photos[index].caption || `Photo ${index + 1}`}
            draggable={false}
            style={{ width: base.width * zoom, height: base.height * zoom }}
            onLoad={(e) =>
              setNatural({
                width: e.currentTarget.naturalWidth,
                height: e.currentTarget.naturalHeight,
              })
            }
          />
        </div>
      </div>
      {photos.length > 1 && (
        <div className="photo-controls">
          <button
            className="icon-button"
            aria-label="Photo précédente"
            disabled={index === 0}
            onClick={() => change(index - 1)}
          >
            <ChevronLeft />
          </button>
          <span>
            {index + 1} / {photos.length}
          </span>
          <button
            className="icon-button"
            aria-label="Photo suivante"
            disabled={index === photos.length - 1}
            onClick={() => change(index + 1)}
          >
            <ChevronRight />
          </button>
        </div>
      )}
    </Modal>
  );
}
