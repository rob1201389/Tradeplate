# Trade Plate Record of Use

A web app for recording every use of a trade plate. Each plate carries a QR
code on the back. A driver scans it, fills in the trip, signs, and drives off.
When the plate comes back they scan the same code and sign it in. The office
gets a searchable, exportable record.

Built to be used on a phone in a yard, in the rain, with one hand.

## How it works

**Driver**

1. Scans the QR code on the back of the plate.
2. If a shared access PIN is set, enters it once (remembered 60 days per phone).
3. Sees either a **sign out** form or, if the plate is already out, a **book in**
   form. There is no wrong screen to land on.
4. Fills in: date and time out (defaults to now), batch number, vehicle make,
   rego or VIN, trip destination, purpose of use, driver's name, licence number,
   then signs on the glass.
5. On return, scans again: date and time in defaults to now, adds any notes,
   signs, done.

The last few trips for that plate are shown underneath, so the next driver can
see who had it and when.

**Office**

- `/admin` — every record, filterable by date range, plate, driver and status,
  with a one-click CSV export for an audit request.
- `/admin/trips/<id>` — the full record including both signatures, printable.
- `/admin/plates` — add plates, retire plates, and print the QR label sheet.
- `/` — a live board showing which plates are out and with whom.

## Fields recorded

| Field | Required | Notes |
| --- | --- | --- |
| Plate number | yes | Set by the QR code, or chosen from a dropdown on manual entry |
| Date and time out | yes | Defaults to now, NSW time |
| Batch number | yes | Carried forward from the plate's last trip |
| Vehicle make | yes | |
| Vehicle rego or VIN | no | |
| Trip destination | yes | |
| Purpose of use | no | Dropdown |
| Driver's name | yes | |
| Driver's licence number | no | |
| Driver's signature out | yes | Captured on screen, stored as an image |
| Date and time in | yes, to close | Defaults to now |
| Driver's signature in | yes, to close | |
| Notes | no | Damage, delays, fuel |

Every entry also stores the time it was saved and the IP address and browser it
came from, so an entry can be shown to be genuine. Records are never edited or
deleted through the app.

## Setup

### 1. Database

Any Postgres will do. Use a provider with an **Australian region** — see
[Where to host it](#where-to-host-it).

```bash
cp .env.example .env     # then fill it in
npm install
npm run db:migrate
```

### 2. Add your plates

```bash
npm run db:seed -- "1234 TP" "5678 TP"   # add plates
npm run db:seed                          # list plates and their scan URLs
```

Or add them through `/admin/plates` once the app is running.

### 3. Set the public URL before printing QR codes

`NEXT_PUBLIC_BASE_URL` is baked into every QR code. Get the domain right first,
or you will be reprinting labels.

### 4. Print and fit the labels

`/admin/plates/print` gives you a cut-out sheet. Print on adhesive label stock,
laminate, and fix one to the back of the matching plate. Each code is unique to
its plate.

### 5. Run it

```bash
npm run dev     # local
npm run build && npm start   # production
```

## Where to host it

The records contain names, licence numbers and signatures. That is personal
information, so where it sits matters.

**Recommended: Vercel (Sydney region) + Neon Postgres (ap-southeast-2).**
Both have free or near-free tiers at this volume, deploy from a git push, and
keep the data in Australia. Set the Vercel function region to `syd1` and create
the Neon project in AWS ap-southeast-2 (Sydney).

Workable alternatives, in order of how little you will have to think about them:

| Option | Data location | Notes |
| --- | --- | --- |
| Vercel `syd1` + Neon Sydney | Australia | Easiest. Postgres backups and point-in-time restore included |
| Vercel `syd1` + Supabase Sydney | Australia | Same idea, adds a dashboard you probably won't need |
| Railway or Render, Sydney region | Australia | One provider for app and database |
| Fly.io `syd` + Fly Postgres | Australia | Cheapest at small scale, you manage more |
| Your own VPS in Sydney | Australia | Only if someone will actually patch it |

Whichever you pick, do these:

- **Keep it in Australia.** Not because the law forbids offshore storage, but
  because it removes the cross-border disclosure question entirely and makes
  producing records to Transport for NSW straightforward.
- **HTTPS only.** All the hosts above do this by default. The app sets HSTS,
  a content security policy, `X-Frame-Options`, `noindex` and a `robots.txt`
  that disallows everything, so the records stay out of search engines.
- **Turn on database backups** and check you can actually restore one. A record
  of use you cannot produce is worse than no system at all.
- **Multi-factor authentication on the hosting and database accounts.** That is
  the real front door, not the app password.
- **Restrict database access** to the app. Neon and Supabase let you limit
  connections by IP or by role — use it, and do not reuse the database password
  anywhere else.
- **Rotate `SESSION_SECRET` and `ADMIN_PASSWORD`** when someone leaves. Changing
  `SESSION_SECRET` signs everyone out immediately.

### Access control

| Who | What they can reach | Controlled by |
| --- | --- | --- |
| Driver with a plate's QR code | That plate's sign out / book in form, and the plate's last 5 trips | `DRIVER_PIN` (optional but recommended) |
| Office | Every record, CSV export, plate management | `ADMIN_PASSWORD` |

A plate's QR link is a long random string, so it cannot be guessed. But a link
can be forwarded. Set `DRIVER_PIN` and a photo of the label is not enough on its
own to write into your audit record.

There is one office password, not per-user accounts. That is deliberate at this
size. If you need to know which staff member exported what, that is a bigger
change — say so and it can be added.

## Privacy

The app ships with a privacy notice at `/privacy` and a short collection notice
next to the signature box on both forms, which is where the driver is actually
handing over their details. Both are filled in from environment variables, so
they name your business, your privacy contact and your retention period rather
than anything hardcoded.

Set these before go-live:

```
ORG_NAME="Your Business Pty Ltd"
PRIVACY_CONTACT="the Privacy Officer"
PRIVACY_CONTACT_EMAIL="privacy@example.com"
PRIVACY_CONTACT_PHONE=""
RETENTION_YEARS="5"
```

**Read the notice at `/privacy` before you go live and have your own adviser
check it.** It is written to cover what this system actually collects, but the
wording is generic and it is not legal advice. The parts most likely to need
changing for you are who the records get disclosed to, and how long you keep
them.

### Retention

Nothing is deleted automatically. When you are ready to enforce the retention
period:

```bash
npm run db:purge            # dry run, reports what would go
npm run db:purge -- --apply # deletes closed records older than RETENTION_YEARS
```

Run it monthly. Open records are never touched — a plate that has not come back
is still in use.

`RETENTION_YEARS` defaults to 5. Confirm the period that applies to you before
you delete anything: dealer record-keeping obligations and your insurer's
requirements may not be the same number, and once it is purged it is gone.

## Checks

```bash
npm run typecheck     # types
npm run check:time    # NSW time conversion, including both DST switchovers
npm run build         # production build
```

Times are entered and displayed as NSW local time and stored as UTC, so records
either side of a daylight saving change stay correct and sortable.

## Things worth knowing

- **One plate, one open record.** Enforced by a partial unique index in the
  database, not just in code, so two phones signing the same plate out at the
  same moment cannot both succeed.
- **The date and time fields are editable.** A driver who forgot to scan on the
  way out can set the real time. That is the point of a record, but it does mean
  the timestamps are a driver's assertion — which is why the app also stores when
  the entry was actually saved, and from where.
- **Signatures are stored inline** as PNG data in the record itself. No file
  storage to configure, and nothing to leak separately.
- **Confirm the field list against what Transport for NSW asks you for.** The
  fields here cover the usual ground and then some, but requirements change and
  this has not been checked against a current TfNSW notice. Adding a field is a
  small change.
