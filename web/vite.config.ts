import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

import react from '@vitejs/plugin-react';

const webRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(webRoot, '..');



function tonConnectManifestPlugin(): Plugin {

  return {

    name: 'tonconnect-manifest',

    configureServer(server) {

      server.middlewares.use((req, res, next) => {

        const path = req.url?.split('?')[0] ?? '';

        if (path !== '/tonconnect-manifest.json') {

          return next();

        }

        const host = req.headers.host ?? 'localhost:5173';

        const origin = `http://${host}`;

        res.setHeader('Content-Type', 'application/json');

        res.setHeader('Access-Control-Allow-Origin', '*');

        res.end(

          JSON.stringify({

            url: origin,

            name: 'TestDex',

            iconUrl: `${origin}/icon-180.png`,

            termsOfUseUrl: origin,

            privacyPolicyUrl: origin,

          }),

        );

      });

    },

  };

}



const base = process.env.VITE_BASE_PATH ?? '/';

export default defineConfig({

  base,

  plugins: [react(), tonConnectManifestPlugin()],

  resolve: {

    alias: {

      buffer: 'buffer/',
      '@ton/core': path.resolve(repoRoot, 'node_modules/@ton/core'),
      '@ton/crypto': path.resolve(repoRoot, 'node_modules/@ton/crypto'),
      '@ton/ton': path.resolve(repoRoot, 'node_modules/@ton/ton'),

    },

  },

  optimizeDeps: {

    include: ['buffer', '@ton/crypto'],

  },

  build: {

    commonjsOptions: {

      transformMixedEsModules: true,

    },

  },

  server: {

    port: 5173,

    host: true,

  },

});


