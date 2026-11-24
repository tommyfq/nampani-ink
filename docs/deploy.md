# Deploying to the VPS

Server: Hostinger VPS `177.202.250.213` (Ubuntu 26.04, timezone Asia/Makassar).
Log in with your SSH key as `deploy` (password login is off). Code lives in
`/usr/share/docker/nampani-ink`; secrets in `.env` there (never copied from the Mac).

Only Caddy is public (ports 80/443). Website and POS listen on 127.0.0.1 only.

## Update the server with the latest code (from the Mac, in the project folder)

```bash
rsync -az --delete --exclude .git/ --exclude node_modules/ --exclude .next/ --exclude out/ --exclude dist/ --exclude .env --exclude api/.env --exclude api/private/ --exclude api/uploads/ --exclude .DS_Store ./ deploy@177.202.250.213:/usr/share/docker/nampani-ink/
```

```bash
ssh deploy@177.202.250.213 'cd /usr/share/docker/nampani-ink && docker compose -f docker-compose.yml -f compose.prod.yml up -d --build'
```

Database migrations run automatically when the API starts.

## Useful commands (on the server, in /usr/share/docker/nampani-ink)

```bash
docker compose -f docker-compose.yml -f compose.prod.yml ps        # status
docker compose logs -f --tail 100 api                              # API logs
docker compose exec api node dist/scripts/import-content.js        # re-import studio.json
docker compose exec api node dist/scripts/create-user.js --email you@example.com --name "Name" --role OWNER
```

## POS before the domain is set up

```bash
ssh -N -L 3101:127.0.0.1:3001 deploy@177.202.250.213
```

Then open http://localhost:3101 while that command runs.

## Domain settings (.env on the server, live since 24 Nov 2026)

```
SITE_URL=https://nampani.ink
SITE_ADDRESS=nampani.ink
WWW_ADDRESS=www.nampani.ink
APP_ADDRESS=pos.nampani.ink
APP_ORIGINS=https://pos.nampani.ink
COOKIE_SECURE=true
```

Then run `docker compose -f docker-compose.yml -f compose.prod.yml up -d`. Caddy gets HTTPS certificates automatically.

## Backups

`/usr/local/bin/nampani-backup` runs every night at 03:00 WITA (cron), writing the
database dump plus uploads and payment proofs to `/opt/nampani-backups` (kept 14 days).
Restore a database dump:

```bash
docker compose exec -T db pg_restore -U nampani -d nampani --clean --if-exists < /opt/nampani-backups/db_<date>.dump
```
