import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// `#shared/*`는 Nuxt가 제공하는 별칭이라 vitest는 모른다. app/utils처럼 서버·앱 공용 모듈을
// 값으로 import하는 코드를 테스트하려면 같은 별칭을 여기서도 잡아줘야 한다.
export default defineConfig({
  resolve: {
    alias: {
      '#shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  test: { include: ['tests/**/*.test.ts'] },
})
