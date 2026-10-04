import { useState, type ReactNode } from "react";
import { createT, type Locale } from "@/i18n";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";
import { GlassModal } from "./GlassModal";
import { IconCopy, IconExternalLink, IconPanelRight } from "./icons";
import { useResourceActionFeedback } from "./ResourceActionNotice";
import {
  loadConfirmExternalLinksPref,
  openExternalHttpUrlChecked,
} from "@/lib/externalLinkPref";

/** One link interaction for prose, autolinks, inline URL code and side chat. */
export function OutputLink({
  href,
  children,
  locale = "en",
  className,
  onOpen,
  onOpenInPanel,
}: {
  href: string;
  children: ReactNode;
  locale?: Locale;
  className?: string;
  onOpen?: (url: string) => void | Promise<void>;
  onOpenInPanel?: (url: string) => void;
}) {
  const tr = createT(locale);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const { run, busy, notice } = useResourceActionFeedback();
  const doOpen = () =>
    void run(
      () => onOpen ? onOpen(href) : openExternalHttpUrlChecked(href),
      tr("resource.openFailed"),
    );
  const open = () => {
    // Chat's callback owns its confirmation and ChatCut routing.
    if (!onOpen && loadConfirmExternalLinksPref()) setConfirm(true);
    else doOpen();
  };
  const items: ContextMenuItem[] = [
    {
      id: "open", label: tr("resource.openLink"), icon: <IconExternalLink size={16} />,
      onClick: open, disabled: busy,
    },
    ...(onOpenInPanel ? [{
      id: "side", icon: <IconPanelRight size={16} />, label: tr("resource.openSide"),
      onClick: () => onOpenInPanel(href),
    }] : []),
    { id: "separator", separator: true },
    {
      id: "copy", label: tr("message.copyLink"), icon: <IconCopy size={16} />, disabled: busy,
      onClick: () => void run(
        () => navigator.clipboard.writeText(href),
        tr("resource.copyFailed"), tr("message.copied"),
      ),
    },
  ];
  return <>
    <a
      href={href}
      title={href}
      className={className}
      rel="noreferrer noopener"
      data-output-resource="link"
      onClick={(e) => {
        e.preventDefault(); e.stopPropagation(); open();
      }}
      onAuxClick={(e) => {
        if (e.button === 1) { e.preventDefault(); e.stopPropagation(); open(); }
      }}
      onContextMenu={(e) => {
        e.preventDefault(); e.stopPropagation();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
    >{children}</a>
    <ContextMenu
      open={!!menu} x={menu?.x ?? 0} y={menu?.y ?? 0}
      items={items} onClose={() => setMenu(null)}
    />
    <GlassModal
      open={confirm} onClose={() => setConfirm(false)} size="sm"
      title={tr("chat.externalLinkConfirmTitle")} closeLabel={tr("common.cancel")}
      footer={<>
        <button className="btn" onClick={() => setConfirm(false)}>{tr("common.cancel")}</button>
        <button className="btn btn--primary" onClick={() => { setConfirm(false); doOpen(); }}>{tr("chat.externalLinkOpen")}</button>
      </>}
    >{tr("chat.externalLinkConfirmMessage", { url: href })}</GlassModal>
    {notice}
  </>;
}
