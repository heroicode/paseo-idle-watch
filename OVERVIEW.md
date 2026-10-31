Idle watch notifies you when no tokens have been used on any provider for a time you choose, such as 45 minutes or 2 hours. Set the time under Settings, Plugins, Idle watch. A row in the sidebar footer shows how long ago tokens were last used.

Two signals count as use: activity on any Paseo agent, and a rise in any quota window or balance Paseo reports for a provider. The second also catches use outside Paseo, but only for providers with a usage source, it updates every five minutes, and it moves in whole percents, so light use outside Paseo can go unseen.

You get one notification per idle stretch. The next one comes after tokens have been used again and the time has passed again.

Notifications are macOS desktop notifications on the machine running the daemon, so they do not reach the Paseo mobile app. After a daemon restart the clock starts over, and use outside Paseo is not checked until the app connects or an agent runs.
