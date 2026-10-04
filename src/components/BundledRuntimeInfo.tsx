import type { MessageKey } from "@/i18n";

type Props = {
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  cliInfo: { found: boolean; version: string | null; path: string | null };
};

export function BundledRuntimeInfo({ t, cliInfo }: Props) {
  return (
    <div className="settings-row settings-row--stack" data-testid="bundled-runtime-info">
      <div className="settings-row__text">
        <div className="settings-row__label">{t("runtime.bundled.title")}</div>
        <div className="settings-row__desc">{t("runtime.bundled.description")}</div>
      </div>
      {cliInfo.found ? (
        <div className="settings-row__hint">
          {cliInfo.version || "—"}{cliInfo.path ? ` · ${cliInfo.path}` : ""}
        </div>
      ) : (
        <div className="settings-row__hint settings-row__hint--warn" role="status">
          {t("runtime.bundled.missing")}
        </div>
      )}
    </div>
  );
}
