// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-09-13',
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      title: 'Book Buddy',
      link: [
        { rel: 'stylesheet', href: 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@500;600;700&display=swap' },
      ],
    },
  },
  runtimeConfig: {
    anthropicApiKey: '', aladinTtbKey: '',
    naverSearchClientId: '', naverSearchClientSecret: '',
    public: { naverMapClientId: '' },
  },
})
