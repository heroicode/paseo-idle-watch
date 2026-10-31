import { useRpc, useSettings } from "@getpaseo/plugin/client";
import {
  Loading,
  SettingsAction,
  SettingsCard,
  SettingsInput,
  SettingsRow,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import { useState } from "react";
import { idleSettings, testNotificationRpc, type IdleUnit } from "../shared/contracts";
import { formatDuration } from "../shared/format";
import { useIdleStatus } from "./idle-status";

const UNITS = [
  { label: "Minutes", value: "minutes" },
  { label: "Hours", value: "hours" },
] as const;

function ago(iso: string | null): string {
  return iso ? `${formatDuration(Date.now() - new Date(iso).getTime())} ago` : "Not seen yet";
}

function Status() {
  const status = useIdleStatus();
  if (!status) return <SettingsRow label="Status" hint="Waiting for the daemon" />;
  return (
    <>
      {status.providers.map((provider) => (
        <SettingsRow
          key={provider.id}
          label={provider.name}
          hint={`${ago(provider.lastUsedAt)}${provider.quotaReadable ? "" : " · agents only, quota not readable"}`}
        />
      ))}
      <SettingsRow label="Quota last checked" hint={ago(status.quotaCheckedAt)} />
    </>
  );
}

export function SettingsScreen() {
  const settings = useSettings(idleSettings);
  const sendTest = useRpc(testNotificationRpc);
  const [amount, setAmount] = useState<string | null>(null);
  const [unit, setUnit] = useState<IdleUnit | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  if (settings.status === "loading") return <Loading />;
  if (settings.status === "error") return <SettingsRow label="Settings" error={settings.error} />;
  if (settings.status === "invalid") {
    return (
      <SettingsAction
        label="Saved settings are invalid"
        hint={settings.error}
        actionLabel="Reset"
        onPress={() => void settings.reset()}
      />
    );
  }

  const { values, revision } = settings;
  const parsedAmount = amount === null ? values.idleAmount : Number(amount);
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount > 0;
  const selectedUnit = unit ?? values.idleUnit;
  const dirty = parsedAmount !== values.idleAmount || selectedUnit !== values.idleUnit;

  return (
    <SettingsSection title="Idle watch">
      <SettingsCard>
        <SettingsSwitch
          label="Notify when idle"
          hint="Tokens are watched on every provider. You get one notification per idle stretch."
          value={values.enabled}
          disabled={settings.saving}
          onValueChange={(enabled) => void settings.save({ ...values, enabled }, revision)}
        />
        <SettingsInput
          label="Idle for"
          initialValue={String(values.idleAmount)}
          error={amountValid ? settings.saveError : "Enter a number above 0"}
          onChangeText={setAmount}
        />
        <SettingsSelect<IdleUnit> label="Unit" value={selectedUnit} options={UNITS} onValueChange={setUnit} />
        <SettingsAction
          label="Apply idle window"
          actionLabel="Save"
          disabled={!dirty || !amountValid || settings.saving}
          onPress={() =>
            void settings.save({ ...values, idleAmount: parsedAmount, idleUnit: selectedUnit }, revision)
          }
        />
        <SettingsAction
          label="Test notification"
          hint={testResult ?? "Posts to the desktop of the machine running the daemon."}
          actionLabel="Send"
          onPress={() =>
            void sendTest({}).then(
              ({ error }) => setTestResult(error ?? "Sent"),
              (error: unknown) => setTestResult(String(error)),
            )
          }
        />
      </SettingsCard>
      <SettingsCard>
        <Status />
      </SettingsCard>
    </SettingsSection>
  );
}
