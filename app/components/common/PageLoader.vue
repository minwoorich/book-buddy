<script setup lang="ts">
/**
 * 페이지 이동 로더 — 라우트가 바뀔 때 화면 중앙에 뜨는 미니멀 스피너.
 *
 * 왜: SPA라 페이지 이동 = 청크 다운로드 + setup의 `await useAsyncData` 대기. 서버가 느리면 클릭 후
 * 1~2초 동안 아무 반응이 없어 "안 눌린 줄 알고" 다시 누르게 된다. 그 공백을 메운다.
 *
 * 어떻게: Nuxt 내장 `useLoadingIndicator`가 `page:loading:start`→`page:loading:end`(Suspense pending →
 * resolve) 훅에 이미 묶여 있어 청크·데이터 대기를 모두 덮는다. 150ms 스로틀이라 빠른 이동에서는
 * 아예 뜨지 않아 깜빡임이 없다.
 *
 * 모양: 선반 위 책 세 권이 차례로 살짝 떠오른다. 레드는 가운데 한 권에만(브랜드 규칙 — 포인트로만).
 * 시안: design/mockups/page-loader.html
 */
const { isLoading } = useLoadingIndicator({ throttle: 150 })
</script>

<template>
  <Transition name="pl">
    <div v-if="isLoading" class="pl" role="status" aria-live="polite" aria-label="페이지 이동 중">
      <div class="pl-box">
        <div class="spines" aria-hidden="true">
          <i /><i /><i />
        </div>
        <div class="shelf" aria-hidden="true" />
        <span class="pl-label">서가로 이동 중</span>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* 오버레이: 바탕 토큰을 반투명으로 깔아 라이트·다크 모두 자연스럽다. 클릭은 막는다(중복 이동 방지). */
.pl {
  position: fixed; inset: 0; z-index: 200;
  display: grid; place-items: center;
  background: color-mix(in srgb, var(--bg) 72%, transparent);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
}
.pl-box { display: flex; flex-direction: column; align-items: center; }

/* 책등 3권 */
.spines { display: flex; align-items: flex-end; justify-content: center; gap: 5px; height: 36px; padding-bottom: 4px; }
.spines i {
  display: block; width: 9px; height: 24px; border-radius: 1.5px;
  background: var(--line-strong);
  animation: pl-rise 1.4s cubic-bezier(.45, 0, .2, 1) infinite;
}
.spines i:nth-child(2) { height: 28px; background: var(--red); animation-delay: .18s; }
.spines i:nth-child(3) { height: 22px; animation-delay: .36s; }
@keyframes pl-rise {
  0%, 70%, 100% { transform: translateY(0); }
  25% { transform: translateY(-7px); }
}

/* 선반: 공용 .shelf와 같은 우드 톤, 작게 */
.shelf { width: 56px; height: 3px; border-radius: 1px; background: linear-gradient(180deg, var(--shelf-a), var(--shelf-b)); }

.pl-label { margin-top: 14px; font-size: 12.5px; letter-spacing: 2.5px; color: var(--sub); }

/* 등장·퇴장 페이드 */
.pl-enter-active, .pl-leave-active { transition: opacity .18s ease; }
.pl-enter-from, .pl-leave-to { opacity: 0; }

/* 움직임 줄이기: 튀어오르는 대신 은은하게 깜빡인다 */
@media (prefers-reduced-motion: reduce) {
  .spines i { animation: pl-fade 1.4s ease-in-out infinite; }
  @keyframes pl-fade { 0%, 100% { opacity: 1; } 50% { opacity: .45; } }
}

/* 단순 화면: 블러 없이, 바탕을 더 확실히 덮는다 */
html[data-simple="true"] .pl { backdrop-filter: none; -webkit-backdrop-filter: none; background: color-mix(in srgb, var(--bg) 88%, transparent); }
</style>
