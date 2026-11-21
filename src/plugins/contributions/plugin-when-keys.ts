import type { WhenContext } from "./when";

/**
 * Keys plugins set for their own menus' `when` (`commands.setContext`, as
 * VS Code's setContext): each named `<plugin id>.<name>`, so a plugin
 * reads and writes only its own, and gone when it stops.
 */
const keys = new Map<string, string | boolean>();

/** A plugin's own context keys. */
export const ownWhen = {
  /** Whether `key` is one of `plugin`'s own. */
  is(plugin: string, key: string): boolean {
    return key.startsWith(`${plugin}.`) && key.length > plugin.length + 1;
  },
};

export function setPluginWhenKey(
  plugin: string,
  key: string,
  value: unknown,
): void {
  if (!ownWhen.is(plugin, key))
    throw new Error(`A context key must start with "${plugin}.".`);
  if (value === undefined || value === null || value === false)
    keys.delete(key);
  else if (typeof value === "string" || value === true) keys.set(key, value);
  else throw new Error("A context value is a string or a boolean.");
}

export function pluginWhenKeys(): WhenContext {
  return Object.fromEntries(keys);
}

export function forgetPluginWhenKeys(plugin: string): void {
  for (const key of [...keys.keys()])
    if (ownWhen.is(plugin, key)) keys.delete(key);
}
