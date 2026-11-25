// The Android window's theme accent is Material's purple until it is told
// otherwise, and the webview draws a text field's selection handle and
// selection in it - a foreign colour in the Slate interface. The theme
// lives in gen/android, which a regenerated project replaces, so every
// Android build sets it again. Idempotent: an already-set accent is left.
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";

/** Light and night use the interface accent each theme has (base.css). */
const THEMES = [
  ["src-tauri/gen/android/app/src/main/res/values/themes.xml", "#3467d2"],
  ["src-tauri/gen/android/app/src/main/res/values-night/themes.xml", "#6ea8fe"],
];

// A packaged APK rewritten in place keeps a hole as wide as a replaced
// native library: an incremental rebuild once left a 56 MB gap and the
// "67 MB" app shipped at 126 MB. Each build starts from no APK at all.
rmSync("src-tauri/gen/android/app/build/outputs/apk", {
  recursive: true,
  force: true,
});

let changed = 0;
for (const [path, accent] of THEMES) {
  if (!existsSync(path)) continue;
  const text = readFileSync(path, "utf8");
  if (text.includes('name="android:colorAccent"')) continue;
  const items = `<item name="android:colorAccent">${accent}</item><item name="colorAccent">${accent}</item>`;
  const next = text.replace("</style>", `${items}</style>`);
  if (next === text) continue;
  writeFileSync(path, next);
  changed++;
}
console.log(
  changed
    ? `android accent: set on ${changed} theme file(s)`
    : "android accent: already set",
);
