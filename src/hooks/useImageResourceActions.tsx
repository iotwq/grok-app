import { IconDownload } from "@tabler/icons-react";
import { IconCopy, IconFolder } from "@/components/icons";
import { createT, type Locale } from "@/i18n";
import { isTauri, pathReveal } from "@/lib/api";
import { absPathFromMediaHttpUrl, copyImageFromPath } from "@/lib/copyImage";
import { isRealLocalAbsolutePath } from "@/lib/pathNormalize";
import { isExternalHttpUrl } from "@/lib/externalLinkPref";
import { saveOutputImage } from "@/lib/saveOutputImage";
import { useResourceActionFeedback } from "@/components/ResourceActionNotice";
import type { ContextMenuItem } from "@/components/ContextMenu";
import { revealInOsLabel } from "@/lib/appPlatform";

/** Shared by the transcript thumbnail and full-size viewer. Source must be the original. */
export function useImageResourceActions({ source, locale = "en", disabled = false }: {
  source: string;
  locale?: Locale;
  disabled?: boolean;
}) {
  const tr = createT(locale);
  const feedback = useResourceActionFeedback();
  const original = absPathFromMediaHttpUrl(source) || source;
  const local = isRealLocalAbsolutePath(original);
  const address = local || isExternalHttpUrl(original) ? original : null;
  const items: ContextMenuItem[] = [
    {
      id: "copy-image", label: tr("image.copy"), icon: <IconCopy size={16} />, disabled: disabled || feedback.busy,
      onClick: () => void feedback.run(async () => {
        const result = await copyImageFromPath(original);
        if (!result.ok) throw new Error(result.reason);
      }, tr("resource.copyFailed"), tr("message.copied"), tr("resource.working")),
    },
    {
      id: "save-image", label: tr("image.saveAs"), icon: <IconDownload size={16} />, disabled: disabled || feedback.busy,
      onClick: () => void feedback.run(
        () => saveOutputImage(original, tr("image.saveAs")),
        tr("image.saveFailed"), undefined, tr("resource.working"),
      ),
    },
  ];
  if (address) items.push({
    id: "copy-address", icon: <IconCopy size={16} />, label: tr(local ? "attach.copyPath" : "resource.copyAddress"), disabled: feedback.busy,
    onClick: () => void feedback.run(() => navigator.clipboard.writeText(address), tr("resource.copyFailed"), tr("message.copied")),
  });
  if (local && isTauri()) items.push({
    id: "reveal", icon: <IconFolder size={16} />, label: revealInOsLabel(tr), disabled: feedback.busy,
    onClick: () => void feedback.run(() => pathReveal(original), tr("resource.openFailed")),
  });
  return { items, notice: feedback.notice };
}
