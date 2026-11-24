import { Segmented } from "../engine/controls/Segmented";
import { PlusIcon } from "../engine/controls/icons";
import type { Strings } from "../i18n/strings";
import "./PhoneViewSeg.css";

/**
 * Today | Files, the desktop's capsule, on the phone's own row under the
 * bar, with the day's capture at its end as the desktop's quick add is:
 * the app's two top-level surfaces switch in one tap, and 记一句 is always
 * the same thumb away on either of them.
 */
export function PhoneViewSeg({
  t,
  value,
  onChange,
  onCapture,
}: {
  t: Strings;
  value: "today" | "files";
  onChange: (view: "today" | "files") => void;
  onCapture: () => void;
}) {
  return (
    <div className="ph-views">
      <Segmented
        className="sidebar-view-seg ph-view-seg"
        label={`${t.treeDayToday} / ${t.treeTab}`}
        equal
        value={value}
        onChange={onChange}
        options={[
          { id: "today", label: t.treeDayToday },
          { id: "files", label: t.treeTab },
        ]}
      />
      <button
        type="button"
        className="ph-view-add"
        aria-label={t.todayCapture}
        title={t.todayCapture}
        onClick={onCapture}
      >
        <PlusIcon />
      </button>
    </div>
  );
}
