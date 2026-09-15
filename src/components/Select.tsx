import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { IconChevronDown } from "@/components/icons";
import { Tip } from "@/components/ui/tooltip";
import { trapTabKey } from "@/lib/a11yFocus";
import { useFloatingMenu, type FloatingPlacement } from "@/lib/floatingMenu";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  /** compact chip-style in composer */
  variant?: "default" | "chip";
  /** Menu open direction. chip defaults to auto (prefer up near composer). */
  placement?: FloatingPlacement;
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
  title?: string;
}

/** Custom dropdown — menu portaled to body (never clipped by overflow parents). */
export function Select({
  value,
  options,
  onChange,
  variant = "default",
  placement,
  className = "",
  disabled,
  "aria-label": ariaLabel,
  title,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const initialEdge = useRef<"first" | "last">("first");
  const [focusedValue, setFocusedValue] = useState<string | null>(null);
  const selected = options.find((o) => o.value === value);
  const menuPlacement: FloatingPlacement =
    placement ?? (variant === "chip" ? "auto" : "down");

  const { pos, style, settled } = useFloatingMenu({
    open,
    triggerRef,
    panelRef,
    roots: [rootRef],
    onClose: () => setOpen(false),
    placement: menuPlacement,
    fitContent: true,
    // At least as wide as the trigger; grow when option labels are longer.
    matchTriggerWidth: true,
    estHeight: Math.min(280, 40 + options.length * 36),
  });

  const closeAndFocus = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open || !settled || !panelRef.current) return;
    const panel = panelRef.current;
    if (panel.contains(document.activeElement)) return;
    const enabled = Array.from(panel.querySelectorAll<HTMLButtonElement>("button:not([disabled])"));
    const selectedButton = enabled.find((button) => button.getAttribute("aria-selected") === "true");
    const first = initialEdge.current === "last" ? enabled[enabled.length - 1] : enabled[0];
    (selectedButton ?? first ?? panel).focus();
  }, [open, settled, options, value]);

  const onMenuKey = (e: KeyboardEvent<HTMLUListElement>) => {
    const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button:not([disabled])"));
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      const next = e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1
        : e.key === "ArrowDown" ? (index + 1) % buttons.length
        : (index < 0 ? buttons.length - 1 : (index - 1 + buttons.length) % buttons.length);
      buttons[next]?.focus();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) buttons[index]?.click();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeAndFocus();
    } else if (e.key === "Tab") {
      // Let native Tab continue from the trigger, preserving the modal boundary.
      closeAndFocus();
      const dialog = triggerRef.current?.closest('[role="dialog"]');
      if (dialog) trapTabKey(e, dialog);
      e.stopPropagation();
    }
  };

  const menu =
    open && pos && typeof document !== "undefined"
      ? createPortal(
          <ul
            ref={panelRef}
            className="menu-panel c-select__menu c-select__menu--portal"
            role="listbox"
            aria-label={ariaLabel}
            tabIndex={-1}
            onKeyDown={onMenuKey}
            id={listId}
            style={style}
            /* Keep modal from treating option clicks as outside / drag */
            onMouseDown={(e) => e.stopPropagation()}
          >
            {options.map((o) => (
              <li key={o.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={o.value === value}
                  tabIndex={focusedValue === o.value ? 0 : -1}
                  onFocus={() => setFocusedValue(o.value)}
                  className={
                    "c-select__option" +
                    (o.value === value ? " is-selected" : "") +
                    (o.disabled ? " is-disabled" : "")
                  }
                  disabled={o.disabled}
                  onClick={() => {
                    if (o.disabled) return;
                    onChange(o.value);
                    closeAndFocus();
                  }}
                >
                  {o.label}
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )
      : null;

  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      className="c-select__trigger"
      disabled={disabled}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={listId}
      aria-label={ariaLabel}
      onClick={() => {
        if (disabled) return;
        initialEdge.current = "first";
        setOpen((v) => !v);
      }}
      onKeyDown={(e) => {
        if (disabled || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
        e.preventDefault();
        initialEdge.current = e.key === "ArrowUp" ? "last" : "first";
        setOpen(true);
      }}
    >
      <span className="c-select__value">{selected?.label ?? value}</span>
      <span className="c-select__chev" aria-hidden>
        <IconChevronDown size={14} />
      </span>
    </button>
  );

  return (
    <div
      ref={rootRef}
      className={`c-select c-select--${variant} ${open ? "is-open" : ""} ${className}`}
    >
      {title ? <Tip label={title}>{trigger}</Tip> : trigger}
      {menu}
    </div>
  );
}
