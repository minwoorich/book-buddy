<script setup lang="ts">
import type { Book } from '#shared/types'

const api = useApi()
const router = useRouter()

const query = ref('')
const results = ref<Book[]>([])
const searching = ref(false)
const book = ref<Book | null>(null)
const title = ref('')
const description = ref('')
const capacity = ref(5)
const recruitDays = ref(7)
const sending = ref(false)
const message = ref('')

async function search() {
  const q = query.value.trim()
  if (q.length === 0) return
  searching.value = true
  try {
    results.value = (await api<Book[]>('/api/books', { query: { query: q } })).slice(0, 10)
  } catch (e) {
    message.value = apiErrorMessage(e)
  } finally {
    searching.value = false
  }
}

/** 책을 고르면 제목 기본값을 채운다(이미 직접 쓴 제목은 덮지 않는다). */
function pick(b: Book) {
  book.value = b
  results.value = []
  if (title.value.trim().length === 0 || title.value === defaultTitleFor(book.value)) title.value = defaultTitleFor(b)
}
/** 기본 제목 `『책 제목』 함께 읽기`가 40자를 넘으면(제목은 1~40자 제약) 책 제목을 잘라 맞춘다. */
function defaultTitleFor(b: Book | null): string {
  if (!b) return ''
  const suffix = '『』 함께 읽기'
  const max = 40 - suffix.length
  const title = b.title.length > max ? `${b.title.slice(0, max - 1)}…` : b.title
  return `『${title}』 함께 읽기`
}

async function submit() {
  if (sending.value) return
  if (!book.value) { message.value = '책을 골라주세요'; return }
  sending.value = true
  message.value = ''
  try {
    const club = await api<{ id: number }>('/api/clubs', {
      method: 'POST',
      body: { bookId: book.value.id, title: title.value, description: description.value, capacity: capacity.value, recruitDays: recruitDays.value },
    })
    await router.push(`/clubs/${club.id}`)
  } catch (e) {
    message.value = apiErrorMessage(e)
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div>
    <CommonAppHeader active="clubs" />
    <main class="wrap">
      <NuxtLink class="back" to="/clubs">← 책모임</NuxtLink>
      <h1>모임 만들기</h1>
      <p class="lead">책을 고르고 모집글을 쓰면 바로 모집이 시작돼요. 3명이 모이면 시간을 잡을 수 있어요.</p>

      <section class="field">
        <h2>어떤 책이에요?</h2>
        <div v-if="book" class="picked">
          <img v-if="book.coverUrl" :src="book.coverUrl" :alt="book.title" class="cover" />
          <div><strong>{{ book.title }}</strong><p class="muted">{{ book.author }}</p></div>
          <button type="button" class="link" @click="book = null">바꾸기</button>
        </div>
        <form v-else class="search" @submit.prevent="search">
          <input v-model="query" type="search" placeholder="책 제목이나 저자" aria-label="책 검색" />
          <button type="submit" :disabled="searching">{{ searching ? '찾는 중…' : '검색' }}</button>
        </form>
        <ul v-if="!book && results.length > 0" class="results">
          <li v-for="b in results" :key="b.id">
            <button type="button" class="result" @click="pick(b)">
              <img v-if="b.coverUrl" :src="b.coverUrl" :alt="b.title" class="cover small" />
              <span><strong>{{ b.title }}</strong><span class="muted"> · {{ b.author }}</span></span>
            </button>
          </li>
        </ul>
      </section>

      <section class="field">
        <h2>제목</h2>
        <input v-model="title" type="text" maxlength="40" placeholder="예: 『하드씽』 함께 읽기" aria-label="모임 제목" />
      </section>

      <section class="field">
        <h2>소개글 <span class="muted">(선택)</span></h2>
        <textarea v-model="description" rows="5" maxlength="1000" placeholder="왜 이 책인지, 어떤 이야기를 나누고 싶은지, 누구를 환영하는지" aria-label="소개글" />
      </section>

      <section class="field row">
        <label>정원
          <select v-model.number="capacity">
            <option v-for="n in [3, 4, 5, 6]" :key="n" :value="n">{{ n }}명</option>
          </select>
        </label>
        <fieldset class="days">
          <legend>모집 기간</legend>
          <label v-for="d in [3, 7, 14]" :key="d"><input v-model.number="recruitDays" type="radio" :value="d" /> {{ d }}일</label>
        </fieldset>
      </section>

      <p v-if="message" class="msg">{{ message }}</p>
      <button type="button" class="submit" :disabled="sending || !book" @click="submit">{{ sending ? '여는 중…' : '모임 열기' }}</button>
    </main>
  </div>
</template>

<style scoped>
.wrap { max-width: 640px; margin: 0 auto; padding: 24px 16px 60px; }
.back { font-size: 14px; color: var(--muted, #666); text-decoration: none; }
h1 { font-size: 22px; margin: 10px 0 4px; }
.lead { color: var(--muted, #666); font-size: 14px; margin: 0 0 20px; }
.field { margin-top: 20px; }
.field h2 { font-size: 15px; margin: 0 0 8px; }
.muted { color: var(--muted, #888); font-size: 13px; }
input[type="text"], input[type="search"], textarea, select { width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid var(--line, #ddd); border-radius: 8px; font-size: 14px; background: var(--bg, #fff); color: inherit; }
textarea { resize: vertical; }
.search { display: flex; gap: 8px; }
.search button, .submit { padding: 10px 16px; border: none; border-radius: 8px; background: var(--red); color: #fff; font-size: 14px; cursor: pointer; }
.search button:disabled, .submit:disabled { opacity: 0.5; cursor: default; }
.results { list-style: none; padding: 0; margin: 8px 0 0; border: 1px solid var(--line, #eee); border-radius: 8px; }
.result { display: flex; gap: 10px; align-items: center; width: 100%; text-align: left; padding: 8px 10px; background: none; border: none; border-bottom: 1px solid var(--line, #eee); cursor: pointer; color: inherit; font-size: 14px; }
.results li:last-child .result { border-bottom: none; }
.picked { display: flex; gap: 12px; align-items: center; padding: 10px; border: 1px solid var(--line, #eee); border-radius: 8px; }
.cover { width: 44px; height: 62px; object-fit: cover; border-radius: 4px; flex: none; }
.cover.small { width: 30px; height: 42px; }
.link { margin-left: auto; background: none; border: none; color: var(--red); cursor: pointer; font-size: 13px; }
.row { display: flex; gap: 20px; align-items: flex-start; flex-wrap: wrap; }
.row label { font-size: 14px; }
.row select { width: auto; margin-left: 6px; }
.days { border: none; padding: 0; margin: 0; display: flex; gap: 12px; align-items: center; }
.days legend { font-size: 14px; padding: 0; margin-right: 4px; }
.msg { font-size: 14px; color: var(--red); margin: 12px 0 0; }
.submit { display: block; width: 100%; margin-top: 20px; padding: 12px; font-size: 15px; }
</style>
