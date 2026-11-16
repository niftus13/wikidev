export default defineNuxtConfig({
  compatibilityDate: '2026-01-01',
  devServer: { host: '0.0.0.0' },
  nitro: {
    devProxy: {
      '/api': {
        target: `${process.env.API_PROXY_TARGET || 'http://localhost:4000'}/api`,
        changeOrigin: true,
      },
    },
  },
});
