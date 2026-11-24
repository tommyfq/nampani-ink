# System Plan — Booking, POS and Admin (multi-outlet)

**Status:** Proposal, not started. Decisions still needed are listed in [section 11](#11-decisions-needed).
**Project:** `nampani-ink/` — Next.js landing page (`web/`) + NestJS API (`api/`), Docker Compose.
**Hosting target:** one Hostinger VPS (2 vCPU / 8 GB), Cloudflare in front.

---

## 1. Goal

One system for the whole studio:

| Part | Who uses it | What it does |
|---|---|---|
| **Landing page** | Customers | Browse work, send a booking request (with reference photos), pay a deposit |
| **POS** | Front desk and artists at each outlet | Booking inbox, artist calendar, check-in, consent form, checkout, payments, cash drawer, receipts |
| **Admin** | Owner and managers | Outlets, staff, artists, prices, website content, reports, commissions, settings |

All three talk to **one API**, which stores everything in **one PostgreSQL database**. Every
operational record belongs to an **outlet** (Canggu, Seminyak, Uluwatu, …). New outlets are
added in Admin, with no code change.

---

## 2. Architecture

```
                         Cloudflare (DNS, CDN, HTTPS, protection)
                                        │
        ┌───────────────────────────────┼───────────────────────────────┐
        ▼                               ▼                               ▼
 nampani.ink                    pos.nampani.ink                 (internal, via /api)
 Landing page (Next.js)         POS + Admin (Next.js)           NestJS API
 static or server-rendered      one app, role-based screens     REST + webhooks
        │                               │                               │
        └──────────── HTTPS / JSON ─────┴───────────────────────────────┤
                                                                        │
                       ┌──────────────────┬─────────────────┬───────────┴─────────┐
                       ▼                  ▼                 ▼                     ▼
                  PostgreSQL 16       Redis 7          Worker (same API     File storage
                  (all data)          (queues, cache,  image): WhatsApp,    (volume now,
                                      rate limits)     reminders, IG sync   R2 later)
```

Everything except the landing page runs on the VPS behind **Caddy**. The landing page can stay on
the VPS or move to Cloudflare Pages (free); it only needs the public API.

### Why POS and Admin are one app
They share login, the same data, the same components (calendar, customer lookup, booking card) and
the same deploy. The user's **role** decides which menu they see. Two separate apps would double the
work for little benefit. URLs: `pos.nampani.ink/admin/...` (POS and Admin screens in one app).

### Tech choices

| Layer | Choice | Reason |
|---|---|---|
| API | NestJS 10 (existing) | Already in the project; modules, guards and validation built in |
| Database | PostgreSQL 16 | Reliable, handles money, time ranges and reports well |
| ORM / migrations | Prisma | Typed queries, versioned migrations |
| Queue / cache | Redis 7 + BullMQ | WhatsApp sending, reminders, Instagram sync, retries |
| POS + Admin UI | Next.js 14 App Router + TanStack Query | Same stack as the landing page |
| Shared types | `packages/shared` (Zod schemas) | One definition of a booking used by API and all apps |
| Payments | Midtrans **or** Xendit | QRIS, bank virtual account, local and foreign cards, payment links, webhooks |
| WhatsApp | Phase 1: `wa.me` links (free). Phase 2: WhatsApp Cloud API | Automated confirmations and reminders |
| Files | Docker volume → Cloudflare R2 later | Reference photos, consent signatures, gallery images |
| Logs / monitoring | Pino JSON logs + Dozzle, Uptime Kuma | Light enough for one VPS |

### Repository layout (target)

```
nampani-ink/
├── apps/
│   ├── web/          landing page (current web/)
│   ├── app/          POS + Admin
│   └── api/          NestJS API + worker (current api/)
├── packages/
│   └── shared/       Zod schemas, enums, types, money/date helpers
├── docker-compose.yml
└── docs/
```

npm workspaces; one Docker image per app.

---

## 3. Users and roles

Each person has their **own login** (no shared outlet password), so every sale, void and refund
is traceable. A user can work at one or more outlets.

| Role | Scope | Can do |
|---|---|---|
| **Owner** | All outlets | Everything, including settings, deleting, payouts |
| **Manager** | Assigned outlets | Everything in POS, approve voids/refunds/discounts, outlet reports, staff schedules |
| **Front desk** | Assigned outlets | Booking inbox, calendar, customers, checkout, cash drawer |
| **Artist** | Own bookings | See own calendar and bookings, upload work photos, see own commission |

Sensitive actions (void, refund, discount above a limit, open the cash drawer without a sale)
require a **manager PIN**, and are written to the audit log.

---

## 4. Database design

### Conventions
- IDs: UUID v7 (sortable). Public codes are short and readable: `NPI-CGU-26-00042`.
- **Money:** integer **Rupiah** (`bigint`), never floats. Foreign cash is stored with its rate.
- **Time:** stored as `timestamptz` (UTC). Each outlet has a timezone (Bali = `Asia/Makassar`, WITA).
- **Outlet scope:** every operational table has `outlet_id`. The API adds the outlet filter from
  the logged-in user's allowed outlets, so one outlet can never read another's data by mistake.
- Soft delete (`archived_at`) for master data; financial records are never deleted, only voided.

### Entity overview

```mermaid
erDiagram
  OUTLET ||--o{ USER_OUTLET : staffs
  USER ||--o{ USER_OUTLET : works_at
  USER ||--o| ARTIST : "may be"
  ARTIST ||--o{ ARTIST_SHIFT : works
  OUTLET ||--o{ ARTIST_SHIFT : at
  CUSTOMER ||--o{ BOOKING : makes
  OUTLET ||--o{ BOOKING : receives
  ARTIST ||--o{ BOOKING : assigned
  BOOKING ||--o{ BOOKING_FILE : has
  BOOKING ||--o{ BOOKING_EVENT : history
  BOOKING ||--o| CONSENT_FORM : signs
  BOOKING ||--o{ PAYMENT : deposit
  BOOKING ||--o| SALE : "checked out as"
  OUTLET ||--o{ SALE : records
  SALE ||--o{ SALE_ITEM : contains
  SALE ||--o{ PAYMENT : paid_by
  SALE_ITEM ||--o| COMMISSION : earns
  ARTIST ||--o{ COMMISSION : receives
  COMMISSION }o--o| PAYOUT : "paid in"
  OUTLET ||--o{ CASH_SHIFT : opens
  CASH_SHIFT ||--o{ PAYMENT : "cash in"
  CATALOG_ITEM ||--o{ OUTLET_PRICE : priced
  OUTLET ||--o{ OUTLET_PRICE : sets
  STYLE ||--o{ GALLERY_ITEM : tags
  ARTIST ||--o{ GALLERY_ITEM : made
```

### Tables

**Organisation and staff**

| Table | Key columns |
|---|---|
| `outlets` | id, code (`CGU`), slug, name, address, geo, phone, whatsapp, timezone, opening_hours (json), tax_rate, service_charge_rate, receipt_footer, is_active |
| `users` | id, name, email, phone, password_hash (argon2), pin_hash, role, is_active, last_login_at |
| `user_outlets` | user_id, outlet_id, role (role can differ per outlet) |
| `artists` | id, user_id (nullable), slug, display_name, bio, photo, instagram, home_outlet_id, default_commission_pct, years, is_public, sort |
| `artist_specialties` | artist_id, style_id |
| `artist_shifts` | artist_id, outlet_id, weekday, start_time, end_time — weekly pattern |
| `artist_time_off` | artist_id, outlet_id (for guest spots), starts_at, ends_at, type (leave, guest, blocked) |

**Website content** (replaces `api/content/studio.json`)

| Table | Key columns |
|---|---|
| `styles` | id, slug, name, badge, description, motif, image, sort, is_public |
| `gallery_items` | id, artist_id, style_id, outlet_id, image_url, placement, size, caption, source (manual / instagram), ig_media_id, published_at, is_public |
| `faqs`, `reviews`, `site_settings` | Simple editable content; `site_settings` holds studio name, tagline, socials, accents |

**Customers and bookings**

| Table | Key columns |
|---|---|
| `customers` | id, name, phone (E.164, unique), email, country, birth_date, instagram, notes, allergies_note, marketing_opt_in, created_outlet_id. **Shared across outlets** so a customer is recognised everywhere |
| `bookings` | id, code, outlet_id, customer_id, artist_id, style_id, source (web, whatsapp, instagram, walk_in, pos), status, placement, size_cm, colour (bw/colour), idea, preferred_dates (json), starts_at, ends_at, room, quoted_min, quoted_max, deposit_required, notes_internal, created_by |
| `booking_files` | booking_id, kind (reference, stencil, result), url, uploaded_by |
| `booking_events` | booking_id, from_status, to_status, note, user_id, at — the timeline shown in POS |
| `consent_forms` | booking_id, customer_id, answers (json: health, medication, pregnancy, alcohol), id_checked, signature_url, signed_at, ip |

Double booking is blocked **in the database**: a PostgreSQL exclusion constraint on
`(artist_id, tstzrange(starts_at, ends_at))` for active bookings. Two front-desk staff can't put
the same artist in the same hour, even at the same second.

**Catalogue, sales and payments**

| Table | Key columns |
|---|---|
| `catalog_items` | id, type (tattoo_session, touch_up, piercing, aftercare, merch, deposit), name, sku, track_stock, is_active |
| `outlet_prices` | catalog_item_id, outlet_id, price — prices can differ per outlet |
| `sales` | id, number (per outlet, gap-free), outlet_id, booking_id, customer_id, cashier_id, status (open, paid, void, refunded), subtotal, discount, service_charge, tax, total, paid_total, void_reason, approved_by |
| `sale_items` | sale_id, catalog_item_id, artist_id, description, qty, unit_price, discount, total |
| `payments` | id, outlet_id, sale_id **or** booking_id (deposit), method (cash, qris, card_edc, transfer, payment_link), amount_idr, foreign_currency, foreign_amount, fx_rate, gateway, gateway_ref, status (pending, paid, failed, refunded), cash_shift_id, received_by |
| `cash_shifts` | id, outlet_id, opened_by, opening_float, opened_at, closed_by, counted_cash, expected_cash, difference, closed_at |
| `commissions` | sale_item_id, artist_id, base_amount, pct, amount, payout_id |
| `payouts` | id, artist_id, period_start, period_end, total, paid_at, paid_by, method |
| `stock_levels` / `stock_moves` | Phase 2: aftercare and merch stock per outlet |

**System**

| Table | Key columns |
|---|---|
| `number_sequences` | outlet_id, kind (booking, sale), year, last_value — locked row, gives gap-free numbers |
| `outbox_messages` | channel (whatsapp, email), to, template, payload, status, attempts, sent_at |
| `audit_logs` | user_id, outlet_id, action, entity, entity_id, before, after, ip, at |
| `integrations` | Instagram token, payment gateway keys (encrypted), webhook secrets |

---

## 5. Booking flow

### Status lifecycle

```
REQUESTED ──► QUOTED ──► DEPOSIT_PENDING ──► CONFIRMED ──► CHECKED_IN ──► IN_PROGRESS ──► COMPLETED
    │            │              │                 │             │
    └────────────┴──────────────┴─────────────────┴─────────────┴──► CANCELLED / NO_SHOW
```

Walk-ins skip straight to `CHECKED_IN`. Deposits can be turned off per outlet.

### Step by step

1. **Customer, landing page.** Picks outlet, style, artist (optional), placement, size, idea, up to
   3 reference photos, preferred dates, name and WhatsApp number, and ticks "I am 18+". The API
   saves the booking as `REQUESTED` and returns a code, for example `NPI-CGU-26-00042`.
   The page then opens WhatsApp with the code already in the message, so the conversation stays on
   WhatsApp as it does today, but the request is also stored.
2. **Front desk, POS inbox.** New requests appear per outlet, with photos. Staff check the artist
   calendar, set date/time, artist and price range, then press **Send quote**. The customer gets
   the quote on WhatsApp (link in Phase 1, automatic in Phase 2) with a **deposit payment link**.
3. **Customer pays the deposit** by QRIS, bank transfer or card. The payment gateway calls our
   webhook, the booking becomes `CONFIRMED`, and the slot is locked in the calendar.
4. **Reminder** on WhatsApp 24 hours before (Phase 2), with aftercare prep tips.
5. **Session day.** Check-in in POS, customer signs the **consent form** on a tablet (health
   questions, ID check, signature), artist starts the session.
6. **Checkout.** POS creates a sale from the booking: session price, deposit applied automatically,
   add aftercare cream or merch, choose payment method(s) (split payment allowed), print or
   WhatsApp the receipt. Commission is calculated per artist line.
7. **After.** Artist uploads the healed/result photo, which can go to the website gallery
   with one click. Touch-up reminder after about 4 weeks (Phase 2).

### Availability on the landing page
- **Phase 1:** the customer picks *preferred* dates; staff confirm. This matches how custom tattoos
  are really booked, because size and detail change the duration.
- **Later:** show live free slots for flash / small pieces with fixed durations.

---

## 6. POS screens (per outlet)

| Screen | Contents |
|---|---|
| Today | Appointments, walk-ins, deposits due, artists on shift, cash drawer status |
| Inbox | New requests with photos; quote, assign, reply on WhatsApp |
| Calendar | Day / week view per artist, drag to reschedule, rooms, time-off |
| Booking detail | Timeline, files, consent, payments, notes |
| Customers | Search by phone or name, visit history, all outlets |
| Checkout | Items, deposit applied, discounts (PIN above limit), split payments, receipt |
| Cash drawer | Open shift with float, cash in/out, close with count, difference report |
| End of day | Sales by method, deposits taken, voids, per-artist totals; printable |

Works on a tablet or laptop browser. Receipts: 58/80 mm thermal printer, PDF, or WhatsApp link.

---

## 7. Admin screens

| Area | Contents |
|---|---|
| Outlets | Add/edit outlets, hours, tax and service charge, receipt text, WhatsApp number |
| Staff | Users, roles per outlet, PINs, deactivate |
| Artists | Profile, specialties, home outlet, weekly shifts, guest spots, commission % |
| Catalogue | Items and price per outlet |
| Website | Styles, gallery (approve Instagram posts), FAQs, reviews, studio text — replaces `studio.json` |
| Reports | Sales by outlet / artist / style / payment method / day; deposits outstanding; no-show rate; conversion from request to booking; top customers |
| Commissions | Per artist per period, mark as paid, export |
| Settings | Deposit rules, booking policy, payment gateway, WhatsApp, Instagram connection |
| Audit log | Who did what and when |

Reports export to CSV/Excel.

---

## 8. API design

Three groups of endpoints, each with its own guard:

| Prefix | Auth | Used by | Examples |
|---|---|---|---|
| `/api/public/*` | None, rate-limited, cached | Landing page | `GET site`, `GET outlets`, `GET artists`, `GET gallery`, `POST bookings`, `POST bookings/:code/files` |
| `/api/pos/*` | Staff session + outlet header | POS | bookings, calendar, customers, sales, payments, cash-shifts |
| `/api/admin/*` | Manager / Owner | Admin | outlets, users, artists, catalogue, content, reports, settings |
| `/api/webhooks/*` | Signature check | Midtrans/Xendit, WhatsApp | payment status, message status |

- **Auth:** email + password, session in an `httpOnly`, `Secure` cookie for `pos.nampani.ink`;
  sessions stored in Redis so they can be revoked. Login rate limit and lockout.
- **Outlet scope:** POS sends `X-Outlet-Id`; a guard checks it against `user_outlets` and every query
  is filtered by it.
- **Validation:** shared Zod schemas from `packages/shared`.
- **Docs:** OpenAPI (Swagger) at `/api/docs`, protected in production.
- **Idempotency:** payment and checkout requests carry an idempotency key, so a double tap on a slow
  connection never charges twice.

NestJS modules: `auth`, `outlets`, `users`, `artists`, `schedule`, `customers`, `bookings`,
`availability`, `files`, `catalog`, `sales`, `payments`, `cash`, `commissions`, `reports`,
`content`, `notifications`, `integrations`, `audit`.

---

## 9. Security, privacy and backups

- **Personal data (UU PDP No. 27/2022):** collect only what's needed; consent forms and ID checks are
  visible to managers only; customers can ask for their data to be deleted (bookings are anonymised,
  sales kept for accounting); privacy notice on the booking form.
- Passwords with argon2; manager PINs hashed; gateway keys encrypted in the database.
- HTTPS everywhere (Cloudflare + Caddy); CORS allows only our domains; CSRF protection on cookie auth.
- Uploads checked by real file type (already done), stored with random names; private files
  (consent, ID) served only through the API with permission checks.
- **Backups:** nightly `pg_dump` and file backup to off-site storage (Cloudflare R2 or Backblaze),
  kept 30 days; restore tested monthly.
- Monitoring: Uptime Kuma alerts to WhatsApp/Telegram; logs kept 14 days.

---

## 10. Build schedule (target: go-live Friday 18 December 2026)

Compressed plan: built with AI-assisted development, released in steps, with fast reviews.
Every payment is saved from day one, so revenue sharing can be calculated for all past
transactions once it is switched on.

| Week | Dates | Build | Done when |
|---|---|---|---|
| **1** | Mon 23 – Sun 29 Nov | **Foundation + Admin.** VPS, Docker, Caddy, Cloudflare, mail records, backups, deploy. Database schema, logins and roles, outlets, staff, artists and shifts, styles, gallery, FAQs in Admin. Settings: payment methods + fee %, revenue schemes, DP %, discount limit. Landing page on the real domain reading from the database | Owners log in to Admin and edit the website |
| **2** | Mon 30 Nov – Sun 6 Dec | **Booking + POS.** Consultation form (website + WhatsApp branch), customers, consultation and appointment statuses, artist calendar, double-booking guard, walk-ins, auto-cancel after no-show. DP 10% and final payment with proof (card approval code, transfer photo, cash), discounts, receipts sent by hand with a WhatsApp button, cash drawer, end-of-day | **MVP soft launch Sat 5 Dec**: staff take real bookings and payments |
| **3** | Mon 7 – Sun 13 Dec | **WhatsApp automation.** Convia send + webhook receive (messages saved), 16-hour reminders with Confirm / Reschedule, DP receipt + confirmation, final receipt, free-or-paid choice, on/off switches. Baileys internal number for the artist group. **Revenue sharing** engine (split per transaction, Tutut rule, forfeited DP, card fee to Operational) | Reminders and receipts go out automatically |
| **4** | Mon 14 – Fri 18 Dec | **Reports + finish.** Products with stock and purchase cost, artist payouts per period, mark shares paid, investor PDF, sales and bank reports, CSV export. Full test with staff, fixes, training | **Go-live Fri 18 Dec** |
| Buffer | 19 Dec – 3 Jan | Fixes from real use; holidays | 3 months free maintenance start at go-live |

### Conditions to hit 18 December

| By | Who | What |
|---|---|---|
| Tue 24 Nov | Owners | Pay the DP; buy VPS, domain, mail hosting, Convia |
| Wed 25 Nov | Owners | Start Meta Business verification and connect the Nampani Ink number to Convia |
| Fri 27 Nov | Owners | Real content: artists, styles, photos, prices, outlet details |
| Sun 29 Nov | Owners | SIM card + phone for the internal Baileys number |
| Fri 4 Dec | Staff | One staff member tests the POS for a day |
| Mon 7 Dec | Owners | Answer open questions: reschedule rules, EDC bank and fee rates, foreign cards, product split |
| Every 1–2 days | Tommy | Review and approve each delivered piece |

### Risks and fallbacks

| Risk | Fallback |
|---|---|
| Meta verification or template approval is late | Keep sending by hand with the WhatsApp button (already in the MVP); switch on automation when approved |
| Baileys number gets disconnected or banned | Artists see their schedule in the app; owner re-links from Admin |
| Open questions not answered by 7 Dec | Ship with sensible defaults (settings in Admin) and adjust later |
| Bugs found in staff testing | 19 Dec – 3 Jan buffer, covered by free maintenance |

**Later, not in this invoice:** Instagram → website gallery sync ([plan](instagram-sync-plan.md)), digital consent form, online DP payment links, more outlets, customer accounts.

---

## 11. Decisions

### Decided (November 2026)

| Topic | Decision |
|---|---|
| Brand name | **Nampani Ink** on receipts, website and WhatsApp |
| Outlets | One outlet now; the database supports many |
| Logins | **One login per person** |
| Discounts | Only Manager or Owner can give them in POS, up to a **maximum %** that owners set in Admin |
| Customers | No customer accounts; customer data is saved in the database |
| Deposit (DP) | Setting can turn it on/off. Currently **required: 10% of the quoted price**, rounded up only when it has a fraction (to a whole Rupiah), **not refundable**, counted as part of the tattoo payment |
| Payment steps | Only two: the **DP**, then the **full remaining payment**. A tattoo over several sessions is still paid this way. The DP is paid **at the studio** for now |
| Consultation | **Free**, with **any staff member**, at the studio or **online** (WhatsApp); appointments can also be made through WhatsApp |
| Confirmations | If a customer doesn't tap Confirm, nothing changes. A booking is **cancelled automatically 1 day after** the customer fails to come to the studio |
| Walk-ins | Allowed when an artist is free: straight to the session and full payment, no consultation or DP |
| Payments | **Cash, bank transfer, QRIS, debit/credit card (EDC)**, all recorded manually. **Mostly credit card.** Proof per method: transfer/QRIS → photo of the customer's proof; card → staff enter the EDC approval code (+ optional slip photo), no transfer proof and no card numbers stored; cash → counted in the cash drawer. No online payment gateway for now |
| Payment fees | **Payment methods are a setting in Admin**, each with its own fee % (e.g. "BCA credit card 2%"). Every transaction records the method and fee, and the fee is taken from the **Operational** share |
| Currency | IDR only. Tips are not recorded |
| Tax | No PPN in the system or on receipts |
| WhatsApp provider | **Convia Starter** (official Cloud API, 2 years prepaid), on the Nampani Ink WhatsApp Business number; staff keep using the app on the same number. Meta message fees (about Rp356 + PPN to +62 numbers) are paid by the studio |
| Consultation reminder | Same rule as the appointment reminder: **16 hours before** the consultation, 08:00–20:00, **Confirm / Reschedule** buttons. The tap keeps the chat open so the **DP receipt + booking confirmation** (one message) is free when the DP is paid at the consultation |
| Appointment reminder | Sent **16 hours before** the appointment (setting), moved inside **08:00–20:00** so it never arrives at night. Has **Confirm / Reschedule** buttons; the customer's tap opens WhatsApp's free 24-hour window so the receipt after the session is free. Unconfirmed bookings are flagged in POS for staff to call |
| Receipts | Sent automatically after full payment, **no QR code**. If the customer messaged in the last 24 hours, it goes as a free reply; otherwise as a paid utility template |
| Products | Products (e.g. aftercare) are sold in POS transactions, with **stock tracking** per outlet. Owners, admins and managers record the **purchase cost** |
| Artist commission | **45% for every artist** |
| Artist payouts | Artists are freelance: **each artist has their own period**. A period starts on the artist's first job after the last payout and runs a set number of days (e.g. job on the 5th → period 5th–19th, paid after the 19th) |
| Investor report | Owners export it to **PDF** (no investor login). The investor payout period is stored in configuration |
| WhatsApp until after go-live | **Sent by hand.** POS → WhatsApp messages lists every reminder, DP confirmation and receipt due; staff (not artists) tap Open WhatsApp (text filled in from the owner's Bahasa Indonesia templates), attach the receipt PDF, send, and mark as sent. Automation (Convia) comes after go-live (target 23 Dec) using the same templates |
| Receipts | **A4 PDF in Bahasa Indonesia** (kuitansi), one per payment, numbered NPI-<outlet>-R-<yy>-<00001>. Voided receipts are kept and stamped BATAL |
| Payments | Tattoo DP confirms the booking; the final payment completes it. Discounts by front desk need a manager/owner PIN. Payments can only be voided by managers/owners, with a reason |
| WhatsApp on/off | **Owner only.** Two main switches in Admin → Settings: customer messages (Convia) and artist messages (internal number). Both start **off**. Per-message switches (consultation reminder, DP confirmation, appointment reminder, receipt) only apply while customer messages are on |
| Internal messages | Artist reminders and schedule changes go through **Baileys on a separate WhatsApp number** (internal group + each artist); never used for customers |

### Revenue sharing (tattoo services)

Every paid tattoo service is split after discount. Only the owners (Tutut and Yensen) see the
breakdown and mark shares as paid. The investor receives a report.

| Share | Default | Rule |
|---|---|---|
| Artist | 45% | |
| Management fee | 10% | Split **equally**: Tutut 5%, Yensen 5%. When **Tutut** is the artist, Yensen gets the full 10% |
| Marketing | 10% | |
| Rent | 10% | |
| Operational | 5% | Also pays QRIS and card fees |
| Investor | 10% | |
| Save cost | 10% | Receives any Rp rounding remainder |

**Forfeited DP** (cancel or no-show): **90% artist, 10% marketing**.

**Product sales** have their own revenue-sharing setting (split not decided yet; owners set it in Admin when known).

**All percentages are settings in Admin** (owners only). A change applies to **new transactions only**; past transactions keep the split they were paid with.

Design: schemes are stored in the database (`revenue_schemes`, `revenue_scheme_lines`), each sale
item stores its split at payment time (`revenue_allocations`), and payouts record which allocations
were paid (`share_payouts`). Changing percentages never changes past transactions.

### Still open

1. Product revenue split percentages (the setting exists; values to be decided)
2. Investor payout period value
3. Reschedule rules: does the DP move to the new date, and how many times?
4. EDC bank and card fee rates; whether foreign cards are accepted
