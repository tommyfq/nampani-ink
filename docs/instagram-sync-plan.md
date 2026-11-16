# Development Plan — Instagram → Website Gallery Sync

**Status:** Planned (not started). Start after the mockup / front-end design is final.
**Project:** `nampani-ink/` (Next.js `web/` + NestJS `api/`, Docker Compose)

---

## 1. Goal

When the studio (or an artist) posts a tattoo on Instagram, it appears automatically in the
website gallery — on the home page, the matching style page, the artist page and the studio
page — with the "Book this design on WhatsApp" button. No manual upload on the website.

### In scope
- Read posts from the studio's Instagram account and add them to the website gallery.
- Use caption hashtags to set style, artist (and therefore studio branch).
- Keep images on our own server.
- Hide posts on the website when they are deleted or archived on Instagram.
- A simple admin status page: connected account, last sync, "Sync now", untagged posts.

### Out of scope (for now)
- Website → Instagram publishing (possible later with the Content Publishing API).
- Comments, likes, stories, messages.
- Multiple Instagram accounts (e.g. one per artist). Can be added later.

---

## 2. Key facts from Meta's documentation

| Fact | Impact on the plan |
|---|---|
| Needs an Instagram **Business or Creator** account and a Meta developer app ("Instagram API with Instagram Login"). | Switch the studio account to professional before development. |
| Read permission: `instagram_business_basic`. | Only our own account → app stays in development mode; no Meta App Review needed. |
| Instagram **webhooks do not notify about new posts** (only comments, mentions, story insights, messages). | We **poll** the API on a schedule (every 15–30 min). |
| Instagram image links (`media_url`) **expire**. | Download every image to our server at sync time. |
| Long-lived access tokens last **about 60 days** and can be refreshed. | Automatic token refresh job; alert if refresh fails. |
| Meta login redirect needs a public **HTTPS** address. | Connect the account once the site is on its real domain (or use a token generated in the Meta App Dashboard during development). |

Docs: [Instagram API with Instagram Login](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login) ·
[Business Login](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login.md) ·
[IG User / media](https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user) ·
[IG Media](https://developers.facebook.com/docs/instagram-platform/reference/instagram-media) ·
[Webhooks](https://developers.facebook.com/documentation/instagram-platform/webhooks)

---

## 3. How it works

```
 Instagram account
        │  (every 15–30 min)
        ▼
 NestJS  InstagramModule ──► download image ──► uploads/instagram/<id>.jpg (+ thumbnail)
        │  parse caption hashtags → style / artist
        ▼
 data/instagram-works.json   (synced posts, on a Docker volume)
        │
 ContentService merges:  manual gallery (studio.json)  +  Instagram posts
        ▼
 /api/site, /api/styles/:id, /api/artists/:id, /api/studios/:id
        ▼
 Next.js pages (home, style, artist, studio) — same Gallery component
```

### Caption hashtag convention (decide with the team)

Example caption:

```
Barong mask on the back, 2 sessions 🔥  #balinese #artist_wayan
```

| Hashtag | Meaning |
|---|---|
| Style tags, e.g. `#fineline`, `#microrealism`, `#balinese` | Gallery style (mapping list kept in `studio.json`) |
| `#artist_<name>`, e.g. `#artist_wayan` | Artist → also decides the studio branch and WhatsApp number |
| `#nosite` | Do not show this post on the website |

- Posts without a known style **or** artist tag are saved but marked **"untagged"** and shown in the
  admin page (option: still show them under "All work" only — decide during mockup).
- Mapping lives in `api/content/studio.json`, e.g.
  `"instagramTags": { "fineline": "fine-line", "artist_wayan": "wayan" }`, so tags can change without code.

### Post types

| Instagram type | Website handling |
|---|---|
| Image | Use the image. |
| Carousel | Use the first image as cover; keep the other images for the pop-up (swipe). |
| Video / Reel | Use the thumbnail image + "Watch on Instagram" link (no video hosting). |

---

## 4. Work breakdown

### Phase 0 — Setup (0.5–1 day)
- [ ] Switch studio Instagram to a **Business or Creator** account.
- [ ] Create a Meta developer app, add the **Instagram** product ("API setup with Instagram login").
- [ ] Add the studio account as a tester / app role; set the redirect URL (`https://<domain>/api/instagram/callback`).
- [ ] Agree on the hashtag convention with artists (section 3).
- [ ] Add environment variables (section 6).

### Phase 1 — API: connect & token handling (1–1.5 days)
- [ ] `InstagramModule` in NestJS.
- [ ] `GET /api/instagram/connect` → redirect to Instagram login (admin only).
- [ ] `GET /api/instagram/callback` → exchange code for a short-lived token, then a long-lived (≈60-day) token.
- [ ] Store token + expiry in `data/instagram.json` on a Docker volume (file permission 600, never sent to the browser).
- [ ] Daily job: refresh the token when it expires in < 10 days; log + show warning on admin page if it fails.

### Phase 2 — API: sync job (1.5–2 days)
- [ ] Add `@nestjs/schedule`; job every `IG_SYNC_MINUTES` (default 30).
- [ ] Fetch `/me/media` with fields `id, caption, media_type, media_url, thumbnail_url, permalink, timestamp, children{media_type, media_url}`; follow pagination until a known post is reached.
- [ ] Download images to `uploads/instagram/` (skip if already downloaded). Generate a resized WebP + small thumbnail (`sharp`).
- [ ] Parse hashtags → style/artist; respect `#nosite`.
- [ ] Save to `data/instagram-works.json` (id, style, artist, caption, permalink, timestamp, image paths, width/height, status).
- [ ] Daily full check: posts missing from Instagram → set `hidden` (deleted/archived).
- [ ] Lock so two syncs never run at once; retry with back-off on API errors.

### Phase 3 — API: content merge (0.5 day)
- [ ] `ContentService` merges manual gallery + Instagram works (newest first, de-duplicated).
- [ ] Gallery items get `source: "instagram"`, `permalink`, `caption`, `takenAt`.
- [ ] Existing endpoints (`/api/site`, `/api/styles/:id`, …) return merged data — no front-end API change needed.

### Phase 4 — Website (1–1.5 days, after mockup is final)
- [ ] Gallery uses real photos (`image`) with proper `alt` text built from style, artist and placement.
- [ ] Image aspect ratio to match the new mockup (Instagram is mostly 4:5 portrait — decide in mockup).
- [ ] Pop-up: carousel swipe, caption, "View on Instagram" link, date.
- [ ] "Load more" / pagination when the gallery grows (avoid 100+ images on the home page).
- [ ] SEO: `ImageObject` structured data for gallery images; sitemap `lastModified` from the newest post.
- [ ] WhatsApp "Book this design" message includes the website image link.

### Phase 5 — Admin status page (1 day)
- [ ] `/admin/instagram` (protected by `ADMIN_TOKEN`, `noindex`).
- [ ] Shows: connected account, token expiry, last sync time/result, number of posts.
- [ ] Buttons: **Connect / Reconnect**, **Sync now**.
- [ ] List of **untagged** posts so staff can fix the caption on Instagram (or set style/artist manually).

### Phase 6 — Testing & launch (1 day)
- [ ] Unit tests: hashtag parser, merge/de-duplication, token refresh timing.
- [ ] Integration test with a recorded Instagram API response (no live calls in CI).
- [ ] Manual test on staging: post on Instagram → appears on the website within one sync interval.
- [ ] Delete/archive a post → disappears from the website after the daily check.
- [ ] Docker: new volume, env vars, restart keeps data.

**Total estimate: about 7–9 working days** for one developer (excluding mockup changes).

---

## 5. Data storage decision

The project currently has **no database**. For this feature:

- **Now:** store synced posts and the token in JSON files on a Docker volume (`data/`). Simple and enough
  for one account and a few hundred posts.
- **Later (POS phase):** when PostgreSQL is added for the POS, move `instagram-works` and the token into
  database tables. The `InstagramModule` should read/write through one small repository class so this
  switch only touches that class.

---

## 6. Configuration

New environment variables (`api` service):

| Variable | Example | Purpose |
|---|---|---|
| `IG_APP_ID` | `123456789` | Meta app ID |
| `IG_APP_SECRET` | *(secret)* | Meta app secret — never commit |
| `IG_REDIRECT_URI` | `https://yourstudio.com/api/instagram/callback` | OAuth callback |
| `IG_SYNC_MINUTES` | `30` | How often to check for new posts |
| `ADMIN_TOKEN` | *(long random string)* | Protects admin endpoints/page |
| `DATA_DIR` | `/app/data` | Token + synced posts (Docker volume) |

`docker-compose.yml`: add a `data` volume to the `api` service and pass the variables from `.env`.

---

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Token expires (e.g. password change, 60 days) → sync stops silently | Daily refresh, warning on admin page and in logs; easy "Reconnect" button. |
| Artists forget hashtags → wrong/missing gallery placement | "Untagged" list in admin; short guide for artists; manual override. |
| Instagram API changes | Isolate all API calls in one service; pin API version; follow Meta changelog. |
| Big images slow the site | Resize + WebP on download; lazy loading; pagination. |
| Customer photos or private posts appear by mistake | Only the studio's own account is synced; `#nosite` to exclude a post. |
| Sync can't run on localhost (OAuth needs HTTPS) | Develop with a token from the Meta App Dashboard; connect for real on the live domain. |

---

## 8. Decisions needed from the mockup / design phase

1. Gallery layout and image shape (square vs 4:5 portrait like Instagram).
2. Show untagged posts under "All work", or hide them until tagged?
3. Show the Instagram caption on the website, or only style/artist/placement?
4. Videos/Reels: show with play icon linking to Instagram, or skip?
5. How many posts on the home page, and "Load more" vs a separate `/gallery` page.
6. Final hashtag list (styles + artists) agreed with the artists.

---

## 9. Acceptance criteria

- A new Instagram post with `#fineline #artist_ayu` appears within 30 minutes on: home gallery,
  `/styles/fine-line`, `/artists/ayu` and `/studios/canggu`.
- Its "Book this design" WhatsApp message goes to the Canggu number and includes the image link.
- A post with `#nosite` never appears.
- Deleting a post on Instagram hides it on the website within 24 hours.
- Restarting or rebuilding the Docker containers keeps all synced posts and the connection.
- The access token renews automatically; the admin page shows its expiry date.
