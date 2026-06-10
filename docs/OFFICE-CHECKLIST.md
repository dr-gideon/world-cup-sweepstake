# Office Sweepstake Checklist

Use this checklist for the real office run.

## 1. Before registration opens

- Confirm hosting location and URL.
- Set production environment variables:
  - `PORT`
  - `SWEEPSTAKE_DB`
  - `ADMIN_USER`
  - `ADMIN_PASSWORD`
  - `COOKIE_SECURE` if HTTPS is used
- Build and start the app.
- Open these surfaces:
  - Public: `/`
  - Tele: `/tele`
  - Admin: `/admin`
- Log into Admin.
- Prepare employee CSV with columns:

```csv
email,name,department
alice@company.com,Alice Murphy,Sales
bob@company.com,Bob Lee,Support
```

- Upload employee CSV in Admin.
- Check Admin counts:
  - eligible
  - joined
  - not joined
- Download full backup from Admin.

## 2. During registration

- Share the public URL only.
- Employees enter with work email and name.
- Use Admin exports as needed:
  - Not joined CSV for reminders
  - Participants CSV for review
- Keep Admin URL/password private.
- Do not run the draw until registration is closed.

## 3. Before running the draw

- Confirm participant count.
- Download full backup.
- If more than 48 employees need to participate, stop and agree shared-team rules first.
- Put `/tele` or public `/` on the office screen if desired.
- In Admin, run the draw.
- Reveal teams one by one or reveal all.
- Download full backup immediately after the draw.

## 4. During the tournament

- Add fixtures/results manually in Admin.
- Update team statuses after matches:
  - Alive / round stage
  - Runner-up
  - Champion
  - Out
- Keep `/tele` on the office screen for match-impact updates.
- Download backup after major status changes.

## 5. After the final

- Set champion team status to `Champion`.
- Set runner-up team status to `Runner-up`.
- Check public/team state and Tele prize race.
- Export final backup.
- Export participants CSV if needed for prize records.
- Pay:
  - €50 to champion team owner
  - €30 to runner-up team owner

## 6. Recovery notes

- Admin JSON backup is the safest live export.
- SQLite database path is `SWEEPSTAKE_DB`.
- If copying SQLite directly while service is running, copy the `.sqlite`, `-wal`, and `-shm` files together.
- Do not edit SQLite manually during the draw unless absolutely necessary.
