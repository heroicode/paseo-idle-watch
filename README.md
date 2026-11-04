# Idle watch

A [Paseo](https://paseo.sh) plugin that notifies you when a provider has gone unused for too long, so paid-for quota doesn't sit idle and unnoticed.

Each provider has its own idle clock. If Claude is busy but Codex has been idle for two hours, you hear about Codex.

## Install

```bash
paseo plugin add heroicode/idle-watch
```

This installs the reviewed release from the [Paseo plugin registry](https://paseo.sh/plugins/heroicode/idle-watch). To follow this repository's `main` branch instead, use `paseo plugin add git:heroicode/paseo-idle-watch`.

Plugins must be enabled on the daemon under **Settings → Plugins → Enable plugins**. Requires Paseo 0.13 or later.

## Settings

Find these under **Settings → Plugins → Idle watch**:

- **Notify when idle:** turns all alerts on or off.
- **Idle for:** how long a provider can go unused, in minutes or hours. The default is 2 hours.
- **Repeat while idle:** off by default, which sends one alert per idle stretch. It can instead keep alerting from every minute to every hour until the provider is used again.
- **Provider switches:** choose which providers to watch. Providers with a quota are on by default. Ones Paseo reports as having no quota are off unless you turn them on.
- **Test notification:** sends your current usage to every notification channel and shows the result.

A row in the sidebar footer shows which provider is idle, or how long ago tokens were last used.

## How it works

Two signals count as use of a provider:

- Activity on any Paseo agent running on that provider.
- A rise in any quota window or balance Paseo reports for that provider. This also catches use outside Paseo.

## Notifications and data

Alerts go to two places:

- **macOS desktop** of the machine running the daemon, through `osascript`. Other operating systems get no desktop notification.
- **Paseo mobile app**, through [Expo's push service](https://docs.expo.dev/push-notifications/overview/), the same service the daemon uses for its own push notifications.

Paseo has no notification API for plugins, so for mobile alerts the plugin reads the device tokens in the daemon's `push-tokens.json` and sends them to Expo with the alert text. It never writes to that file. Alert text contains provider names, idle times, and in test notifications usage percentages and balances. Account emails are removed from provider names.

## Limitations

- **Light use outside Paseo can be missed.** Quota moves in coarse steps and is read every five minutes, so a provider used only outside Paseo can get a false alert.
- **Only providers with a usage source report quota.** Others are tracked through Paseo agent activity alone.
- **Agents count toward the provider with the same ID.** A custom provider that extends `claude` shows as its own row, and its agents don't reset Claude's clock until Claude's quota rises.
- **Phones must stay registered.** The daemon drops a phone about 48 hours after its app last connected, and that phone gets no alerts until it connects again.
- **Restarts reset the clock.** After a daemon restart, no alerts can fire until the app connects or an agent runs, because an alert always names the idle provider. Idle clocks then start from that point.
- **Mobile alerts rely on an internal file.** A Paseo update could change `push-tokens.json`. The Test notification row would then report that no mobile device is registered.

## Development

```bash
npm install
npm run typecheck
npm test
paseo plugin install "$PWD"          # first time
paseo plugin reload paseo-idle-watch # after edits
paseo plugin logs paseo-idle-watch
```

## License

[MIT](LICENSE)
