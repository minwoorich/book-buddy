<script setup lang="ts">
import type { Book, Post } from '#shared/types'

type PostWithMeta = Post & {
  userName: string
  department: string
  book: Book | null
  likeCount: number
  likedByMe: boolean
  commentCount: number
}

const api = useApi()
const { user } = useCurrentUser()

// 내 게시물만 모아보기(QA #60) — 켜면 서버가 내 글만 최신순으로 돌려준다.
const mineOnly = ref(false)

const { data: posts, refresh } = await useAsyncData<PostWithMeta[]>(
  'feed-posts',
  () =>
    user.value
      ? api<PostWithMeta[]>('/api/posts', { query: mineOnly.value ? { mine: '1' } : {} })
      : Promise.resolve([]),
  { default: () => [], watch: [mineOnly] }
)

const composerOpen = ref(false)

async function handleCreated() {
  composerOpen.value = false
  await refresh()
}
</script>

<template>
  <div>
    <CommonAppHeader active="feed" />
    <div class="wrap">
      <div class="head-row">
        <div class="page-head" style="margin-bottom:0;">
          <span class="eyebrow">READING MOMENTS</span>
          <h1>피드</h1>
          <p>동료들의 독서 순간을 구경하세요</p>
          <button type="button" class="chip mine-chip" :class="{ on: mineOnly }" @click="mineOnly = !mineOnly">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></svg>
            내 게시물만
          </button>
        </div>
        <button type="button" class="btn primary" style="margin-left:auto;" @click="composerOpen = !composerOpen">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" style="vertical-align:-1px; margin-right:5px;"><line x1="12" y1="4" x2="12" y2="20" /><line x1="4" y1="12" x2="20" y2="12" /></svg>
          글쓰기
        </button>
      </div>

      <FeedPostComposer v-if="composerOpen" @created="handleCreated" @cancel="composerOpen = false" />

      <p v-if="!posts?.length" class="hint">
        {{ mineOnly ? '아직 내가 올린 게시물이 없어요. 첫 독서 순간을 남겨보세요.' : '아직 올라온 피드가 없어요. 첫 독서 순간을 남겨보세요.' }}
      </p>
      <div v-else class="feed-grid">
        <FeedPostCard v-for="post in posts" :key="post.id" :post="post" @changed="refresh" />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 헤더와 게시물 사이를 넉넉히(QA #69). '내 게시물만'은 제목 아래 왼쪽(QA #68). */
.head-row { display: flex; align-items: flex-end; gap: 10px; margin-bottom: 40px; }
.mine-chip { display: inline-flex; align-items: center; gap: 5px; font-weight: 600; margin-top: 12px; }
/* 인스타처럼 게시물을 1열로 하나씩 보여준다(QA #6). */
.feed-grid { display: flex; flex-direction: column; gap: 30px; max-width: 540px; margin: 0 auto; }

.hint { color: var(--sub); font-size: 14px; padding: 14px 0; }

@media (max-width: 600px) {
  .head-row { flex-wrap: wrap; align-items: flex-start; gap: 12px; margin-bottom: 28px; }
  .head-row .page-head { flex-basis: 100%; }
}
</style>
