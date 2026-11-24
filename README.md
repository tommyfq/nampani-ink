# Nampani Ink — Tattoo Studio Website, Booking, POS and Admin

Landing page, bookings, POS and admin for a multi-outlet tattoo studio. Plan: [docs/system-plan.md](docs/system-plan.md).

| Part | Tech | Folder | Port |
|---|---|---|---|
| Website | Next.js 14 (App Router, server-rendered, TypeScript) | [web/](web) | 3000 |
| POS + Admin | Next.js 14 (one app, screens by role) | [app/](app) | 3001 |
| API | NestJS 10 + Prisma | [api/](api) | 4000 (internal) |
| Database | PostgreSQL 16 | `db` service | internal |
| Cache / sessions | Redis 7 | `redis` service | internal |

Website content (outlets, artists, styles, gallery, FAQs, reviews, studio details) is stored in the
database and edited in Admin. [api/content/studio.json](api/content/studio.json) is only used for the
one-time import (`npm run db:import`) and for the static GitHub Pages preview.

## Local development

```bash
docker compose -f docker-compose.yml -f compose.dev.yml up -d db redis   # PostgreSQL on 5433, Redis on 6380
cd api && cp .env.example .env      # use the same password as POSTGRES_PASSWORD in ../.env
npx prisma migrate dev               # create tables
npm run db:import                    # move studio.json content into the database (safe to re-run)
PASSWORD='choose-a-password' npm run user:create -- --email you@example.com --name "Your Name" --role OWNER
npm run start:dev                    # API on http://localhost:4000
cd ../web && API_INTERNAL_URL=http://localhost:4000 npm run dev -- -p 3002   # website
cd ../app && npm run dev             # POS + Admin on http://localhost:3001
```

## Run with Docker

```bash
cp .env.example .env        # set SITE_URL to your domain in production
docker compose up -d --build
```

Open http://localhost:3000.

- Only `web` (3000) and `app` (3001) are published. Both forward `/api/*` to the `api` service inside Docker,
  so the login cookie stays first-party.
- The API applies database migrations on start. First time only, import content and create the first owner:
  `docker compose exec api node dist/scripts/import-content.js` and
  `docker compose exec -e PASSWORD='choose-a-password' api node dist/scripts/create-user.js --email you@example.com --name "Your Name" --role OWNER`
- Customer reference photos are stored in the `uploads` Docker volume.

Useful commands:

```bash
docker compose logs -f            # follow logs
docker compose up -d --build web  # rebuild after changing website code
docker compose down               # stop (photos are kept in the volume)
```

## Public preview on GitHub Pages

A static copy of the site is published to **https://tommyfq.github.io/nampani-ink/** by
[.github/workflows/pages.yml](.github/workflows/pages.yml) on every push to `main`.

One-time setup on GitHub:

1. The repository must be **public** (GitHub Free), or the account needs GitHub Pro for Pages on a private repo.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Push to `main`, or run the workflow from the **Actions** tab.

Differences from the Docker version:

- Content is taken from `api/content/studio.json` when the workflow runs — push a change to update the site.
- No reference-photo upload (no server). Visitors attach photos in the WhatsApp chat instead.
- `robots.txt` and `sitemap.xml` sit under `/nampani-ink/`, so search engines won't use them there.
  Use the Docker version on your own domain for SEO.

Build the static version locally:

```bash
cd web
STATIC_EXPORT=1 BASE_PATH=/nampani-ink SITE_URL=https://tommyfq.github.io/nampani-ink npm run build   # output in web/out
```

## Pages (SEO structure)

| URL | Purpose |
|---|---|
| `/` | Home: hero, styles, gallery, artists, studios, reviews, booking form, FAQ |
| `/styles`, `/styles/[slug]` | One page per tattoo style, e.g. `/styles/fine-line` |
| `/artists`, `/artists/[slug]` | One page per artist with their portfolio |
| `/studios`, `/studios/[slug]` | One page per branch, e.g. `/studios/seminyak` — targets "tattoo studio in Seminyak" searches |
| `/sitemap.xml`, `/robots.txt` | Generated from the content |
| `/opengraph-image` | Share image for WhatsApp, Facebook, X |

SEO built in:

- Server-rendered HTML — search engines see all text, including FAQ answers.
- A unique `<title>`, description and canonical URL on every page (`generateMetadata`).
- Structured data (JSON-LD): `Organization`, `WebSite`, one `TattooParlor` per branch with address
  and opening hours, `FAQPage`, `Person` for artists, `BreadcrumbList` on sub-pages.
- One `<h1>` per page, visible breadcrumbs, internal links between styles, artists and studios.
- Footer lists every style, studio and artist, plus the nearby areas you serve.

Before launch: set `SITE_URL`, add each branch's map coordinates (`geo`) in `studio.json`, and
replace placeholder reviews with real ones.

## API

| Method | Path | Returns |
|---|---|---|
| GET | `/api/site` | All content in one response |
| GET | `/api/studios`, `/api/studios/:id` | Branches; one branch with its artists and work |
| GET | `/api/styles`, `/api/styles/:id` | Styles; one style with its work and artists |
| GET | `/api/artists`, `/api/artists/:id` | Artists; one artist with their work |
| GET | `/api/gallery?style=&artist=&studio=` | Filtered work |
| POST | `/api/uploads` | Reference photos (field `files`, max 3 × 10 MB). Returns public links |
| GET | `/api/health` | Health check |

Uploads are checked by their real file contents (JPG, PNG, WEBP, GIF, HEIC only), saved with random
names, and rate-limited to 10 requests per minute per visitor.

## Adding real photos

Put images in `web/public/images/` and set `"image": "/images/your-photo.jpg"` on a gallery item
(or `"photo"` on an artist). Rebuild the web image. When a gallery item has a photo, its WhatsApp
message includes the photo link.

## Production notes

- Put a reverse proxy with HTTPS (Nginx, Caddy or Cloudflare) in front of port 3000.
- Back up the `uploads` volume if you need to keep customer photos.
