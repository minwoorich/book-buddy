<script setup lang="ts">
import type { ReaderProfile } from '#shared/types'
import { parseDbDate } from '~/utils/date'

/** userId가 들어오면 그 사람의 독서 프로필을 불러와 보여주고, null이면 닫힌 상태. */
const props = defineProps<{ userId: number | null }>()
const emit = defineEmits<{ close: [] }>()

const api = useApi()

type Tab = 'books' | 'reviews'
const tab = ref<Tab>('books')
const profile = ref<ReaderProfile | null>(null)
const pending = ref(false)
const error = ref('')

watch(
  () => props.userId,
  async (id) => {
    if (id === null) return
    // 다른 사람을 열면 앞사람 내용이 남지 않도록 비우고 시작한다.
    profile.value = null
    error.value = ''
    tab.value = 'books'
    pending.value = true
    try {
      profile.value = await api<ReaderProfile>(`/api/users/${id}/profile`)
    } catch (e) {
      error.value = apiErrorMessage(e)
    } finally {
      pending.value = false
    }
  },
  { immediate: true }
)

const org = computed(() => {
  const u = profile.value?.user
  if (!u) return ''
  return [u.company, u.department, u.team, u.position].filter(Boolean).join(' · ')
})

function dateLabel(value: string): string {
  return parseDbDate(value).toLocaleDateString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric' })
}

/** 책을 누르면 모달을 닫고 상세로 이동한다. */
function openBook(bookId: number): void {
  emit('close')
  void navigateTo(`/books/${bookId}`)
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="modal-back" @click.self="emit('close')">
    <div class="sheet" role="dialog" aria-modal="true" aria-label="독서 프로필">
      <button type="button" class="close" aria-label="닫기" @click="emit('close')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>

      <p v-if="pending" class="hint">불러오는 중…</p>
      <p v-else-if="error" class="hint">{{ error }}</p>

      <template v-else-if="profile">
        <div class="who">
          <span class="avatar">{{ profile.user.name.charAt(0) }}</span>
          <div>
            <b>{{ profile.user.name }}</b>
            <span class="org">{{ org }}</span>
            <span class="tally">완독 <b>{{ profile.doneCount }}권</b> · 리뷰 <b>{{ profile.reviewCount }}개</b></span>
          </div>
        </div>

        <div class="tabs">
          <span class="tab" :class="{ on: tab === 'books' }" @click="tab = 'books'">
            완독한 책 {{ profile.doneCount }}
          </span>
          <span class="tab" :class="{ on: tab === 'reviews' }" @click="tab = 'reviews'">
            남긴 리뷰 {{ profile.reviewCount }}
          </span>
        </div>

        <div class="list">
          <template v-if="tab === 'books'">
            <p v-if="!profile.books.length" class="hint">아직 완독한 책이 없어요</p>
            <button
              v-for="book in profile.books"
              :key="book.id"
              type="button"
              class="row book"
              @click="openBook(book.id)"
            >
              <BookCoverImage :src="book.coverUrl" :alt="book.title" class="thumb" />
              <div class="meta">
                <b>{{ book.title }}</b>
                <span>{{ book.author }}</span>
              </div>
              <span class="when">{{ dateLabel(book.returnedAt) }} 완독</span>
            </button>
          </template>

          <template v-else>
            <p v-if="!profile.reviews.length" class="hint">아직 남긴 리뷰가 없어요</p>
            <button
              v-for="review in profile.reviews"
              :key="review.id"
              type="button"
              class="row review"
              @click="openBook(review.bookId)"
            >
              <BookCoverImage :src="review.bookCoverUrl" :alt="review.bookTitle" class="thumb" />
              <div class="meta">
                <div class="head">
                  <b>{{ review.bookTitle }}</b>
                  <span class="stars">
                    <svg viewBox="0 0 24 24" style="fill: var(--star)"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8-5.1-4.7 6.9-.8z" /></svg>{{ review.rating.toFixed(1) }}
                  </span>
                  <span class="when">{{ dateLabel(review.createdAt) }}</span>
                </div>
                <p class="txt">{{ review.content }}</p>
              </div>
            </button>
          </template>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.modal-back {
  position: fixed; inset: 0; background: var(--overlay); z-index: 95;
  display: flex; align-items: center; justify-content: center; padding: 20px;
}
.sheet {
  position: relative; width: 520px; max-width: 100%; max-height: 82vh; overflow: hidden;
  background: var(--card); border: 1px solid var(--line-strong); border-radius: 10px;
  padding: 22px 22px 8px; display: flex; flex-direction: column;
  box-shadow: 0 24px 60px var(--shadow-strong);
}
.close { position: absolute; top: 12px; right: 12px; border: 0; background: none; color: var(--sub); cursor: pointer; padding: 4px; line-height: 0; }
.close:hover { color: var(--ink); }

.who { display: flex; align-items: center; gap: 14px; padding-right: 30px; }
.who .avatar { width: 52px; height: 52px; font-size: 20px; flex: none; }
.who b { font-size: 17px; display: block; }
.who .org { display: block; font-size: 12.5px; color: var(--sub); margin-top: 2px; }
.who .tally { display: block; font-size: 13px; color: var(--sub); margin-top: 6px; }
.who .tally b { display: inline; font-size: 13px; color: var(--ink); }

.tabs { margin: 18px 0 0; }
.list { overflow-y: auto; margin: 0 -6px; padding: 0 6px 14px; }

.row {
  width: 100%; display: flex; align-items: center; gap: 13px; text-align: left;
  padding: 12px 6px; border: 0; border-bottom: 1px solid var(--line);
  background: none; font: inherit; color: inherit; cursor: pointer; border-radius: 4px;
}
.row:last-child { border-bottom: 0; }
.row:hover { background: var(--hover); }
.row .thumb { width: 38px; flex: none; }
.row .meta { flex: 1; min-width: 0; }
.row .meta b { font-size: 14px; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.row.book .meta span { font-size: 12px; color: var(--sub); }
.row .when { font-size: 11.5px; color: var(--muted); flex: none; }

.row.review { align-items: flex-start; }
.row.review .head { display: flex; align-items: center; gap: 8px; }
.row.review .head b { display: inline; }
.row.review .stars { display: inline-flex; align-items: center; gap: 2px; font-size: 12px; color: var(--sub); flex: none; }
.row.review .stars svg { width: 11px; height: 11px; }
.row.review .txt { margin: 4px 0 0; font-size: 13.5px; line-height: 1.6; color: var(--text-2); }

.hint { color: var(--sub); font-size: 14px; padding: 16px 2px; }

@media (max-width: 640px) {
  .modal-back { padding: 0; align-items: flex-end; }
  .sheet { max-height: 88vh; border-radius: 12px 12px 0 0; padding: 18px 14px 6px; }
  .row .when { display: none; }
  .row.review .head .when { display: none; }
}
</style>
