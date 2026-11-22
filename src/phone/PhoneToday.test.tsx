// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Today's phone surface, as the 2026-11-22 board settled it: a borderless
 * bar whose vault mark is a bare line icon, a glass capture card with a
 * round accent plus (not an accent frame), and the day's changes as one
 * glass card of two-line rows.
 */
const css = readFileSync("src/phone/PhoneToday.css", "utf8");

describe("Phone Today, the design board", () => {
  it("drops the bar's hairline and the vault icon's tinted tile", () => {
    // A bare 22px line icon replaces the accent-tinted tile.
    expect(css).toMatch(/\.ptop \{[^}]*border-bottom: 0;/s);
    expect(css).toMatch(
      /\.ptop-vault-icon \{[^}]*width: 22px;[^}]*height: 22px;[^}]*background: none;[^}]*color: var\(--ui-muted\);/s,
    );
  });

  it("draws the capture as a glass card with a 40px accent plus", () => {
    // The 1.5px accent frame is gone: the card is glass, the plus a circle.
    expect(css).toMatch(
      /\.pcapture \{[^}]*border: 0;[^}]*border-radius: var\(--shape-card\);[^}]*background: var\(--ui-surface\);[^}]*box-shadow: var\(--shadow-card\);/s,
    );
    expect(css).not.toMatch(/\.pcapture \{[^}]*1\.5px/s);
    expect(css).toMatch(
      /\.pcapture-icon \{[^}]*width: 40px;[^}]*height: 40px;[^}]*border-radius: var\(--shape-pill\);[^}]*background: var\(--ui-accent\);/s,
    );
  });

  it("puts the current delivery and today's changes in glass cards", () => {
    expect(css).toMatch(
      /\.pcard \{[^}]*border: 0;[^}]*border-radius: var\(--shape-card\);[^}]*background: var\(--ui-surface\);[^}]*box-shadow: var\(--shadow-card\);/s,
    );
    expect(css).toMatch(
      /\.pchanges \{[^}]*border: 0;[^}]*border-radius: var\(--shape-card\);[^}]*background: var\(--ui-surface\);[^}]*box-shadow: var\(--shadow-card\);/s,
    );
    // Written 80 draws 72 at the phone's 10/11. The hairline starts after
    // the file icon and stops 16 short; the last row has none.
    expect(css).toMatch(/\.prow-doc \{[^}]*min-height: 80px;/s);
    // 2026-11-22 fix: the old offset (24px icon + --space-3 gap, 52px) used
    // the wrong icon width and gap token and landed inside the text; the
    // row's own inset plus the 16px icon and an 8px gap (--space-2) is
    // where the text actually starts.
    expect(css).toMatch(
      /\.pchanges \.prow \{[^}]*transparent calc\(var\(--space-4\) \+ 16px \+ var\(--space-2\)\)[^}]*transparent calc\(100% - var\(--space-4\)\)/s,
    );
    expect(css).toMatch(
      /\.pchanges \.prow:last-child \{[^}]*background-image: none;/s,
    );
    // The card's shorthand padding wiped the two-line row's block padding,
    // so the title sat on the top edge and the hairline on the empty bottom.
    // The card keeps its side inset; the two-line row keeps its own block
    // padding and centres the pair.
    expect(css).toMatch(
      /\.pchanges \.prow \{[^}]*padding-inline: var\(--space-4\);/s,
    );
    expect(css).toMatch(
      /\.pchanges \.prow-doc \{[^}]*align-items: center;[^}]*padding-block: var\(--space-2\);/s,
    );
  });
});
