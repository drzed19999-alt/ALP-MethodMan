# ALP — cPanel Deployment Guide

## Requirements

| Requirement | Version |
|-------------|---------|
| Node.js | 18+ (20 recommended) |
| npm | 9+ |
| cPanel | with Node.js App feature enabled |

---

## Step 1 — Upload Files

Upload the entire project folder to your server (excluding `node_modules/` and `.env`).
Use cPanel File Manager (ZIP + Extract) or FTP/SFTP.

Recommended path: `/home/yourusername/alp/`

---

## Step 2 — Create the Node.js App in cPanel

1. Open **cPanel > Software > Node.js App**
2. Click **Create Application**
3. Fill in:
   - **Node.js version**: `20.x` (or latest LTS)
   - **Application mode**: `Production`
   - **Application root**: `/home/yourusername/alp`
   - **Application URL**: your subdomain or domain
   - **Application startup file**: `server.js`
4. Click **Create**

---

## Step 3 — Set Environment Variables

| Key | Value |
|-----|-------|
| `PORT` | `3000` (or cPanel's assigned port) |
| `HOST` | `0.0.0.0` |
| `JWT_SECRET` | Long random string (64+ chars) |
| `DB_PATH` | `/home/yourusername/alp/database/alp.db` |
| `CORS_ORIGIN` | `https://yourdomain.com` |

> IMPORTANT: Never use the default JWT_SECRET in production.

---

## Step 4 — Install Dependencies

In the cPanel Node.js App panel, click **Run NPM Install**, or via SSH:

`npm install --omit=dev`

---

## Step 5 — Start the App

Click **Start** or **Restart** in the cPanel Node.js App panel.

Admin panel: `https://yourdomain.com/admin`
Default login: `admin` / `admin123` — **change this immediately.**

---

## Step 6 — Reverse Proxy (if needed)

If the app runs on port 3000 but you want it at your domain root, add to `.htaccess`:

`RewriteEngine On`
`RewriteRule ^(.*)$ http://127.0.0.1:3000/ [P,L]`

---

## Files to EXCLUDE from upload

- `node_modules/`
- `.env`
- `database/*.db`

The database is created automatically on first start.
