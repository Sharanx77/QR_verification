# College Inauguration QR Attendance

Production-oriented React, Express, TypeScript, and Supabase application for college inauguration attendance.

## Supabase setup

1. Create a Supabase project.
2. Run `supabase/migrations/001_initial.sql` in the Supabase SQL editor.
3. Create a 32-byte key:
   - PowerShell: `[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])`
4. Copy `.env.example` to `.env`.
5. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, `QR_ENCRYPTION_KEY`, and `CLIENT_ORIGIN`.
   - Never place service-role credentials or the encryption key in the frontend.

## Install and run

```powershell
npm install
npm run dev
```

Open `http://localhost:5173`. The API runs at `http://localhost:4000`.

## Organizer setup

Set `ADMIN_USERNAME` and `ADMIN_PASSWORD` in `.env`, then run:

```powershell
npm run create-organizer -w server
```

Run the command again with the same username to reset that administrator's password.

Create additional accounts in Organizer Management as an administrator. All passwords are bcrypt-hashed.

## Import template

Use `sample_participant_template.csv` or create an XLS/XLSX file with one column headed `USN`. Import through Organizer Dashboard > Upload Participants.

## Deployment

- Use HTTPS and set `COOKIE_SECURE=true`.
- Keep `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, and `QR_ENCRYPTION_KEY` in deployment secrets.
- Never expose them through Vite variables or frontend code.
- Route `/api` to Express and serve the `client/dist` build as the frontend.
- The migration grants direct browser access no RLS permissions.

### Single-service Render deployment

The Express service also serves the built React app, so the frontend and API can share one Render URL.

1. Push the repository to a private GitHub repository; never commit `.env`.
2. Create a Render Web Service from the repository root using `render.yaml`. Set its requested secret environment values in Render.
3. Set `CLIENT_ORIGIN` to the exact Render service URL after it is created, and keep `COOKIE_SECURE=true`.
4. Verify `/api/health`, organizer login, participant QR retrieval, and scans on the deployed URL before the event.

Render Free instances sleep after inactivity and can take around a minute to wake. This may be unsuitable for time-critical event operation.
