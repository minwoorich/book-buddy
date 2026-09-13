<script setup lang="ts">
import type { Book, Post, PostComment } from '#shared/types'

type PostWithMeta = Post & {
  userName: string
  department: string
  book: Book | null
  likeCount: number
  likedByMe: boolean
  commentCount: number
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
    <div class="photo">
      <img :src="post.imagePath" :alt="post.caption ?? post.book?.title ?? '게시물 사진'">
    </div>
    <div class="body">
      <div class="who">
        <span class="avatar">{{ post.userName.charAt(0) }}</span>
        <div><b>{{ post.userName }}</b><span>{{ post.department }} · {{ timeLabel }}</span></div>
      </div>
      <div v-if="post.caption" class="cap">{{ post.caption }}</div>
      <NuxtLink v-if="post.book" class="booktag" :to="`/books/${post.book.id}`">
        <BookCoverImage :src="post.book.coverUrl" :alt="post.book.title" />
        {{ post.book.title }}
      </NuxtLink>
      <div class="acts">
        <span class="like" :class="{ on: post.likedByMe }" @click="toggleLike">
          <svg width="15" height="15" viewBox="0 0 24 24" :fill="post.likedByMe ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2"><path d="M12 21C7 16.5 3 13.3 3 9.2 3 6.4 5.2 4 8 4c1.6 0 3.1.8 4 2 0.9-1.2 2.4-2 4-2 2.8 0 5 2.4 5 5.2 0 4.1-4 7.3-9 11.8z" /></svg>
          {{ post.likeCount }}
        </span>
        <span class="cmt-toggle" @click="toggleComments">댓글 {{ post.commentCount }}</span>
      </div>
      <div v-if="commentsOpen" class="comments">
        <p v-if="commentsLoading" class="hint">불러오는 중…</p>
        <p v-else-if="!comments.length" class="hint">아직 댓글이 없어요.</p>
        <div v-for="c in comments" :key="c.id" class="cmt"><b>{{ c.userName }}</b>{{ c.content }}</div>
        <div class="cmt-form">
          <input v-model="newComment" class="input" placeholder="댓글 달기..." @keyup.enter="submitComment">
          <button type="button" class="btn sm" :disabled="commentSubmitting" @click="submitComment">등록</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.post { background: var(--card); border: 1px solid var(--line); border-radius: 4px; overflow: hidden; box-shadow: 0 2px 10px rgba(84, 70, 45, .06); }
.post .photo { aspect-ratio: 4 / 3; background: #EDE7DA; position: relative; overflow: hidden; }
.post .photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.post .body { padding: 14px 16px 16px; }
.post .who { display: flex; align-items: center; gap: 9px; margin-bottom: 10px; }
.post .who b { font-size: 13.5px; display: block; }
.post .who span { font-size: 11.5px; color: var(--sub); }
.post .cap { font-size: 14px; line-height: 1.65; color: #3E382D; margin-bottom: 12px; }
.booktag { display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--line); background: var(--card-2); border-radius: 999px; padding: 4px 12px 4px 4px; font-size: 12px; font-weight: 600; color: var(--ink); margin-bottom: 12px; text-decoration: none; }
.booktag :deep(.cv) { width: 20px; height: 28px; border-radius: 1px 3px 3px 1px; box-shadow: 1px 2px 4px rgba(60, 48, 28, .25); }
.acts { display: flex; align-items: center; gap: 16px; font-size: 13px; color: var(--sub); border-top: 1px solid var(--line); padding-top: 12px; }
.acts .like { display: flex; align-items: center; gap: 5px; cursor: pointer; }
.acts .like.on { color: var(--red); font-weight: 700; }
.acts .cmt-toggle { cursor: pointer; }
.acts .cmt-toggle:hover { color: var(--ink); }
.comments { border-top: 1px solid var(--line); margin-top: 12px; padding-top: 12px; display: flex; flex-direction: column; gap: 8px; }
.comments .hint { color: var(--sub); font-size: 12.5px; }
.cmt { font-size: 13px; line-height: 1.5; }
.cmt b { margin-right: 6px; }
.cmt-form { display: flex; gap: 8px; margin-top: 4px; }
.cmt-form .input { padding: 7px 12px; font-size: 13px; }
</style>
