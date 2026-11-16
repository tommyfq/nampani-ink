# Nampani Ink — Tattoo Studio Website

Landing page and gallery for a multi-branch tattoo studio, with bookings sent to WhatsApp.

| Part | Tech | Folder |
|---|---|---|
| Website | Next.js 14 (App Router, server-rendered, TypeScript) | [web/](web) |
| API | NestJS 10 (TypeScript) | [api/](api) |
| Packaging | Docker Compose | [docker-compose.yml](docker-compose.yml) |

There is no database. All studio content lives in **[api/content/studio.json](api/content/studio.json)**
(all values are placeholders — replace them with real data).

## Run with Docker

```bash
cp .env.example .env        # set SITE_URL to your domain in production
docker compose up -d --build
```

Open http://localhost:3000.

- Only the `web` service is published. The browser calls `/api/*` and `/uploads/*` on the website,
  and Next.js forwards them to the `api` service inside Docker.
- `api/content` is mounted into the API container. Edit `studio.json` and refresh — no rebuild needed.
- Customer reference photos are stored in the `uploads` Docker volume.

Useful commands:

```bash
docker compose logs -f            # follow logs
docker compose up -d --build web  # rebuild after changing website code
docker compose down               # stop (photos are kept in the volume)
```

## Run without Docker (development)

```bash
cd api && npm install && npm run start:dev     # http://localhost:4000/api/site
cd web && npm install && npm run dev           # http://localhost:3000
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
