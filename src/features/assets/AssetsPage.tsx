import type { Strings } from "../../i18n/strings";
import "./assets-page.css";

/**
 * Assets (the notes board's ui-d-assets), its first pass: the empty state
 * - assets appear once real deliveries settle into judgments. The list,
 * its trigger axis and the boundary trio arrive with the workspace pass.
 */
export function AssetsPage({ t }: { t: Strings }) {
  return (
    <div className="assets-page">
      <p className="assets-empty">{t.assetsEmpty}</p>
    </div>
  );
}
