<script setup lang="ts">
import type { Book, Post } from '#shared/types'
import { toggleTag } from '#shared/utils/hashtags'

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
// 해시태그 필터 — 여러 개 고를 수 있고, 하나라도 달린 글을 보여준다(OR).
const activeTags = ref<string[]>([])
const activeKeys = computed(() => new Set(activeTags.value.map((t) => t.toLowerCase())))

const { data: posts, refresh } = await useAsyncData<PostWithMeta[]>(
  'feed-posts',
  () =>
    user.value
      ? api<PostWithMeta[]>('/api/posts', {
          query: {
            ...(mineOnly.value ? { mine: '1' } : {}),
            ...(activeTags.value.length ? { tag: activeTags.value } : {}),
          },
        })
      : Promise.resolve([]),
  { default: () => [], watch: [mineOnly, activeTags] }
)

// 태그 바에 띄울 인기 태그(피드 전체 기준) — 필터를 걸어도 목록이 사라지지 않게 따로 받는다.
const { data: popularTags } = await useAsyncData<{ tag: string; count: number }[]>(
  'feed-tags',
  () => (user.value ? api<{ tag: string; count: number }[]>('/api/posts/tags') : Promise.resolve([])),
  { default: () => [] }
)

const composerOpen = ref(false)

function selectTag(tag: string) {
  activeTags.value = toggleTag(activeTags.value, tag)
  if (import.meta.client) window.scrollTo({ top: 0, behavior: 'smooth' })
}

async function handleCreated() {
  composerOpen.value = false
  activeTags.value = []
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
        <button type="button" class="btn primary" style="margin-left:auto;" @click="composerOpen = true">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" style="vertical-align:-1px; margin-right:5px;"><line x1="12" y1="4" x2="12" y2="20" /><line x1="4" y1="12" x2="20" y2="12" /></svg>
          글쓰기
        </button>
      </div>

      <div class="column">
        <!-- 인스타처럼 피드 맨 위에 "무슨 책 읽고 계세요?" 한 줄 — 누르면 모달이 열린다. -->
        <button v-if="user" type="button" class="starter" @click="composerOpen = true">
          <span class="avatar">{{ user.name.charAt(0) }}</span>
          <span class="starter-txt">무슨 책 읽고 계세요, {{ user.name }}님?</span>
          <span class="starter-cam" aria-hidden="true">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.4" /></svg>
          </span>
        </button>

        <div v-if="activeTags.length || popularTags.length" class="tagbar">
          <button
            v-if="activeTags.length > 1"
            type="button" class="tb-chip clear" @click="activeTags = []"
          >모두 해제</button>
          <button
            v-for="tag in activeTags"
            :key="`on-${tag}`" type="button" class="tb-chip on" @click="selectTag(tag)"
          >#{{ tag }} <span class="tb-x" aria-hidden="true">×</span></button>
          <button
            v-for="t in popularTags"
            v-show="!activeKeys.has(t.tag.toLowerCase())"
            :key="t.tag" type="button" class="tb-chip" @click="selectTag(t.tag)"
          >#{{ t.tag }} <small>{{ t.count }}</small></button>
        </div>

        <p v-if="!posts?.length" class="hint">
          <template v-if="activeTags.length">{{ activeTags.map((t) => `#${t}`).join(', ') }} 태그가 달린 게시물이 아직 없어요.</template>
          <template v-else-if="mineOnly">아직 내가 올린 게시물이 없어요. 첫 독서 순간을 남겨보세요.</template>
          <template v-else>아직 올라온 피드가 없어요. 첫 독서 순간을 남겨보세요.</template>
        </p>
        <div v-else class="feed-grid">
          <FeedPostCard v-for="post in posts" :key="post.id" :post="post" @changed="refresh" @tag-click="selectTag" />
        </div>
      </div>

      <FeedPostComposer v-if="composerOpen" @created="handleCreated" @cancel="composerOpen = false" />

      <!-- 모바일에서 손 닿는 곳에 글쓰기(헤더 버튼은 스크롤하면 사라진다) -->
      <button type="button" class="fab feed-fab" aria-label="새 게시물" @click="composerOpen = true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
/* 헤더와 게시물 사이를 넉넉히(QA #69). '내 게시물만'은 제목 아래 왼쪽(QA #68). */
.head-row { display: flex; align-items: flex-end; gap: 10px; margin: 0 auto 26px; max-width: 540px; }
.mine-chip { display: inline-flex; align-items: center; gap: 5px; font-weight: 600; margin-top: 12px; }
/* 인스타처럼 게시물을 1열로 하나씩 보여준다(QA #6). */
.feed-grid { display: flex; flex-direction: column; gap: 30px; }

.hint { color: var(--sub); font-size: 14px; padding: 14px 0; text-align: center; }

/* 피드 본문(컴포저 바·태그 바·게시물)을 한 폭으로 묶는다. */
.column { max-width: 540px; margin: 0 auto; display: flex; flex-direction: column; gap: 18px; }

.starter { display: flex; align-items: center; gap: 12px; width: 100%; padding: 12px 14px; border: 1px solid var(--line); border-radius: 10px; background: var(--card); box-shadow: 0 2px 10px var(--shadow); cursor: pointer; font: inherit; text-align: left; transition: border-color .15s; }
.starter:hover { border-color: var(--line-strong); }
.starter-txt { flex: 1; min-width: 0; color: var(--sub); font-size: 14.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.starter-cam { display: flex; color: var(--red); flex-shrink: 0; }

.tagbar { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; padding-bottom: 2px; }
.tagbar::-webkit-scrollbar { display: none; }
.tb-chip { flex-shrink: 0; border: 1px solid var(--line); background: var(--card); color: var(--sub); font: inherit; font-size: 12.5px; font-weight: 600; padding: 5px 12px; border-radius: 999px; cursor: pointer; white-space: nowrap; }
.tb-chip small { opacity: .6; font-size: 11px; margin-left: 2px; }
.tb-chip:hover { color: var(--red); border-color: var(--red); }
.tb-chip.on { background: var(--red); border-color: var(--red); color: #fff; }
.tb-chip.on .tb-x { opacity: .8; margin-left: 2px; }
/* 태그를 여러 개 걸었을 때만 나오는 초기화 칩 — 빨간 칩들과 구분되게 점선 테두리. */
.tb-chip.clear { border-style: dashed; color: var(--sub); font-weight: 500; }

/* 데스크톱에는 헤더 버튼이 보이므로 FAB은 모바일에서만. 챗봇 FAB(우하단)과 겹치지 않게 위로 띄운다. */
.feed-fab { display: none; }

@media (max-width: 600px) {
  .head-row { flex-wrap: wrap; align-items: flex-start; gap: 12px; margin-bottom: 20px; }
  .head-row .page-head { flex-basis: 100%; }
  .head-row > .btn.primary { display: none; }
  .feed-fab { display: flex; align-items: center; justify-content: center; bottom: 88px; }
}
</style>
