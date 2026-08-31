# Production Deployment Checklist

## Before Deploying

- [ ] Set Render environment variables for `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `NODE_ENV=production`
- [ ] Keep `.env` local only; never commit real secrets
- [ ] Confirm `.env` is in `.gitignore`
- [ ] Run `npm run build` and verify `dist/` is generated
- [ ] Set the admin password via `/login` on first run

## Supabase

- [ ] Run `supabase_schema.sql` once in the Supabase SQL editor
- [ ] Confirm all tables exist and RLS is disabled
- [ ] Drop `expenses_dealer_id_fkey` if the schema expects it
- [ ] Use a paid Supabase plan if you need automated backups and point-in-time recovery
- [ ] Enable PITR if the data is important enough that a specific restore timestamp matters
- [ ] Keep an offsite export schedule too, so backup recovery is not tied to one provider

## Server / Hosting

- [ ] Use a reverse proxy such as Nginx or Caddy in front of Node for HTTPS
- [ ] Enable SSL/TLS
- [ ] Use a process manager such as `pm2 start dist/server.cjs --name papriwale`
- [ ] Set up log rotation for PM2 logs
- [ ] Keep Render deploys tied to a specific commit SHA or release tag so rollback is one redeploy away

## Restore / Rollback

If something breaks in production, use this order:

1. Roll back the app first by redeploying the last known-good Render commit or release.
2. If the issue is data loss or corruption, restore Supabase from the latest backup or PITR snapshot.
3. If you also keep offsite exports, import the export into a staging copy first and verify the data before replacing production.
4. Re-run `npm run build` and the smoke checks before re-opening traffic.

Suggested restore checklist:

- [ ] Confirm whether the incident is code-only or data-related
- [ ] Redeploy the previous working app revision on Render
- [ ] If data is affected, restore the Supabase project to the last safe point
- [ ] Verify auth, checkout, payment verification, printing, and order history on staging
- [ ] Promote the fixed or restored state to production only after a clean verification pass

## Monitoring

- [ ] Keep `/health` reachable from an uptime monitor
- [ ] Alert on auth failures, payment verification failures, and printer errors
- [ ] Review server logs for failed login, checkout, and payment flows without logging secrets

## Security Reminders

- [ ] Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser/frontend
- [ ] Session tokens are also stored in `HttpOnly` cookies so the server can trust them without JavaScript access
- [ ] `localStorage` is now just a UI fallback, not the source of truth
- [ ] Rate limiting is active: 10 login attempts per 15 minutes per IP
- [ ] All POST inputs are sanitized server-side

## Start Production Server

```bash
npm run build
NODE_ENV=production node dist/server.cjs
```
