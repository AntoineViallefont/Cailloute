import { useEffect, useRef, useState, type PointerEvent } from "react";
import { consumeSheetMotion, settleSheet } from "./place-sheet";
type Gesture = {
  x: number;
  y: number;
  lastY: number;
  id: number;
  height: number;
  full: number;
  expanded: boolean;
  content: boolean;
  active: boolean;
  time: number;
  velocity: number;
};
export function usePlaceSheet(onClose: () => void) {
  const [expanded, setExpanded] = useState(false);
  const [height, setHeight] = useState<number | null>(null);
  const [closing, setClosing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const inertia = useRef(0);
  const close = useRef(onClose);
  close.current = onClose;
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const stopInertia = () => cancelAnimationFrame(inertia.current);
  const dismiss = (currentHeight?: number) => {
    if (closeTimer.current) return;
    stopInertia();
    clearTimeout(wheelTimer.current);
    // Conserver la hauteur atteinte : la remettre à mi-écran provoquait un rebond.
    setHeight(
      currentHeight ?? rootRef.current?.getBoundingClientRect().height ?? null,
    );
    setClosing(true);
    closeTimer.current = setTimeout(
      () => close.current(),
      matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 200,
    );
  };
  const start = (
    x: number,
    y: number,
    id: number,
    target: Element,
  ): Gesture => {
    stopInertia();
    return {
      x,
      y,
      lastY: y,
      id,
      height:
        rootRef.current?.getBoundingClientRect().height ??
        window.innerHeight * (expandedRef.current ? 1 : 0.5),
      full: window.innerHeight,
      expanded: expandedRef.current,
      content: !!target.closest(".detail-scroll"),
      active: false,
      time: performance.now(),
      velocity: 0,
    };
  };
  const move = (g: Gesture, up: number) => {
    const node = scrollRef.current;
    if (!node) return;
    const previousHeight=g.height;
    const next = consumeSheetMotion(
      g.height,
      node.scrollTop,
      up,
      g.full,
      Math.max(0, node.scrollHeight - node.clientHeight),
      g.content,
    );
    g.height = next.height;
    node.scrollTop = next.scroll;
    // Déplacer uniquement la fiche : ses photos et avis ne sont pas recalculés au geste.
    const root=rootRef.current;
    if(root && Math.abs(next.height-previousHeight)>.5){
      root.classList.add("dragging");
      root.style.height=`${next.height}px`;
    }
  };
  const finish = (g: Gesture) => {
    const position = settleSheet(g.expanded, g.height, g.full);
    if (position === "closed") {
      dismiss(g.height);
      return;
    }
    rootRef.current?.classList.remove("dragging");
    if(rootRef.current)rootRef.current.style.height=position === "full" ? "100dvh" : "50dvh";
    setExpanded(position === "full");
    setHeight(null);
    // L'inertie ne déplace que le contenu : elle ne ferme jamais la fiche.
    if (position === "full" && g.content && Math.abs(g.velocity) > 0.15) {
      let velocity = Math.max(-2.5, Math.min(2.5, g.velocity));
      let last = performance.now();
      const step = (now: number) => {
        const node = scrollRef.current;
        if (!node) return;
        const dt = Math.min(32, now - last);
        last = now;
        const before = node.scrollTop;
        node.scrollTop += velocity * dt;
        velocity *= Math.exp(-dt / 180);
        if (
          Math.abs(velocity) > 0.03 &&
          Math.abs(node.scrollTop - before) > 0.1
        )
          inertia.current = requestAnimationFrame(step);
      };
      inertia.current = requestAnimationFrame(step);
    }
  };
  const ignored = (target: Element) =>
    !!target.closest(
      'dialog,[role="dialog"],input,textarea,select,.photo-viewer',
    );
  useEffect(
    () => () => {
      stopInertia();
      clearTimeout(wheelTimer.current);
      clearTimeout(closeTimer.current);
    },
    [],
  );
  const rootRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const wheel = (event: WheelEvent) => {
      const target = event.target as Element;
      if (
        closeTimer.current ||
        ignored(target) ||
        event.ctrlKey ||
        Math.abs(event.deltaX) > Math.abs(event.deltaY)
      )
        return;
      event.preventDefault();
      stopInertia();
      let g = gesture.current;
      if (!g || g.id !== -1) {
        g = start(0, 0, -1, target);
        gesture.current = g;
      }
      g.active = true;
      g.velocity = 0;
      move(
        g,
        event.deltaY *
          (event.deltaMode === 1
            ? 16
            : event.deltaMode === 2
              ? window.innerHeight
              : 1),
      );
      clearTimeout(wheelTimer.current);
      wheelTimer.current = setTimeout(() => {
        if (gesture.current === g) {
          gesture.current = null;
          finish(g);
        }
      }, 140);
    };
    root.addEventListener("wheel", wheel, { passive: false });
    return () => root.removeEventListener("wheel", wheel);
  }, []);
  return {
    expanded,
    height,
    closing,
    scrollRef,
    rootRef,
    rootEvents: {
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        if (
          !event.isPrimary ||
          event.button !== 0 ||
          ignored(event.target as Element) ||
          closing
        )
          return;
        clearTimeout(wheelTimer.current);
        suppressClick.current = false;
        gesture.current = start(
          event.clientX,
          event.clientY,
          event.pointerId,
          event.target as Element,
        );
      },
      onPointerMove: (event: PointerEvent<HTMLElement>) => {
        const g = gesture.current;
        if (!g || g.id !== event.pointerId) return;
        const dx = event.clientX - g.x,
          dy = event.clientY - g.y;
        if (!g.active) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
          if (Math.abs(dx) > Math.abs(dy)) {
            gesture.current = null;
            return;
          }
          g.active = true;
          suppressClick.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
        }
        event.preventDefault();
        const up = g.lastY - event.clientY,
          now = performance.now();
        g.velocity = 0.6 * g.velocity + (0.4 * up) / Math.max(1, now - g.time);
        g.time = now;
        g.lastY = event.clientY;
        move(g, up);
      },
      onPointerUp: (event: PointerEvent<HTMLElement>) => {
        const g = gesture.current;
        if (!g || g.id !== event.pointerId) return;
        gesture.current = null;
        if (g.active) {
          event.preventDefault();
          if (performance.now() - g.time > 100) g.velocity = 0;
          finish(g);
        }
      },
      onPointerCancel: () => {
        if (closeTimer.current) return;
        gesture.current = null;
        suppressClick.current=false;
        rootRef.current?.classList.remove("dragging");
        if(rootRef.current)rootRef.current.style.height=expandedRef.current ? "100dvh" : "50dvh";
        setHeight(null);
      },
      onClickCapture: (event: React.MouseEvent<HTMLElement>) => {
        if (suppressClick.current) {
          event.preventDefault();
          event.stopPropagation();
          suppressClick.current = false;
        }
      },
      onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
        if (event.key === "Escape" && !ignored(event.target as Element)) {
          event.preventDefault();
          dismiss();
        }
      },
    },
    handleClick: () => {
      stopInertia();
      rootRef.current?.classList.remove("dragging");
      if(rootRef.current)rootRef.current.style.height=!expandedRef.current ? "100dvh" : "50dvh";
      setExpanded((value) => !value);
      setHeight(null);
    },
  };
}
