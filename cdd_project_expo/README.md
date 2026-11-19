# LostLInk — Campus Lost & Found Portal

A student-focused portal for reporting lost belongings, posting found items, browsing campus listings, and sending private contact requests.

## Features

- Browse, search, and filter lost/found listings by category and campus location.
- Register for an account; an administrator must approve it before the student can sign in or use protected features.
- Approved students can create, edit, resolve, and delete their own listings.
- Sign in through a separate administrator portal to review, resolve, or remove listings.
- Review pending student registration requests and approve or reject them in the admin dashboard.
- Manage item categories and campus locations, including deactivating categories still in use.
- Review student reports, bulk archive or remove listings, and adjust listing expiry.
- Suspend student accounts, search the administrator activity log, and export privacy-conscious CSV summaries.
- Upload an optional image (JPEG, PNG, or WebP; maximum 5 MB).
- Contact a listing owner through private in-app messages.
- Public listing views never expose a student's email or other contact details.

## Student account approval

Public registration always creates a `STUDENT` with `PENDING` approval status and does not sign the student in. The site displays “Your account is waiting for admin approval.” Pending students cannot log in or use authenticated API features. An administrator can approve or reject requests from the **Pending registrations** section at `/admin`; each decision stores the administrator ID and timestamp. Rejected accounts cannot log in.

On upgrade, existing users without an approval status are migrated to `APPROVED` so their access is preserved. Approval status is independent of role; approving a student never grants administrator access.

## Architecture

- `frontend/` — React, Vite, and TypeScript single-page application.
- `backend/` — Node.js, Express, Prisma, and MongoDB API.
- `backend/prisma/` — MongoDB schema and fictional demo seed data.
- `docker-compose.yml` — MongoDB replica set and the built web application.

## Prerequisites

- Node.js 22 or later and npm.
- Docker Desktop with Compose, or a MongoDB replica set. Prisma's MongoDB connector requires a replica set.

## Local development

1. From the repository root, copy `.env.example` to `.env` (`Copy-Item .env.example .env` in PowerShell). Set `MONGO_INITDB_ROOT_PASSWORD` to a password containing URL-safe characters (or percent-encode reserved characters in `DATABASE_URL`), set `MONGO_REPLICA_KEY` to a random base64 key, and replace `JWT_SECRET` with a random value of at least 32 characters. Generate values with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and `node -e "console.log(require('crypto').randomBytes(756).toString('base64'))"`.
2. Start a local MongoDB replica set reachable at `localhost:27017` and create/configure the user in `.env` for that database. The example `DATABASE_URL` uses these local connection settings. (The Compose replica set advertises its internal `db` hostname and is intended for the full containerized app.)
3. In `backend/`, run:

   ```sh
   npm ci
   npx prisma db push
   npm run migrate:roles
   npm run migrate:approval
   npm run migrate:admin-tools
   npm run seed
   ```

   The seed creates fictional listings with a non-login sample owner; it does not print or store a known demo password.

4. Create an administrator from `backend/` after the database is running. Use a new email address; this command will not promote an existing account. In PowerShell, enter the password without echoing it to the terminal:

   ```powershell
   $env:ADMIN_NAME = 'Campus Administrator'
   $env:ADMIN_EMAIL = 'admin@campus.edu'
   $securePassword = Read-Host 'Admin password (12 or more characters)' -AsSecureString
   $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
   try {
     $env:ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
     npm run create-admin
   } finally {
     Remove-Item Env:ADMIN_PASSWORD -ErrorAction SilentlyContinue
     [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
     Remove-Variable securePassword, passwordPointer -ErrorAction SilentlyContinue
   }
   Remove-Item Env:ADMIN_NAME, Env:ADMIN_EMAIL -ErrorAction SilentlyContinue
   ```

   The command hashes the password with bcrypt and stores an `ADMIN` role. Bootstrap values are read only by this server-side command; do not put them in `.env`, source control, or frontend configuration.

5. In `backend/`, start the API:

   ```sh
   npm run dev
   ```

6. In a second terminal, run:

   ```sh
   cd frontend
   npm ci
   npm run dev
   ```

7. Open <http://localhost:5173>. During development, Vite proxies `/api` and `/uploads` requests to the Express server at port 3000. Administrators sign in at <http://localhost:5173/admin/login>; the protected dashboard is at <http://localhost:5173/admin>.

## Docker Compose

Copy `.env.example` to `.env`, set `MONGO_INITDB_ROOT_PASSWORD`, `MONGO_REPLICA_KEY`, and `JWT_SECRET`, then run:

```sh
docker compose up --build
```

Open <http://localhost:3000>. Compose starts MongoDB as a single-node replica set, initializes it, applies the schema and existing-user backfills (including the catalog and listing-expiry defaults), loads idempotent sample listings, and starts the app. Register a student account from the home page; it will remain pending until an administrator approves it. Create the first administrator from PowerShell at the repository root, using temporary environment variables and a password prompt:

```powershell
$env:ADMIN_NAME = 'Campus Administrator'
$env:ADMIN_EMAIL = 'admin@campus.edu'
$securePassword = Read-Host 'Admin password (12 or more characters)' -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
  $env:ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  docker compose exec -T -e ADMIN_NAME -e ADMIN_EMAIL -e ADMIN_PASSWORD app npm run create-admin
} finally {
  Remove-Item Env:ADMIN_PASSWORD -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
  Remove-Variable securePassword, passwordPointer -ErrorAction SilentlyContinue
}
Remove-Item Env:ADMIN_NAME, Env:ADMIN_EMAIL -ErrorAction SilentlyContinue
```

Sign in at <http://localhost:3000/admin/login>, then approve or reject requests from **Pending registrations** in the dashboard. Stop with `docker compose down`; add `-v` only if you intentionally want to delete the database and uploaded-image volumes.

## Database schema

The Prisma MongoDB schema is in `backend/prisma/schema.prisma`; IDs use MongoDB ObjectIds. MongoDB does not use Prisma SQL migrations. After changing the schema, review the impact and apply it with `npx prisma db push` from `backend/`, then run `npm run migrate:roles`, `npm run migrate:approval`, and `npm run migrate:admin-tools`. These idempotent MongoDB updates assign existing users the `STUDENT` role and `APPROVED` status so existing accounts keep working, initialize default categories and locations, and set expiry dates on older listings. New student registrations explicitly receive `STUDENT` and `PENDING`; admin provisioning creates a separate `ADMIN` account with `APPROVED` status. Approval and rejection decisions record the reviewing admin and timestamp. Load sample data with `npm run seed`; the seed can be safely rerun.

All administrator APIs require a valid signed-in administrator session and recheck the account role and status server-side. The default listing lifetime applies to newly created listings; administrators can adjust existing listing expiry dates from the dashboard. CSV downloads contain listing or approval summaries and omit passwords, email addresses, owner names, and other private contact details.

## Checks

From `frontend/`, run `npm run build`. From `backend/`, run `npm run check` and `npx prisma validate` with `DATABASE_URL` configured.

## Screenshots

Add screenshots of the home page, listing details, and mobile layout here.

## GitHub

The GitHub Actions workflow installs both applications and runs Prisma validation, the server check, and the client production build on pushes and pull requests. No repository is created or pushed by this project.

To publish it yourself:

```sh
git init
git add .
git commit -m "Build LostLInk Campus Lost & Found Portal"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
git push -u origin main
```

Never commit `.env`, uploaded student images, or real credentials.
