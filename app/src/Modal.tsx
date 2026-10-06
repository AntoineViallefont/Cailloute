import { useEffect, useRef, type ReactNode } from "react";
import { useDismissGesture } from "./useDismissGesture";
import { X } from "lucide-react";
const openModals: (() => void)[] = [];
export function dismissTopModal() {
  const dismiss = openModals.at(-1);
  if (!dismiss) return false;
  dismiss();
  return true;
}
export function Modal({
  title,
  onClose,
  children,
  wide = false,
  className = "",
  actions,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  className?: string;
  actions?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useDismissGesture(ref, onClose);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    const dismiss = () => close.current();
    openModals.push(dismiss);
    const cancel = (e: Event) => {
      e.preventDefault();
      close.current();
    };
    dialog.addEventListener("cancel", cancel);
    return () => {
      const index = openModals.indexOf(dismiss);
      if (index >= 0) openModals.splice(index, 1);
      dialog.removeEventListener("cancel", cancel);
      dialog.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={["dialog", wide ? "wide" : "", className]
        .filter(Boolean)
        .join(" ")}
      aria-label={title}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="dialog-inner">
        <div className="dialog-head">
          <h2>{title}</h2>
          {actions}
          <button
            type="button"
            className="icon-button"
            aria-label="Fermer"
            onClick={onClose}
          >
            <X />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
