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

const { data: posts, refresh } = await useAsyncData<PostWithMeta[]>(
  'feed-posts',
  () => (user.value ? api<PostWithMeta[]>('/api/posts') : Promise.resolve([])),
  { default: () => [] }
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
        </div>
        <button type="button" class="btn primary" style="margin-left:auto;" @click="composerOpen = !composerOpen">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" style="vertical-align:-1px; margin-right:5px;"><line x1="12" y1="4" x2="12" y2="20" /><line x1="4" y1="12" x2="20" y2="12" /></svg>
          글쓰기
        </button>
      </div>

      <FeedPostComposer v-if="composerOpen" @created="handleCreated" @cancel="composerOpen = false" />

      <p v-if="!posts?.length" class="hint">아직 올라온 피드가 없어요. 첫 독서 순간을 남겨보세요.</p>
      <div v-else class="feed-grid">
        <FeedPostCard v-for="post in posts" :key="post.id" :post="post" @changed="refresh" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.head-row { display: flex; align-items: flex-end; margin-bottom: 26px; }
/* 인스타처럼 게시물을 1열로 하나씩 보여준다(QA #6). */
.feed-grid { display: flex; flex-direction: column; gap: 30px; max-width: 540px; margin: 0 auto; }

.hint { color: var(--sub); font-size: 14px; padding: 14px 0; }

@media (max-width: 600px) {
  .head-row { flex-direction: column; align-items: flex-start; gap: 12px; }
}
</style>
