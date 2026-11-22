# PENSION LAB Preview

Preview uses example assets and a browser-local cache by default. The production
branch, production Vercel alias, and existing Supabase project are separate.
The tracked legacy HTML stays in Git and is excluded from Preview uploads.

## Data and access

The existing app stores the working asset rows, holdings, periods and archives
in browser localStorage, and mirrors those and the simulation settings into
the Supabase `family_assets.data_json` document on manual or enabled automatic
sync. Device UI state is local. Pension inputs are in memory until the server
document is saved. The legacy family-password check happens in the browser and
the legacy REST requests use the anonymous role.

For private visual validation, export a single authorized family row containing
`data_json` from the Supabase dashboard as JSON and select **Supabase 백업 열기**
in the protected Vercel Preview. A wrapped SQL result containing one row or the
raw `data_json` object is accepted. The copy stays in browser memory and is
discarded on reload. Server sync is disabled in this Preview mode.

1. Export a full backup of the legacy family row and any unsynced browser data.
   Use a separate Supabase project for Preview. Import the backed-up family row
   there and retain the original schema and data.
2. Apply `supabase/pension-lab-preview.sql` to that isolated project. Create
   users in Supabase Auth and add each approved Auth user ID to
   `public.pension_family_members` with the imported family key. Disable public
   signup if accounts are provisioned by an administrator.
3. Set `supabaseUrl`, `supabaseAnonKey` (publishable/anon only), and `familyKey`
   in `js/pension-lab-config.js` on a restricted Preview branch. Never add
   passwords or service-role keys to source.
4. Verify with two approved accounts, one unapproved account, and a signed-out
   request. Sign in on both devices and read the same family document. Save on
   one device, reload server data on the other. Verify stale saves are rejected.
   Login loads the latest server document. Authenticated working state stays
   in memory; sign out or reload to end this device's view of private data.

Existing rows and period archives migrate in place in the copied JSON document.
New metadata is optional for old documents. Verified month snapshots are
append-only, and each server update archives the previous document. If the
month's holdings or prices cannot be verified, confirmation fails without
replacing the stored month. A signed-in load attempts the prior month when
there is an existing record, and manual confirmation can retry. This workflow
does not run while the application is closed.

## Deployment

Push the renewal branch to the connected GitHub remote and use the resulting
Vercel Preview deployment. Validate its access policy and the authenticated
backend before merging. Keep the production alias on the current deployment
until the backup, access checks, and rollout are explicitly approved.
