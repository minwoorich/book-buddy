// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-09-13',
  // 인증이 클라이언트 전용 localStorage 기반이라 SSR은 항상 익명으로 렌더돼 빈 데이터가 페이로드에 동결된다 — SPA 모드로 고정.
  ssr: false,
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
    anthropicApiKey: '',
    naverSearchClientId: '', naverSearchClientSecret: '',
    public: { naverMapClientId: '' },
  },
})
