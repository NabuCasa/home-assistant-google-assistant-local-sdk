# Google Local SDK for Home Assistant

Implements a small Local SDK receiver that can interact with Home Assistant instances.

## Home Assistant instance requirements

- Zeroconf integration so it can be discovered
- Google Assistant with local SDK activated

## Set up Google dev env

Go to the [Google Actions console](https://console.actions.google.com/):

- Develop (top bar) -> Actions (sidebar) -> Configure local home SDK::
  - Enter your testing URL for Chrome: `http://<YOUR LOCAL IP>:8080/test_receiver.html`
  - Enter your testing URL for Node: `http://<YOUR LOCAL IP>:8080/test_receiver.html`
  - Enable "Support local query"
  - Add device scan configuration: "MDNS"
  - MDNS service name: `_home-assistant._tcp.local`
  - Name: `.*\._home-assistant\._tcp\.local`

## Local SDK dev env

1. Install dependencies `npm install` (only do it whenever you pull latest code)
2. Build code `npm run build` to build the code once or run `npm run watch` if you're developing and want to generate a new build whenever you make a change.
3. Run `npm run server` to allow Google Assistant to load the app

## Chrome debugging

1. In Chrome, navigate to [chrome://inspect](chrome://inspect)
2. Click "inspect" on the test receiver to open the debugger.

## Home Assistant dev env

1. Make sure you have both `zeroconf` and `cloud` integrations set up.
2. Log in to Home Assistant Cloud
3. Sync your entities with Google Assistant
4. Restart Home Assistant to trigger identify requests to the local SDK

## Resources

- [Add local execution tutorial](https://developers.google.com/assistant/smarthome/develop/local)
- [Local SDK types](https://github.com/actions-on-google/local-home-sdk)
- [Sample app](https://github.com/actions-on-google/smart-home-local/tree/master/app)
