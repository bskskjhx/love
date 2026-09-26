import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

/** `npm run dev:mobile` passes this via `vite --mode mobile-fixture`. */
const FIXTURE_MODE = 'mobile-fixture';

/**
 * Serves the synthetic archive used by `npm run dev:mobile`.
 *
 * The fixture module is imported dynamically and only in `mobile-fixture` serve
 * mode, so the demo data can never reach a production build or a plain
 * `npm run dev` session.
 */
async function mobileFixturePlugin(): Promise<Plugin> {
  const { createMobileFixture } = await import('./dev/mobile-fixtures.mjs');

  return {
    name: 'mobile-fixture-data',
    apply: 'serve',
    configureServer(server) {
      const fixture = createMobileFixture();

      server.middlewares.use((req, res, next) => {
        const pathname = (req.url || '').split('?')[0];
        const result = fixture.respond(pathname);

        // Anything that is not ours (the app shell, HMR, static assets) falls through.
        if (!result) {
          next();
          return;
        }

        res.statusCode = result.status;
        res.setHeader('Content-Type', result.contentType);
        res.setHeader('Cache-Control', 'no-store');
        res.end(result.body);
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(async ({ command, mode }) => {
  const useFixture = command === 'serve' && mode === FIXTURE_MODE;

  return {
    base: './',
    plugins: [react(), ...(useFixture ? [await mobileFixturePlugin()] : [])],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
  };
});
