# ARK-QUIZES Frontend

This repository contains the standalone React and Vite frontend for ARK-QUIZES.

## Local development

```bash
npm ci
npm run dev
```

Set `VITE_API_URL` to the backend origin, without `/api`, in `.env.local` for local development. The frontend appends `/api` for HTTP requests and uses the same origin for Socket.IO.

## Vercel deployment

Import this repository into Vercel with the repository root as the project root. The included `vercel.json` configures `npm run build` and the `dist` output directory. Set `VITE_API_URL` in the Vercel project's Production, Preview, and Development environment variables to the backend origin, for example `https://ark-quizes.onrender.com`.

The backend must allow the deployed Vercel origin in its `CLIENT_URL` CORS configuration. The app uses hash-based routes, so no SPA rewrite is needed.