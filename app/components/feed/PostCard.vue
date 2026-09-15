<script setup lang="ts">
import type { Book, Post, PostComment } from '#shared/types'

type PostWithMeta = Post & {
  userName: string
  department: string
  book: Book | null
  likeCount: number
  likedByMe: boolean
  commentCount: number
  images: string[]
}

type CommentWithUser = PostComment & { userName: string }

const props = defineProps<{ post: PostWithMeta }>()
const emit = defineEmits<{ changed: [] }>()

const api = useApi()
const { user } = useCurrentUser()

const timeLabel = computed(() => {
  const d = parseDbDate(props.post.createdAt)
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60_000)
  if (diffMin < 1) return '방금 전'
  if (diffMin < 60) return `${diffMin}분 전`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour}시간 전`
  return `${d.getMonth() + 1}. ${d.getDate()}.`
})

// images가 비어 있을 일은 없지만(레포에서 imagePath로 폴백) 방어적으로 한 번 더 폴백한다.
const photos = computed(() => (props.post.images.length > 0 ? props.post.images : [props.post.imagePath]))
const activeIndex = ref(0)
watch(
  () => props.post.id,
  () => {
    activeIndex.value = 0
  }
)

function prevPhoto() {
  if (activeIndex.value > 0) activeIndex.value--
}

function nextPhoto() {
  if (activeIndex.value < photos.value.length - 1) activeIndex.value++
}

const likeBusy = ref(false)

async function toggleLike() {
  if (!user.value) {
    alert('로그인이 필요해요')
    return
  }
  if (likeBusy.value) return
  likeBusy.value = true
  try {
    if (props.post.likedByMe) {
      await api(`/api/posts/${props.post.id}/likes`, { method: 'DELETE' })
    } else {
      await api(`/api/posts/${props.post.id}/likes`, { method: 'POST' })
    }
    emit('changed')
  } catch (e) {
    const statusCode = (e as { statusCode?: number })?.statusCode
    if (statusCode === 409) {
      emit('changed')
    } else {
      alert(apiErrorMessage(e))
    }
  } finally {
    likeBusy.value = false
  }
}

const commentsOpen = ref(false)
const comments = ref<CommentWithUser[]>([])
const commentsLoaded = ref(false)
const commentsLoading = ref(false)
const newComment = ref('')
const commentSubmitting = ref(false)

async function loadComments() {
  commentsLoading.value = true
  try {
    comments.value = await api<CommentWithUser[]>(`/api/posts/${props.post.id}/comments`)
    commentsLoaded.value = true
  } catch (e) {
    alert(apiErrorMessage(e))
  } finally {
    commentsLoading.value = false
  }
}

async function toggleComments() {
  commentsOpen.value = !commentsOpen.value
  if (commentsOpen.value && !commentsLoaded.value) {
    await loadComments()
  }
}

async function submitComment() {
  const trimmed = newComment.value.trim()
  if (!trimmed || commentSubmitting.value) return
  if (!user.value) {
    alert('로그인이 필요해요')
    return
  }
  commentSubmitting.value = true
  try {
    await api(`/api/posts/${props.post.id}/comments`, { method: 'POST', body: { content: trimmed } })
    newComment.value = ''
    await loadComments()
    commentsOpen.value = true // 방금 단 댓글이 바로 보이도록 펼친다
    emit('changed')
  } catch (e) {
    alert(apiErrorMessage(e))
  } finally {
    commentSubmitting.value = false
  }
}
</script>

<template>
  <div class="post">
    <div class="who">
      <span class="avatar">{{ post.userName.charAt(0) }}</span>
      <div class="who-txt">
        <b>{{ post.userName }}</b>
        <span>{{ post.department }} · {{ timeLabel }}</span>
      </div>
      <NuxtLink v-if="post.book" class="booktag" :to="`/books/${post.book.id}`">
        <BookCoverImage :src="post.book.coverUrl" :alt="post.book.title" />
        <span class="booktag-t">{{ post.book.title }}</span>
      </NuxtLink>
    </div>
    <div class="photo">
      <img :src="photos[activeIndex]" :alt="post.caption ?? post.book?.title ?? '게시물 사진'">
      <template v-if="photos.length > 1">
        <button
          type="button" class="nav prev" :disabled="activeIndex === 0"
          aria-label="이전 사진" @click="prevPhoto"
        >‹</button>
        <button
          type="button" class="nav next" :disabled="activeIndex === photos.length - 1"
          aria-label="다음 사진" @click="nextPhoto"
        >›</button>
        <div class="dots">
          <span v-for="(p, i) in photos" :key="p + i" class="dot" :class="{ on: i === activeIndex }" />
        </div>
        <div class="counter">{{ activeIndex + 1 }}/{{ photos.length }}</div>
      </template>
    </div>
    <div class="body">
      <div class="acts">
        <button type="button" class="act-btn" :class="{ on: post.likedByMe }" aria-label="좋아요" @click="toggleLike">
          <svg width="22" height="22" viewBox="0 0 24 24" :fill="post.likedByMe ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.8"><path d="M12 21C7 16.5 3 13.3 3 9.2 3 6.4 5.2 4 8 4c1.6 0 3.1.8 4 2 0.9-1.2 2.4-2 4-2 2.8 0 5 2.4 5 5.2 0 4.1-4 7.3-9 11.8z" /></svg>
        </button>
        <button type="button" class="act-btn" aria-label="댓글" @click="toggleComments">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 11.5c0 4.1-4 7.5-9 7.5-1 0-2-.13-2.9-.38L4 20l1.2-3.6C3.8 15.1 3 13.4 3 11.5 3 7.4 7 4 12 4s9 3.4 9 7.5z" /></svg>
        </button>
      </div>
      <div v-if="post.likeCount" class="likes">좋아요 {{ post.likeCount }}개</div>
      <div v-if="post.caption" class="cap"><b>{{ post.userName }}</b> {{ post.caption }}</div>
      <button v-if="!commentsOpen && post.commentCount" type="button" class="cmt-toggle" @click="toggleComments">
        댓글 {{ post.commentCount }}개 모두 보기
      </button>
      <div v-if="commentsOpen" class="comments">
        <p v-if="commentsLoading" class="hint">불러오는 중…</p>
        <p v-else-if="!comments.length" class="hint">아직 댓글이 없어요.</p>
        <div v-for="c in comments" :key="c.id" class="cmt"><b>{{ c.userName }}</b>{{ c.content }}</div>
      </div>
      <div class="cmt-form">
        <input v-model="newComment" placeholder="댓글 달기..." @keyup.enter="submitComment">
        <button
          type="button"
          class="post-btn"
          :disabled="commentSubmitting || !newComment.trim()"
          @click="submitComment"
        >게시</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 인스타 무드(QA #40): 헤더 → 사진 → 아이콘 액션 → 좋아요 → 캡션 → 댓글, 여백 넉넉히. */
.post { background: var(--card); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(84, 70, 45, .06); }

.who { display: flex; align-items: center; gap: 10px; padding: 12px 14px; }
.who-txt b { font-size: 13.5px; display: block; }
.who-txt span { font-size: 11.5px; color: var(--sub); }
.booktag { margin-left: auto; display: inline-flex; align-items: center; gap: 7px; border: 1px solid var(--line); background: var(--card-2); border-radius: 999px; padding: 3px 11px 3px 3px; font-size: 11.5px; font-weight: 600; color: var(--ink); text-decoration: none; max-width: 45%; }
.booktag-t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.booktag :deep(.cv) { width: 18px; height: 26px; border-radius: 1px 3px 3px 1px; box-shadow: 1px 2px 4px rgba(60, 48, 28, .25); flex-shrink: 0; }

/* 사진 비율을 고정하지 않는다(QA #48) — 가로/세로/정방형 모두 원본 비율대로, 세로가
   너무 긴 사진만 640px에서 잘라낸다. */
.post .photo { background: #EDE7DA; position: relative; overflow: hidden; }
.post .photo img { width: 100%; height: auto; max-height: 640px; object-fit: cover; display: block; }
.post .photo .nav { position: absolute; top: 50%; transform: translateY(-50%); width: 28px; height: 28px; border-radius: 50%; border: none; background: rgba(0, 0, 0, .4); color: #fff; font-size: 17px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.post .photo .nav:hover:not(:disabled) { background: rgba(0, 0, 0, .6); }
.post .photo .nav:disabled { opacity: .3; cursor: default; }
.post .photo .nav.prev { left: 10px; }
.post .photo .nav.next { right: 10px; }
.post .photo .dots { position: absolute; bottom: 10px; left: 0; right: 0; display: flex; justify-content: center; gap: 5px; }
.post .photo .dot { width: 6px; height: 6px; border-radius: 50%; background: rgba(255, 255, 255, .55); }
.post .photo .dot.on { background: var(--red); }
.post .photo .counter { position: absolute; top: 10px; right: 10px; background: rgba(0, 0, 0, .5); color: #fff; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; }
.post .body { padding: 10px 14px 6px; }
.acts { display: flex; align-items: center; gap: 4px; margin: 0 -6px 2px; }
.act-btn { border: 0; background: none; padding: 6px; cursor: pointer; color: var(--ink); display: flex; }
.act-btn:hover { opacity: .6; }
.act-btn.on { color: var(--red); }
.likes { font-size: 13.5px; font-weight: 700; margin-bottom: 5px; }
.post .cap { font-size: 15px; line-height: 1.65; color: #3E382D; margin-bottom: 6px; }
.post .cap b { margin-right: 5px; }
.cmt-toggle { border: 0; background: none; padding: 0; font: inherit; font-size: 13px; color: var(--sub); cursor: pointer; margin-bottom: 6px; display: block; }
.cmt-toggle:hover { color: var(--ink); }
.comments { display: flex; flex-direction: column; gap: 7px; margin-bottom: 6px; }
.comments .hint { color: var(--sub); font-size: 12.5px; margin: 0; }
.cmt { font-size: 13.5px; line-height: 1.55; }
.cmt b { margin-right: 6px; }
/* 인풋·버튼을 한 줄로 — 버튼이 좁아져 글자가 세로로 깨지지 않게 nowrap + shrink 금지(QA #44). */
.cmt-form { display: flex; align-items: center; gap: 10px; border-top: 1px solid var(--line); margin: 4px -14px 0; padding: 9px 14px; }
.cmt-form input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; font: inherit; font-size: 13.5px; color: var(--ink); }
.post-btn { border: 0; background: none; padding: 0; font: inherit; font-size: 13.5px; font-weight: 700; color: var(--red); cursor: pointer; white-space: nowrap; flex-shrink: 0; }
.post-btn:disabled { opacity: .4; cursor: default; }
</style>
