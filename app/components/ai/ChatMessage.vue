<script setup lang="ts">
import type { ChatAction } from '#shared/types'
import type { ChatMsg } from '~/composables/useChat'

const props = defineProps<{ msg: ChatMsg }>()

const { open, sending, send } = useChat()

// 장소 추천의 근거 후기 — 기본은 접어 두고 버튼으로 펼친다. 본문이 "동료 3명이 조용하다고
// 했어요"라고만 하고 끝나지 않도록, 그 3명이 누구였는지까지 바로 확인할 수 있게.
const showPlaces = ref(false)
const places = computed(() => props.msg.places ?? [])

/** 태그 라벨 → 인원 수를 칩으로 그릴 배열로. digest가 이미 많은 순으로 정렬해 보낸다. */
function tagChips(tags: Record<string, number>) {
  return Object.entries(tags).map(([label, count]) => ({ label, count }))
}

/** "김민우(개발팀): 창가 자리가 넓어요" → 인용문과 남긴 사람으로 나눈다. */
function splitComment(raw: string): { quote: string; who: string } {
  const m = raw.match(/^(.+?)\((.+?)\):\s*(.*)$/)
  return m ? { quote: m[3], who: `${m[1]} · ${m[2]}` } : { quote: raw, who: '' }
}

function closePanel() {
  open.value = false
}

async function runAction(action: ChatAction) {
  if (action.type === 'reply') {
    // 빠른 답장(실행 확인 네/아니오 등) — 패널을 닫지 않고 그 텍스트를 그대로 전송한다.
    if (!sending.value) await send(action.send)
    return
  }
  closePanel()
  await navigateTo(action.to)
}
</script>

<template>
  <div v-if="msg.role === 'user'" class="msg-user">{{ msg.content }}</div>

  <div v-else class="msg-ai">
    <span class="tag">책벗</span>
    <span class="msg-text">{{ msg.content }}</span>

    <div v-if="msg.books?.length" class="mini-books">
      <NuxtLink
        v-for="book in msg.books"
        :key="book.id"
        :to="`/books/${book.id}`"
        class="mini-book"
        @click="closePanel"
      >
        <BookCoverImage :src="book.coverUrl" :alt="book.title" />
        <span>
          <span class="t">{{ book.title }}</span><br>
          <span class="a">{{ book.author }}</span>
        </span>
      </NuxtLink>
    </div>

    <div v-if="msg.actions?.length || places.length" class="chat-acts">
      <button
        v-if="places.length"
        type="button"
        class="chat-act evidence"
        :class="{ on: showPlaces }"
        :aria-expanded="showPlaces"
        @click="showPlaces = !showPlaces"
      >{{ showPlaces ? '근거 접기' : `후기 근거 보기 · ${places.length}곳` }}</button>
      <button
        v-for="(action, i) in msg.actions ?? []"
        :key="i"
        type="button"
        class="chat-act"
        :disabled="action.type === 'reply' && sending"
        @click="runAction(action)"
      >{{ action.label }}</button>
    </div>

    <div v-if="showPlaces" class="evidence-panel">
      <p class="ev-lead">동료들이 남긴 후기예요</p>
      <div v-for="p in places" :key="p.name" class="ev-place">
        <div class="ev-head">
          <b>{{ p.name }}</b>
          <span class="ev-total">후기 {{ p.total }}</span>
        </div>
        <div v-if="tagChips(p.tags).length" class="ev-tags">
          <span v-for="t in tagChips(p.tags)" :key="t.label" class="tally">{{ t.label }} <b>{{ t.count }}</b></span>
        </div>
        <ul v-if="p.comments.length" class="ev-comments">
          <li v-for="(c, i) in p.comments" :key="i">
            <span class="q">"{{ splitComment(c).quote }}"</span>
            <span v-if="splitComment(c).who" class="who">— {{ splitComment(c).who }}</span>
          </li>
        </ul>
        <a class="ev-map" :href="p.mapUrl" target="_blank" rel="noopener">지도에서 보기 ↗</a>
      </div>
    </div>
  </div>
</template>

<style scoped>
.msg-user { align-self: flex-end; max-width: 82%; background: var(--ink); color: var(--bg); border-radius: 14px 14px 3px 14px; padding: 9px 14px; font-size: 14px; line-height: 1.55; }
.msg-ai { align-self: stretch; background: var(--card-2); border: 1px solid var(--line); border-radius: 14px 14px 14px 3px; padding: 12px 14px; font-size: 14px; line-height: 1.65; color: var(--text-2); }
.msg-ai .tag { font-size: 10.5px; letter-spacing: 2px; color: var(--red); font-weight: 700; display: block; margin-bottom: 6px; }
.mini-books { display: flex; flex-direction: column; gap: 8px; margin: 10px 0; }
.mini-book { display: flex; gap: 10px; align-items: center; background: var(--card); border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px; cursor: pointer; color: inherit; }
.mini-book:hover { border-color: var(--line-hover); }
.mini-book :deep(.cv) { width: 34px; height: 48px; flex-shrink: 0; }
.mini-book .t { font-size: 13px; font-weight: 700; }
.mini-book .a { font-size: 11.5px; color: var(--sub); }
.chat-acts { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 10px; }
.chat-act { font: inherit; font-size: 12.5px; font-weight: 600; color: var(--red); background: transparent; border: 1px solid var(--red); border-radius: 999px; padding: 6px 13px; cursor: pointer; }
.chat-act:hover { background: var(--red-tint); }
.chat-act:disabled { opacity: .5; cursor: not-allowed; }
/* 근거 버튼은 같은 알약 모양이되, 펼쳐진 동안만 채워서 열려 있음을 알린다. */
.chat-act.evidence.on { background: var(--red); border-color: var(--red); color: #fff; }

/* 근거 패널: /places의 후기 패널과 같은 언어(집계 칩·인용)로 보이게 맞췄다. */
.evidence-panel { margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--line); display: flex; flex-direction: column; gap: 12px; }
.ev-lead { margin: 0; font-size: 11.5px; font-weight: 700; letter-spacing: 1px; color: var(--red); }
.ev-place { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; display: flex; flex-direction: column; gap: 7px; }
.ev-head { display: flex; align-items: baseline; gap: 8px; }
.ev-head b { font-size: 13px; color: var(--ink); }
.ev-total { font-size: 11.5px; color: var(--sub); margin-left: auto; flex-shrink: 0; }
.ev-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.ev-tags .tally { font-size: 12px; color: var(--ink); background: var(--hover); border-radius: 999px; padding: 3px 9px; }
.ev-tags .tally b { color: var(--red); font-weight: 700; margin-left: 2px; }
.ev-comments { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; line-height: 1.5; }
.ev-comments .q { color: var(--ink); }
.ev-comments .who { color: var(--sub); margin-left: 6px; }
.ev-map { font-size: 12px; font-weight: 600; color: var(--red); text-decoration: none; align-self: flex-start; }
.ev-map:hover { text-decoration: underline; }
.msg-text { white-space: pre-line; display: block; }
</style>
