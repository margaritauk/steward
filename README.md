# StewardBuddy

Mobile-friendly banquet setup app for supervisors and stewards, hosted on Cloudflare Workers with persistent SQLite Durable Object storage.

## Deploy on Cloudflare Free

1. In Cloudflare, open **Workers & Pages → Create application → Import a repository**. Connect GitHub and select **margaritauk/steward**. Create a **Worker**, named **banquet-steward**.
2. Set build command to `npm run build`, deploy command to `npx wrangler deploy`, and root directory to `/`. Use Node 24 (build environment variable `NODE_VERSION=24` if necessary). Deploy. The repository configuration creates the SQLite Durable Object automatically.
3. In the Worker’s **Settings → Variables and Secrets**, add **BOOTSTRAP_TOKEN** as a **Secret**, using a long random setup code you keep private. Save/deploy the change.
4. Open the Worker’s `workers.dev` address. Create your first supervisor account using that setup code. The supervisor can then create individual steward accounts and review equipment rules.

Use the Free plan. No R2 bucket or paid database is required. Cloudflare free quotas apply; this pilot also limits stored PDFs and photos to approximately 400 MB. Keep backups of original BEOs. Do not delete the Worker or change its Durable Object migration to retain stored data.

## Workflow

Only supervisors import BEO PDFs, including multiple pages and scanned pages. PDF text extraction and English OCR run in the browser. Review the extracted BEO number, event details, dates, guest count and hot buffet dishes before saving; extraction can make mistakes.

Supervisors assign multiple stewards, accept or override room/workload suggestions, edit equipment rules manually or import a file, and manage revisions and quantity changes. Stewards see assignments ordered by event time and a countdown to the setup deadline one hour before the event. Shared checklists update live. Setup completion requires a photo and records the person and time in the supervisor audit log. Changes alert assigned stewards in the app and reopen affected completed setups.

Starter equipment rules are examples: review them before use. Chafers are calculated from hot buffet dishes, rather than automatically assuming five for every 100 guests. Venue timezone defaults to America/Chicago and can be changed in settings.

## Development and validation

Requires Node 24+. Run `npm ci`, copy `.dev.vars.example` to `.dev.vars`, then `npm run dev`. Never commit `.dev.vars`. Run `npm run check` and `npm test` for syntax and API workflow checks. On a proxy-controlled workstation, building may require `NODE_USE_ENV_PROXY=1 npm run build`.

The Cloudflare local browser workflow has been tested at desktop and iPhone screen sizes: two-page PDF import, scanned two-page OCR, assignment, shared progress, photo completion, revision alerts and audit history. Test on physical iPhones and representative venue PDFs before operational rollout. Deployment to a live Cloudflare account is a separate step.
