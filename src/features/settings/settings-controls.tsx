import { Checkbox } from "@base-ui/react/checkbox";
import { Select } from "@base-ui/react/select";
import { Switch } from "@base-ui/react/switch";
import { ChevronIcon } from "../../engine/controls/icons";
import { useSettingsRowLabel } from "./settings-row";
import "./settings-controls.css";

/**
 * The settings dialog's three value controls, Base UI for the
 * behaviour, the board's skin: a select drawn as the board's pill, an
 * opaque iOS-style switch, a tick checkbox. Controlled parts: pages read
 * and write the settings store through `onChange`.
 */

export interface SettingsOption {
  value: string;
  label: string;
}

export function SettingsSelect(props: {
  value: string;
  options: readonly SettingsOption[];
  onChange: (value: string) => void;
}) {
  const labelId = useSettingsRowLabel();
  return (
    <Select.Root
      items={props.options}
      value={props.value}
      onValueChange={(value) => {
        if (typeof value === "string") props.onChange(value);
      }}
    >
      <Select.Trigger className="settings-pill" aria-labelledby={labelId}>
        <Select.Value />
        <Select.Icon className="settings-pill-chev">
          <ChevronIcon />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner className="settings-popover-positioner">
          <Select.Popup className="settings-popover">
            <Select.List>
              {props.options.map((option) => (
                <Select.Item
                  key={option.value}
                  value={option.value}
                  className="settings-popover-item"
                >
                  <Select.ItemText>{option.label}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

export function SettingsSwitch(props: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const labelId = useSettingsRowLabel();
  return (
    <Switch.Root
      className={"settings-switch" + (props.checked ? " on" : "")}
      aria-labelledby={labelId}
      checked={props.checked}
      onCheckedChange={(checked) => props.onChange(checked)}
    >
      <Switch.Thumb className="settings-switch-thumb" />
    </Switch.Root>
  );
}

export function SettingsCheckbox(props: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const labelId = useSettingsRowLabel();
  return (
    <Checkbox.Root
      className={"settings-check" + (props.checked ? " on" : "")}
      aria-labelledby={labelId}
      checked={props.checked}
      onCheckedChange={(checked) => props.onChange(checked)}
    >
      <Checkbox.Indicator className="settings-check-ind">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M5 12.5 10 17.5 19 6.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          />
        </svg>
      </Checkbox.Indicator>
    </Checkbox.Root>
  );
}
