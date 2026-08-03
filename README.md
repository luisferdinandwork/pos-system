This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Production PostgreSQL setup

The server database commands use the normal PostgreSQL TCP driver (`pg`), not the Neon HTTP driver. A local URL such as `postgresql://pos_app:password@127.0.0.1:5432/pos_db` is therefore supported.

Create the server environment file and replace every example credential:

```bash
cp .env.production.example .env.production
```

CLI environment precedence is: existing process variables, `.env.local`, `.env.production`, then `.env`. On the server, remove an obsolete `.env.local` or make sure it points to the same production database.

For a fresh database, migrate and run the production seeder:

```bash
npm run db:setup:production
```

The production seeder is additive and safe to run again. It creates or updates:

- required stock transaction types;
- Cash, Debit Card, Credit Card, and QRIS defaults;
- the production administrator configured through `PRODUCTION_ADMIN_*`.

It does not create demo events or transactions and does not delete custom payment methods. Re-running it updates the configured administrator password.

You can also supply admin credentials directly, although environment variables are safer than shell history:

```bash
npm run db:seed:production -- admin 'a-password-with-12-or-more-characters'
```

### Reset and rebuild

`db:reset` permanently removes all application data and Drizzle migration history from the selected database. It keeps the repository migration files:

```bash
npm run db:reset
npm run db:setup:production
```

For convenience, the same sequence is available as:

```bash
npm run db:rebuild:production
```

Reset accepts `127.0.0.1`, `localhost`, or `::1` by default. To prevent an accidental production incident, a non-local database URL is refused unless `ALLOW_REMOTE_DB_RESET=true` is explicitly set.
