import { useRpc, useSettings, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import {
  Loading,
  SettingsAction,
  SettingsCard,
  SettingsRow,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
  TextInput,
} from "@getpaseo/plugin/client/ui";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { idleSettings, testNotificationRpc, type IdleUnit } from "../shared/contracts";
import { formatDuration } from "../shared/format";
import { useIdleStatus } from "./idle-status";

const UNITS = [
  { label: "Minutes", value: "minutes" },
  { label: "Hours", value: "hours" },
] as const;

const REPEATS = [
  { label: "Off", value: "0" },
  { label: "Every minute", value: "1" },
  { label: "Every 5 minutes", value: "5" },
  { label: "Every 15 minutes", value: "15" },
  { label: "Every 30 minutes", value: "30" },
  { label: "Every hour", value: "60" },
];

type Theme = PluginSurfaceProps["theme"];

/** Paseo's select only comes as a whole row, so the unit is a small toggle that fits beside the input. */
function UnitToggle({
  value,
  theme,
  onChange,
}: {
  value: IdleUnit;
  theme: Theme;
  onChange(unit: IdleUnit): void;
}) {
  return (
    <View style={{ flexDirection: "row", borderRadius: 6, borderWidth: 1, borderColor: theme.colors.border, overflow: "hidden" }}>
      {UNITS.map((unit) => {
        const selected = unit.value === value;
        return (
          <Pressable
            key={unit.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(unit.value)}
            style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: selected ? theme.colors.accent : "transparent" }}
          >
            <Text style={{ fontSize: 13, color: selected ? theme.colors.accentForeground : theme.colors.foreground }}>
              {unit.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

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

export function SettingsScreen({ theme }: PluginSurfaceProps) {
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
          hint="Tokens are watched on every provider."
          value={values.enabled}
          disabled={settings.saving}
          onValueChange={(enabled) => void settings.save({ ...values, enabled }, revision)}
        />
        <SettingsRow label="Idle for" error={amountValid ? settings.saveError : "Enter a number above 0"}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TextInput
              accessibilityLabel="Idle amount"
              keyboardType="decimal-pad"
              defaultValue={String(values.idleAmount)}
              onChangeText={setAmount}
              style={{
                width: 64,
                paddingHorizontal: 8,
                paddingVertical: 6,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: theme.colors.border,
                color: theme.colors.foreground,
                textAlign: "right",
              }}
            />
            <UnitToggle value={selectedUnit} theme={theme} onChange={setUnit} />
          </View>
        </SettingsRow>
        <SettingsAction
          label="Apply idle window"
          actionLabel="Save"
          disabled={!dirty || !amountValid || settings.saving}
          onPress={() =>
            void settings.save({ ...values, idleAmount: parsedAmount, idleUnit: selectedUnit }, revision)
          }
        />
        <SettingsSelect
          label="Repeat while idle"
          hint="Keeps notifying until tokens are used again."
          value={String(values.repeatMinutes)}
          options={REPEATS}
          disabled={settings.saving}
          onValueChange={(repeat) => void settings.save({ ...values, repeatMinutes: Number(repeat) }, revision)}
        />
        <SettingsAction
          label="Test notification"
          hint={testResult ?? "Sends your current usage to this machine's desktop and the Paseo mobile app."}
          actionLabel="Send"
          onPress={() =>
            void sendTest({}).then(
              ({ message, summary }) => setTestResult(`${message} ${summary}.`),
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
