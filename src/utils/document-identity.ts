import { FRONTMATTER } from "./frontmatter";

/** The `textus_id` a document's front matter carries, if it is a UUID. */
export function textusIdOf(text: string): string | null {
  const match = FRONTMATTER.exec(text);
  if (!match) return null;
  const key = /^textus_id\s*:\s*(.*)$/m.exec(match[1] ?? "");
  if (!key) return null;
  const value = key[1].trim().replace(/^["']|["']$/g, "");
  return UUID.test(value) ? value.toLowerCase() : null;
}

const UUID =
  /^[0-9a-f]{8}-?[0-9a-f]{4}-?[1-5][0-9a-f]{3}-?[89ab][0-9a-f]{3}-?[0-9a-f]{12}$/i;

/**
 * `text` with a `textus_id`: kept when it has one, `existingId` reused when
 * an earlier save wrote one, else a new UUIDv4. The body, comments and the
 * rest of the front matter are untouched; a malformed value is replaced.
 */
export function ensureTextusId(
  text: string,
  existingId: string | null = null,
): { text: string; id: string } {
  const match = FRONTMATTER.exec(text);
  const current = textusIdOf(text);
  const id =
    current ??
    (existingId && UUID.test(existingId)
      ? existingId.toLowerCase()
      : crypto.randomUUID());
  if (current) return { text, id: current };
  if (!match) {
    return {
      text: `---\ntextus_id: ${id}\n---\n\n${text}`,
      id,
    };
  }
  const yaml = match[1] ?? "";
  const line = /^textus_id\s*:.*$/m;
  const nextYaml = line.test(yaml)
    ? yaml.replace(line, `textus_id: ${id}`)
    : `${yaml}${yaml && !yaml.endsWith("\n") ? "\n" : ""}textus_id: ${id}`;
  const fields = match[0].match(
    /^(---[ \t]*\r?\n)([\s\S]*?)(\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$))$/,
  );
  if (!fields) {
    return {
      text: `---\ntextus_id: ${id}\n---\n\n${text}`,
      id,
    };
  }
  return {
    text: `${fields[1]}${nextYaml}${fields[3]}${text.slice(match[0].length)}`,
    id,
  };
}
