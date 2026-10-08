# StewardBuddy team prototype

Static mobile web prototype with fictional events. No account, database, setup token or environment variables required. Changes and compressed photos stay in local browser storage; use My shift → Reset sample events to restart the demo. This does not sync between people or implement real supervisor alerts.

Includes chronological events, setup countdown one hour before event start, multiple assigned stewards, an equipment change notice, guest/dish equipment quantities, shared-checklist presentation, photo-gated completion, and a local completion record.

Deploy on Vercel by importing margaritauk/steward and setting Root Directory to prototype, Framework Preset to Other, no Build Command, and Output Directory to `.`. The Cloudflare app remains in the repository separately.

For a local preview: `python -m http.server 4340 --directory prototype` from the repository root.
