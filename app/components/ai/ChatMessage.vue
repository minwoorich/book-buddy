<script setup lang="ts">
import type { ChatAction } from '#shared/types'
import type { ChatMsg } from '~/composables/useChat'

defineProps<{ msg: ChatMsg }>()

const { open } = useChat()

function closePanel() {
  open.value = false
}

async function runAction(action: ChatAction) {
  closePanel()
  await navigateTo(action.to)
}
</script>

<template>
  <div v-if="msg.role === 'user'" class="msg-user">{{ msg.content }}</div>

  <div v-else class="msg-ai">
    <span class="tag">책벗</span>
    {{ msg.content }}

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

    <div v-if="msg.actions?.length" class="chat-acts">
      <button
        v-for="(action, i) in msg.actions"
        :key="i"
        type="button"
        class="chat-act"
        @click="runAction(action)"
      >{{ action.label }}</button>
    </div>
  </div>
</template>

<style scoped>
.msg-user { align-self: flex-end; max-width: 82%; background: var(--ink); color: #F6F1E7; border-radius: 14px 14px 3px 14px; padding: 9px 14px; font-size: 14px; line-height: 1.55; }
.msg-ai { align-self: stretch; background: var(--card-2); border: 1px solid var(--line); border-radius: 14px 14px 14px 3px; padding: 12px 14px; font-size: 14px; line-height: 1.65; color: #3E382D; }
.msg-ai .tag { font-size: 10.5px; letter-spacing: 2px; color: var(--red); font-weight: 700; display: block; margin-bottom: 6px; }
.mini-books { display: flex; flex-direction: column; gap: 8px; margin: 10px 0; }
.mini-book { display: flex; gap: 10px; align-items: center; background: var(--card); border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px; cursor: pointer; color: inherit; }
.mini-book:hover { border-color: #C9BCA2; }
.mini-book :deep(.cv) { width: 34px; height: 48px; flex-shrink: 0; }
.mini-book .t { font-size: 13px; font-weight: 700; }
.mini-book .a { font-size: 11.5px; color: var(--sub); }
.chat-acts { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 10px; }
.chat-act { font: inherit; font-size: 12.5px; font-weight: 600; color: var(--red); background: transparent; border: 1px solid var(--red); border-radius: 999px; padding: 6px 13px; cursor: pointer; }
.chat-act:hover { background: var(--red-tint); }
</style>
