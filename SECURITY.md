# Security Policy

## Security model

Zigbee Tunes is an MQTT proxy that sits between Zigbee2MQTT and Home
Assistant. Understanding its trust boundaries matters before you deploy
it:

- **The web UI and REST API have no authentication of their own.** This
  is by design:
  - As a **Home Assistant add-on**, the UI is reached through HA
    **Ingress**, which is authenticated by Home Assistant. The internal
    port is not published to the host network by default.
  - In **standalone** mode, the API binds to `127.0.0.1` (loopback)
    unless you explicitly set `api.host: 0.0.0.0`.
- **Do not expose port `8099` to an untrusted network.** There is no
  built-in login, rate limiting, or CSRF protection. Anyone who can
  reach the port can read your device list and change transformation
  rules. CORS is set to `origin: false` so a third-party website cannot
  call the API from a browser, but that is not a substitute for network
  isolation.
- **The proxy only rewrites MQTT Discovery (config) payloads.** It does
  not subscribe to device state topics and never publishes device
  commands, so a compromise cannot directly actuate your devices through
  this service.
- **Data at rest** is limited to device metadata and your transformation
  rules, stored in a local SQLite database. No credentials are persisted
  by the application; the MQTT broker credentials live only in the
  config file / add-on options you provide.

If you need the API reachable beyond loopback, put it behind a
reverse proxy that adds authentication and TLS.

## Reporting a vulnerability

Please report security issues **privately**, not in a public issue:

- Use GitHub's **"Report a vulnerability"** button under the repository's
  *Security* tab (private advisory), or
- Contact the maintainer through the address listed on their GitHub
  profile.

Include a description, reproduction steps, and the affected version. You
can expect an acknowledgement within a few days. Please give a
reasonable window to ship a fix before any public disclosure.
