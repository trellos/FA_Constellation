import { defineConfig } from 'vite';

export default defineConfig({
  base: '/FA_Constellation/',
  server: {
    host: true,
    port: 5173,
  },
  // Phaser scene classes are instantiated at boot; HMR replaces the module
  // exports but leaves the running instance bound to the OLD prototype, so
  // method-level edits silently don't take effect. Override the default HMR
  // behavior to send a full page reload on every change — slightly slower
  // per save, but the browser is guaranteed to match the source.
  plugins: [
    {
      name: 'full-reload-always',
      handleHotUpdate({ server }) {
        server.ws.send({ type: 'full-reload' });
        return [];
      },
    },
  ],
  build: {
    target: 'es2020',
    // Sourcemaps double the ship size; opt-in via env so production builds
    // stay lean but devs can still debug a built bundle locally if needed.
    sourcemap: process.env.VITE_SOURCEMAP === '1',
  },
});
