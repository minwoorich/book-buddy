<script setup lang="ts">
/**
 * AI 검색 로딩 장면(QA #79): 서가 세 줄 사이로 난 길을 따라 책벗(붉은 점)이 걸어가며 책을 찾는다.
 * 순수 SVG — 길은 stroke-dash로 실제 선처럼 보이고, 점은 <animateMotion mpath>로 그 길을 정확히 따라간다.
 * 지나가는 서가의 책등이 잠깐 밝아져 "찾는 중" 느낌을 준다. 외부 라이브러리 없이 한 파일로 끝난다.
 */
defineProps<{ label?: string; activity?: string }>()

/** 서가 한 줄의 책등 — 결정적 폭·색으로 12권 정도를 채운다. */
const SPINE_COLORS = ['#33465C', '#8A6D3B', '#7A3B47', '#4A4E58', '#37655E', '#5C4A66', '#A0522D', '#556B2F']
function spines(row: number): { x: number; w: number; h: number; color: string }[] {
  const out: { x: number; w: number; h: number; color: string }[] = []
  let x = 0
  let i = 0
  while (x < 330) {
    const w = 9 + ((row * 7 + i * 5) % 8)
    const h = 30 + ((row * 3 + i * 11) % 9)
    out.push({ x, w, h, color: SPINE_COLORS[(row + i * 3) % SPINE_COLORS.length] })
    x += w + 2
    i++
  }
  return out
}
const SHELVES = [0, 1, 2].map((row) => ({ row, y: 22 + row * 52, items: spines(row) }))
</script>

<template>
  <div class="loader" role="status" aria-live="polite">
    <svg class="scene" viewBox="0 0 420 180" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <!-- 서가 3줄: 책등 → 선반 -->
      <g v-for="shelf in SHELVES" :key="shelf.row" :transform="`translate(45, ${shelf.y})`">
        <rect
          v-for="(s, i) in shelf.items"
          :key="i"
          class="spine"
          :x="s.x" :y="38 - s.h" :width="s.w" :height="s.h" rx="1.2"
          :fill="s.color"
          :style="{ animationDelay: `${(i * 0.13 + shelf.row * 0.9) % 3}s` }"
        />
        <rect x="-6" y="38" width="342" height="5" rx="1" fill="url(#wood)" />
      </g>

      <!-- 통로: 서가 사이를 지그재그로 지나는 길 -->
      <path id="aisle" class="aisle" d="M14,46 H330 C360,46 360,98 330,98 H60 C30,98 30,150 60,150 H406" />

      <!-- 책벗: 붉은 점 + 펄스 링이 길을 따라 걷는다 -->
      <g class="walker">
        <circle class="pulse" r="9" />
        <circle class="dot" r="4.5" />
        <animateMotion dur="4.2s" repeatCount="indefinite" rotate="auto" calcMode="spline" keySplines="0.4 0 0.6 1" keyTimes="0;1">
          <mpath href="#aisle" />
        </animateMotion>
      </g>

      <defs>
        <linearGradient id="wood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#C9A87E" />
          <stop offset="1" stop-color="#9F7B52" />
        </linearGradient>
      </defs>
    </svg>
    <div class="text">
      <span class="label">{{ label ?? '책벗이 서가를 걷는 중...' }}</span>
      <span v-if="activity" class="activity">{{ activity }}</span>
    </div>
  </div>
</template>

<style scoped>
.loader { display: flex; align-items: center; gap: 22px; padding: 4px 0; }
.scene { width: 300px; height: 128px; flex-shrink: 0; }
.aisle {
  fill: none; stroke: var(--red); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;
  stroke-dasharray: 6 7; opacity: .55;
  animation: aisle-flow 1.2s linear infinite;
}
@keyframes aisle-flow { to { stroke-dashoffset: -13; } }
.walker .dot { fill: var(--red); }
.walker .pulse { fill: rgba(230, 0, 18, .22); animation: walker-pulse 1.6s ease-out infinite; transform-origin: center; }
@keyframes walker-pulse { 0% { transform: scale(.5); opacity: 1; } 100% { transform: scale(1.5); opacity: 0; } }
.spine { animation: spine-glance 3s ease-in-out infinite; }
@keyframes spine-glance { 0%, 82%, 100% { opacity: 1; } 90% { opacity: .55; } }

.text { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.label { font-size: 15px; font-weight: 700; color: var(--ink); }
.activity { font-size: 12.5px; color: var(--sub); }

@media (max-width: 640px) {
  .loader { flex-direction: column; align-items: flex-start; gap: 10px; }
  .scene { width: 100%; max-width: 300px; height: auto; }
}
</style>
