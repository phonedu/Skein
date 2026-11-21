import { useState } from "react";
import type { SettingsPageProps } from "../pages/types";
import type { ProviderCatalogEntry } from "../../ai/provider-catalog";
import { useProviderCatalog } from "../../ai/provider-catalog";
import { ProviderLogo } from "../../ai/provider-logos/ProviderLogo";
import type { Strings } from "../../i18n/strings";
import {
  localizedLabel,
  type ConnectedState,
} from "../../ai/provider-connection";
import { useSettingsConnected } from "./provider-connection";
import { ProviderAuthPanel } from "./provider-auth";
import { CustomProviderPanel } from "./custom-provider";
import { ModelListRow, useModelListShown } from "./agent";
import { ModelChoices } from "../pages/ModelChoices";
import type { GroupShell } from "./group-shell";

/**
 * Providers' list and detail, shared by the iPad sheet and the new dialog:
 * every provider in a list - its logo, a dot once it is set up - and beside
 * it the one picked: how to sign in or its key, its address, and its
 * models. Only the group shell around the sections differs.
 */
export function ProvidersSections({
  t,
  settings,
  Group,
}: Pick<SettingsPageProps, "t" | "settings"> & { Group: GroupShell }) {
  const catalog = useProviderCatalog();
  const [picked, setPicked] = useState<string>(settings.aiProvider);
  const { connected, refreshConnected } = useSettingsConnected(
    catalog,
    settings.aiProvider,
  );
  const entry = catalog.find((e) => e.id === picked) ?? catalog[0];
  return (
    <>
      <ModelChoices t={t} />
      {/* One panel: the list on the left, the picked one's sign-in and
          models on the right, nothing boxed inside it. */}
      <Group title={t.providersGroup}>
        <div className="providers-page">
          <div className="providers-list">
            {catalog.map((e) => (
              <button
                key={e.id}
                type="button"
                className="tx-list-item providers-item"
                aria-current={e.id === entry?.id || undefined}
                onClick={() => setPicked(e.id)}
              >
                <ProviderLogo id={e.id} label={localizedLabel(e, t)} />
                <span className="tx-truncate providers-item-name">
                  {localizedLabel(e, t)}
                </span>
                {/* Set up by the user: a key or an account. A provider that
                    needs neither (a local Ollama) shows nothing it can't
                    know. */}
                {!e.keyOptional && isSetUp(connected[e.id]) && (
                  <span
                    className="status-dot"
                    aria-label={t.apiKeyConfigured}
                  />
                )}
              </button>
            ))}
          </div>
          {entry && (
            <ProviderDetail
              key={entry.id}
              t={t}
              entry={entry}
              connected={connected[entry.id]}
              onStatusChange={() => refreshConnected(entry)}
              Group={Group}
            />
          )}
        </div>
      </Group>
    </>
  );
}

const isSetUp = (state?: ConnectedState) => !!(state?.oauth || state?.apiKey);

/** One provider: its name and state, how it is reached, its models. */
function ProviderDetail({
  t,
  entry,
  connected,
  onStatusChange,
  Group,
}: {
  t: Strings;
  entry: ProviderCatalogEntry;
  connected?: ConnectedState;
  onStatusChange: () => void;
  Group: GroupShell;
}) {
  // Its state is said on its sign-in row; one with nothing to sign in to
  // says it here instead.
  const status =
    entry.keyOptional && entry.id !== "custom"
      ? t.providerNoKeyRequired
      : undefined;
  const listShown = useModelListShown(entry.id);
  return (
    <div className="providers-detail">
      <Group title={status}>
        {entry.id === "custom" ? (
          <CustomProviderPanel t={t} onStatusChange={onStatusChange} />
        ) : (
          <ProviderAuthPanel
            t={t}
            entry={entry}
            connected={connected}
            onStatusChange={onStatusChange}
          />
        )}
      </Group>
      {listShown && (
        <Group title={t.providerModelsGroup}>
          <ModelListRow t={t} provider={entry.id} />
        </Group>
      )}
      <p className="providers-note">{t.providerKeysLocal}</p>
    </div>
  );
}
