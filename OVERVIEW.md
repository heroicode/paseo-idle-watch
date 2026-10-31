Idle watch notifies you when no tokens have been used on any provider for a time you choose, such as 45 minutes or 2 hours. Set the time under Settings, Plugins, Idle watch. A row in the sidebar footer shows how long ago tokens were last used.

Two signals count as use: activity on any Paseo agent, and a rise in any quota window or balance Paseo reports for a provider. The second also catches use outside Paseo, but only for providers with a usage source, it updates every five minutes, and it moves in whole percents, so light use outside Paseo can go unseen.

By default you get one notification per idle stretch, and the next one comes after tokens have been used again and the time has passed again. Repeat while idle keeps notifying on a schedule from every minute to every hour until tokens are used again.

Notifications go to the macOS desktop of the machine running the daemon and to the Paseo mobile app. Mobile delivery uses the device tokens the daemon stores and sends them to Expo, the same service the daemon uses for its own push notifications. A phone only stays registered while its app has connected to the daemon in the last 48 hours or so. After a daemon restart the clock starts over, and use outside Paseo is not checked until the app connects or an agent runs.
