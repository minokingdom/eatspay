# Eats Pay Web Deployment

This project is ready to run as a real web service on a VPS.

## Target layout

- Public site: `https://www.eatspay.co.kr`
- Backend/API: same Node process on the VPS
- Database: PostgreSQL on the VPS or a managed PostgreSQL service
- Reverse proxy: Nginx
- TLS: Let's Encrypt

## Files you need on the server

- `server.js`
- `index.html`
- `admin` HTML file
- `css/`
- `js/`
- `uploads/`
- `.env`

## Server environment

Use `deploy/production.env.example` as the base.

Required values:

```text
DATABASE_URL
JWT_SECRET
EATSPAY_HMAC_SECRET
ADMIN_ROLLBACK_TOKEN
PORT
CORS_ORIGIN
GH_PAYMENTS_BASE_URL
GH_PAYMENTS_PAY_KEY
```

## Nginx

Use `deploy/nginx/eatspay.conf` as the reverse proxy template.

The config routes both:

- `www.eatspay.co.kr`
- `eatspay.co.kr`

to the Node server on `127.0.0.1:3000`.

## systemd

Use `deploy/systemd/eatspay.service` to run the app on boot.

## Bootstrap order

1. Provision Ubuntu VPS.
2. Install Node.js, Nginx, PostgreSQL, and Certbot.
3. Create the `eatspay` database and user.
4. Copy this repo to `/opt/eatspay`.
5. Create `/opt/eatspay/.env`.
6. Run `npm install`.
7. Run `npm run db:init`.
8. Run `npm run db:create-admin`.
9. Enable the systemd service.
10. Point DNS `A` records for `www.eatspay.co.kr` and `eatspay.co.kr` to the VPS public IP.
11. Issue the SSL certificate with Certbot.

## Frontend API base

`js/config.js` now defaults to:

```js
https://www.eatspay.co.kr
```

That lets the same build work on the web and inside the Android app without a tunnel URL.

## Billing integration

When `GH_PAYMENTS_PAY_KEY` is present, the server proxies:

- `POST /api/card/register` -> `POST /api/billing/reg`
- `POST /api/payment/charge` -> `POST /api/billing/pay` when the card id starts with `rb_`
- admin-only proxy endpoints under `/api/ghpayments/*`

If the key is missing, the app keeps its existing local fallback behavior for development.
