import { defineConfig, type Plugin } from 'vite';

// Dev-only API bridge: serves /api/<route> by running the same handler modules
// the Vercel serverless functions use, so `npm run dev` has live data with no
// backend to start. In production these routes are the functions in /api.
function devApi(): Plugin {
  return {
    name: 'varde-dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/')) return next();
        const u = new URL(req.url, 'http://localhost');
        const route = u.pathname.replace(/^\/api\//, '').replace(/\/+$/, '');
        try {
          const mod: any = await server.ssrLoadModule('/src/server/routes/' + route + '.ts');
          const data = await mod.handler(u.searchParams);
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(data));
        } catch (err: any) {
          // eslint-disable-next-line no-console
          console.error(`[dev-api] /api/${route} failed:`, err);
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: String(err?.message || err) }));
        }
      });
    },
  };
}

export default defineConfig({
  // '/' for Vercel/custom domains; '/varde/' for GitHub Pages project sites
  // (set BASE_PATH in the Pages workflow).
  base: process.env.BASE_PATH || '/',
  plugins: [devApi()],
  build: { target: 'es2022', sourcemap: true },
});
