import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { Modal } from "./Modal";

/** Choix natifs à l'application, y compris dans la WebView Android. */
export function ChoiceSelect({
  label,
  value,
  options,
  onChange,
  placeholder = "Choisir",
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => trigger.current?.focus());
  };
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="choice-select"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span>
          {options.find((o) => o.value === value)?.label || placeholder}
        </span>
        <ChevronDown size={19} />
      </button>
      {open &&
        createPortal(
          <Modal title={label} onClose={close} className="choice-dialog">
            <div className="choice-list" role="group" aria-label={label}>
              {options.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  className="choice-option"
                  aria-pressed={option.value === value}
                  onClick={() => {
                    onChange(option.value);
                    close();
                  }}
                >
                  <span>{option.label}</span>
                  {option.value === value && <Check size={20} />}
                </button>
              ))}
            </div>
          </Modal>,
          document.body,
        )}
    </>
  );
}
