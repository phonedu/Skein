import { Segmented } from "../engine/controls/Segmented";
import type { Strings } from "../i18n/strings";
import "./PhoneViewSeg.css";

/**
 * Today | Files, the desktop's capsule, on the phone's own row under the
 * bar: the app's two top-level surfaces switch in one tap instead of going
 * through the ⋯ sheet.
 */
export function PhoneViewSeg({
  t,
  value,
  onChange,
}: {
  t: Strings;
  value: "today" | "files";
  onChange: (view: "today" | "files") => void;
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
    </div>
  );
}
