<script setup lang="ts">
import type { RankRow } from '#shared/types'

const props = defineProps<{ top3: RankRow[] }>()

const first = computed(() => props.top3[0])
const second = computed(() => props.top3[1])
const third = computed(() => props.top3[2])

function initial(row: RankRow): string {
  return row.label.charAt(0)
}
</script>

<template>
  <div class="podium">
    <div v-if="second" class="pod second">
      <span class="avatar">{{ initial(second) }}</span>
      <div class="nm">{{ second.label }}</div>
      <div v-if="second.sub" class="org">{{ second.sub }}</div>
      <div class="cnt">{{ second.count }}권</div>
      <div class="base">2</div>
    </div>
    <div v-if="first" class="pod first">
      <svg class="crown" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#C9A227" stroke-width="2" stroke-linejoin="round"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-1.6 10H4.6L3 8z"></path></svg>
      <span class="avatar">{{ initial(first) }}</span>
      <div class="nm">{{ first.label }}</div>
      <div v-if="first.sub" class="org">{{ first.sub }}</div>
      <div class="cnt">{{ first.count }}권</div>
      <div class="base">1</div>
    </div>
    <div v-if="third" class="pod third">
      <span class="avatar">{{ initial(third) }}</span>
      <div class="nm">{{ third.label }}</div>
      <div v-if="third.sub" class="org">{{ third.sub }}</div>
      <div class="cnt">{{ third.count }}권</div>
      <div class="base">3</div>
    </div>
  </div>
</template>

<style scoped>
.podium { display: flex; justify-content: center; align-items: flex-end; gap: 22px; margin: 38px 0 40px; }
.pod { text-align: center; width: 180px; }
.pod .avatar { margin: 0 auto 10px; }
.pod .nm { font-weight: 700; font-size: 15px; }
.pod .org { font-size: 12px; color: var(--sub); margin-bottom: 10px; }
.pod .cnt { font-family: "Noto Serif KR", serif; font-size: 18px; margin-bottom: 10px; }
.pod .base { background: var(--card); border: 1px solid var(--line); border-radius: 4px 4px 0 0; display: flex; align-items: center; justify-content: center; font-family: "Noto Serif KR", serif; font-size: 26px; color: var(--sub); box-shadow: 0 2px 10px rgba(84,70,45,.06); }
.pod.first .base { height: 110px; border-top: 3px solid var(--red); color: var(--red); font-weight: 700; }
.pod.second .base { height: 78px; }
.pod.third .base { height: 58px; }
.pod.first .avatar { width: 62px; height: 62px; font-size: 24px; background: var(--red); color: #fff; }
.pod.second .avatar { width: 52px; height: 52px; font-size: 20px; }
.pod.third .avatar { width: 48px; height: 48px; font-size: 18px; }
.crown { display: block; margin: 0 auto 6px; }
</style>
