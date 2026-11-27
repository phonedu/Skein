// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import type { Strings } from "../../i18n/strings";
import { registerCommand } from "../../registry/commands";
import {
  configurePlugins,
  publish,
  type PluginRecord,
} from "../store/plugin-records";
import { pluginSurfaces } from "./plugin-launcher";

const undos: (() => void)[] = [];

afterEach(() => {
  for (const undo of undos.splice(0)) undo();
  publish({ records: [], allOn: true });
});

it("lists a plugin's page once when a command of the same name opens it", () => {
  configurePlugins({
    strings: () => ({}) as Strings,
    language: () => "en",
    dark: () => false,
  });
  const manifest = {
    id: "skein.collect",
    name: "%name%",
    version: "0.7.3",
    contributes: {
      views: [
        {
          id: "skein.collect.confirm",
          title: "%confirmCenter%",
          type: "webview",
        },
      ],
      commands: [
        { command: "skein.collect.confirm", title: "%confirmCenter%" },
        { command: "skein.collect.capture", title: "%capture%" },
      ],
    },
    l10n: {
      en: {
        name: "Skein Collect",
        confirmCenter: "Confirm center",
        capture: "Collect a Note",
      },
    },
  };
  publish({
    allOn: true,
    records: [
      {
        id: "skein.collect",
        status: "on",
        origin: "dev",
        granted: [],
        manifest,
      } as unknown as PluginRecord,
    ],
  });
  undos.push(
    registerCommand({
      id: "skein.collect.confirm",
      title: () => "Confirm center",
      run: () => {},
    }),
    registerCommand({
      id: "skein.collect.capture",
      title: () => "Collect a Note",
      run: () => {},
    }),
  );

  const surfaces = pluginSurfaces();
  const labels = surfaces.map((surface) => surface.label);
  // The page answers for the command: one row, not two.
  expect(labels.filter((label) => label === "Confirm center")).toHaveLength(1);
  expect(
    surfaces.find((surface) => surface.label === "Confirm center")?.view,
  ).toBe("skein.collect.confirm");
  // A command that opens nothing already listed stays.
  expect(labels).toContain("Collect a Note");
});
