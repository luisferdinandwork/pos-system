# POS production deployment

The production Next.js process listens only on `127.0.0.1:3100`. Nginx exposes
`pos.panatradeprestasi.net` and proxies requests to that private port. Port 3000
remains free for development.

The commands below assume an Ubuntu or Debian server and a normal, non-root
deployment user.

## Server prerequisites

```bash
sudo apt update
sudo apt install -y nginx curl build-essential
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash
source ~/.bashrc
nvm install 22
nvm alias default 22
npm install -g pm2@latest
node --version
pm2 --version
```

Create a DNS A/AAAA record for `pos.panatradeprestasi.net` pointing to the SSL
proxy or server that receives requests for this application.

## Application setup

Run these commands from the application directory on the POS server:

```bash
npm ci
cp .env.production.example .env.production
nano .env.production
npm run db:migrate
npm run db:seed:production
npm run build
pm2 start ecosystem.config.cjs
pm2 save
```

Do not leave an old `.env.local` on the production server: Next.js loads it
before `.env.production`, so it can silently override the production database
and authentication settings.

Generate `NEXTAUTH_SECRET` with:

```bash
openssl rand -base64 32
```

Set `NEXTAUTH_URL=https://pos.panatradeprestasi.net`. Do not expose
`DATABASE_URL` as a `NEXT_PUBLIC_*` variable.

After `pm2 start`, run the command printed by the following command to enable
startup after a reboot, then save the process list again:

```bash
pm2 startup
pm2 save
```

## Nginx setup

Install the repository site configuration and enable it:

```bash
sudo cp deploy/nginx/pos.panatradeprestasi.net.conf /etc/nginx/sites-available/pos.panatradeprestasi.net
sudo ln -s /etc/nginx/sites-available/pos.panatradeprestasi.net /etc/nginx/sites-enabled/pos.panatradeprestasi.net
sudo nginx -t
sudo systemctl reload nginx
```

The supplied Nginx file has no certificate paths and listens on port 80. It is
intended for an existing SSL proxy/load balancer that forwards requests to this
server and supplies `X-Forwarded-Proto: https`.

If this Nginx server receives internet traffic directly, HTTPS cannot work
without a certificate. Certbot can create the certificate and update the Nginx
configuration automatically:

```bash
sudo certbot --nginx -d pos.panatradeprestasi.net
```

## Health checks and updates

```bash
curl --fail --head http://127.0.0.1:3100/login
curl --fail --head -H 'Host: pos.panatradeprestasi.net' http://127.0.0.1/login
pm2 status
pm2 logs pos-system --lines 100
```

For subsequent deployments:

```bash
git pull --ff-only
npm ci
npm run db:migrate
npm run build
pm2 reload ecosystem.config.cjs --only pos-system --update-env
pm2 save
```
