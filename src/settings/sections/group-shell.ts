import type { ComponentType, ReactNode } from "react";

/** The group shell a section draws in: the iPad sheet's SettingsGroup or
 *  the desktop dialog's PageGroup. A shared section takes it as a prop, so
 *  its rows live once and only the shell differs. */
export type GroupShell = ComponentType<{
  title?: string;
  actions?: ReactNode;
  /** Rows alike (a shortcut list): the sheet's group aligns them. */
  evenRows?: boolean;
  children: ReactNode;
}>;
