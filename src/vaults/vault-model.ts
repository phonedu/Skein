/** A library's name for the switcher: the last piece of a plain path or of
 *  a phone's SAF URL ("…/tree/primary%3ANotes" is "Notes"). */
export function vaultName(path: string): string {
  const clean = path.replace(/[\\/]+$/, "");
  const last = clean.split(/[\\/]/).filter(Boolean).pop() ?? clean;
  let name = last;
  try {
    name = decodeURIComponent(last);
  } catch {
    // A % that is not an escape: the segment as it is.
  }
  const colon = name.lastIndexOf(":");
  // A document id's volume ("primary:Notes"), not a drive ("C:").
  return colon > 0 && colon < name.length - 1 ? name.slice(colon + 1) : name;
}

export interface VaultEntry {
  /** As it is opened: the path or URL stored for it. */
  path: string;
  name: string;
  /** The one open now: marked, and not switched to or removed. */
  current: boolean;
}

const key = (path: string) => path.replace(/[\\/]+$/, "");

/** The open library first, then those chosen before, most recent first,
 *  each once (the same folder with and without a trailing separator is
 *  one). The current one is not repeated from the recent list. */
export function vaultRows(
  current: string | null,
  recent: readonly string[],
): VaultEntry[] {
  const rows: VaultEntry[] = [];
  const seen = new Set<string>();
  if (current) {
    rows.push({ path: current, name: vaultName(current), current: true });
    seen.add(key(current));
  }
  for (const path of recent) {
    const at = key(path);
    if (!at || seen.has(at)) continue;
    seen.add(at);
    rows.push({ path, name: vaultName(path), current: false });
  }
  return rows;
}
