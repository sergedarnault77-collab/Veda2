# vedais.ai — DNS & deployment

Production web app: **https://vedais.ai**

## Vercel (already configured in project `veda2`)

Custom domains attached:

- `vedais.ai`
- `www.vedais.ai` (redirects to apex via `vercel.json`)
- `veda2.vercel.app` (redirects to apex via `vercel.json`)

Build env (all environments):

- `VITE_PUBLIC_SITE_URL` = `https://vedais.ai`
- `VITE_PUBLIC_SUPPORT_EMAIL` = `support@vedais.ai`

Redeploy after env changes so Vite inlines the new values.

## DNS (Cloudflare — GitHub domain)

GitHub Domains currently use Cloudflare nameservers. In the Cloudflare dashboard for **vedais.ai**, add:

| Type | Name | Value |
|------|------|--------|
| A | `@` | `76.76.21.21` |
| A | `www` | `76.76.21.21` |

Alternatively, point apex to Vercel nameservers (`ns1.vercel-dns.com`, `ns2.vercel-dns.com`) and manage DNS in Vercel.

Verification: Vercel → Project **veda2** → Settings → Domains. Status should show **Valid** once DNS propagates (often minutes, up to 48h).

## Supabase auth (if using OAuth / magic links)

In Supabase → Authentication → URL configuration, add:

- Site URL: `https://vedais.ai`
- Redirect URLs: `https://vedais.ai/**`, `https://www.vedais.ai/**` (if used)

## Email

Contact addresses used in the app:

- `support@vedais.ai`
- `legal@vedais.ai`
- `privacy@vedais.ai`

Configure forwarding or inboxes at your domain registrar / email provider (GitHub Domains → Email, or Cloudflare Email Routing).

## Native app bundle ID

Store bundle ID remains `com.veda.health` until you create a new listing under `com.vedais.ai` (optional, separate store submission).
