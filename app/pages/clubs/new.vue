<script setup lang="ts">
import type { Book } from '#shared/types'

const api = useApi()
const router = useRouter()

const query = ref('')
const results = ref<Book[]>([])
const searched = ref(false)
const searching = ref(false)
const book = ref<Book | null>(null)
const title = ref('')
const description = ref('')
const capacity = ref(5)
const recruitDays = ref(7)
const candidateSlots = ref<string[]>([])
const sending = ref(false)
const message = ref('')

const CAPACITIES = [3, 4, 5, 6]
const RECRUIT_DAYS = [3, 7, 14]
const TITLE_MAX = 40
const DESCRIPTION_MAX = 1000

async function search() {
  const q = query.value.trim()
  if (q.length === 0) return
  searching.value = true
  message.value = ''
  try {
    results.value = (await api<Book[]>('/api/books', { query: { query: q } })).slice(0, 8)
    searched.value = true
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
  searched.value = false
  if (title.value.trim().length === 0 || title.value === defaultTitleFor(book.value)) title.value = defaultTitleFor(b)
}
function unpick() {
  book.value = null
  query.value = ''
}
/** 기본 제목 `『책 제목』 함께 읽기`가 40자를 넘으면(제목은 1~40자 제약) 책 제목을 잘라 맞춘다. */
function defaultTitleFor(b: Book | null): string {
  if (!b) return ''
  const suffix = '『』 함께 읽기'
  const max = TITLE_MAX - suffix.length
  const t = b.title.length > max ? `${b.title.slice(0, max - 1)}…` : b.title
  return `『${t}』 함께 읽기`
}

async function submit() {
  if (sending.value) return
  if (!book.value) { message.value = '책을 골라주세요'; return }
  sending.value = true
  message.value = ''
  try {
    const club = await api<{ id: number }>('/api/clubs', {
      method: 'POST',
      body: { bookId: book.value.id, title: title.value, description: description.value, capacity: capacity.value, recruitDays: recruitDays.value, candidateSlots: candidateSlots.value },
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
    <main class="wrap new-wrap">
      <NuxtLink class="back" to="/clubs">← 책모임</NuxtLink>

      <div class="page-head">
        <span class="eyebrow">NEW CLUB</span>
        <h1>모임 만들기</h1>
        <p>책 한 권을 고르고 모집글을 쓰면 바로 모집이 시작돼요.</p>
      </div>

      <form class="panel form" @submit.prevent="submit">
        <!-- 책 -->
        <div class="group">
          <div class="label">책</div>
          <div v-if="book" class="picked">
            <div class="cv picked-cv">
              <img v-if="book.coverUrl" :src="book.coverUrl" :alt="book.title" />
            </div>
            <div class="picked-body">
              <strong>{{ book.title }}</strong>
              <span class="sub">{{ book.author }}</span>
            </div>
            <button type="button" class="text-btn" @click="unpick">다른 책</button>
          </div>
          <template v-else>
            <div class="search">
              <input
                v-model="query"
                type="search"
                class="input"
                placeholder="책 제목이나 저자로 찾아요"
                aria-label="책 검색"
                @keydown.enter.prevent="search"
              />
              <button type="button" class="btn find" :disabled="searching || query.trim().length === 0" @click="search">
                {{ searching ? '찾는 중' : '찾기' }}
              </button>
            </div>
            <ul v-if="results.length > 0" class="results">
              <li v-for="b in results" :key="b.id">
                <button type="button" class="result" @click="pick(b)">
                  <span class="cv result-cv"><img v-if="b.coverUrl" :src="b.coverUrl" :alt="b.title" /></span>
                  <span class="result-body"><strong>{{ b.title }}</strong><span class="sub">{{ b.author }}</span></span>
                  <span class="result-go">고르기</span>
                </button>
              </li>
            </ul>
            <p v-else-if="searched" class="hint">찾는 책이 없어요. 서관에 있는 책만 고를 수 있어요.</p>
          </template>
        </div>

        <!-- 제목 -->
        <div class="group">
          <label class="label" for="club-title">제목</label>
          <input
            id="club-title"
            v-model="title"
            type="text"
            class="input"
            :maxlength="TITLE_MAX"
            placeholder="예: 『하드씽』 함께 읽기"
          />
        </div>

        <!-- 소개 -->
        <div class="group">
          <label class="label" for="club-desc">소개 <span class="opt">선택</span></label>
          <div class="ta">
            <textarea
              id="club-desc"
              v-model="description"
              class="input"
              rows="5"
              :maxlength="DESCRIPTION_MAX"
              placeholder="왜 이 책인지, 어떤 이야기를 나누고 싶은지, 누구를 환영하는지"
            />
            <span class="count">{{ description.length }}/{{ DESCRIPTION_MAX }}</span>
          </div>
        </div>

        <!-- 후보 시간 -->
        <div class="group">
          <div class="label">후보 시간 <span class="opt">선택 · 참가자가 모집 중에 투표해요</span></div>
          <ClubCandidateEditor v-model="candidateSlots" />
          <p class="hint">비워 두면 모집을 닫을 때 시스템이 후보 3개를 만들어 투표를 받아요.</p>
        </div>

        <!-- 정원 · 기간 -->
        <div class="group two">
          <div>
            <div class="label">정원</div>
            <div class="chips" role="radiogroup" aria-label="정원">
              <button
                v-for="n in CAPACITIES"
                :key="n"
                type="button"
                class="chip"
                :class="{ on: capacity === n }"
                role="radio"
                :aria-checked="capacity === n"
                @click="capacity = n"
              >{{ n }}명</button>
            </div>
          </div>
          <div>
            <div class="label">모집 기간</div>
            <div class="chips" role="radiogroup" aria-label="모집 기간">
              <button
                v-for="d in RECRUIT_DAYS"
                :key="d"
                type="button"
                class="chip"
                :class="{ on: recruitDays === d }"
                role="radio"
                :aria-checked="recruitDays === d"
                @click="recruitDays = d"
              >{{ d }}일</button>
            </div>
          </div>
        </div>

        <div class="foot">
          <p class="note">
            <template v-if="message"><span class="err">{{ message }}</span></template>
            <template v-else>열면 바로 모집이 시작돼요 · 3명이 모이면 시간을 잡을 수 있어요</template>
          </p>
          <button type="submit" class="btn primary go" :disabled="sending || !book">
            {{ sending ? '여는 중…' : '모임 열기' }}
          </button>
        </div>
      </form>
    </main>
  </div>
</template>

<style scoped>
.new-wrap { max-width: 640px; padding-top: 28px; }
.back { display: inline-block; font-size: 13.5px; color: var(--sub); margin-bottom: 18px; }
.back:hover { color: var(--ink); }
.page-head p { max-width: 46ch; }

.form { padding: 6px 28px 24px; }
.group { padding: 22px 0; border-top: 1px solid var(--line); }
.group:first-child { border-top: 0; padding-top: 18px; }
.group.two { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
.label { display: block; font-size: 11.5px; letter-spacing: 2.2px; color: var(--sub); margin-bottom: 10px; }
.label .opt { letter-spacing: 0; margin-left: 6px; color: var(--muted); }

.search { display: flex; gap: 8px; }
.search .input { flex: 1; min-width: 0; }
.find { flex: none; white-space: nowrap; padding: 9px 18px; }
.find:disabled { opacity: .45; cursor: default; }
.hint { margin: 10px 0 0; font-size: 13px; color: var(--sub); }

.results { list-style: none; margin: 10px 0 0; padding: 0; border: 1px solid var(--line); border-radius: 3px; overflow: hidden; }
.result { display: flex; align-items: center; gap: 12px; width: 100%; padding: 9px 12px; background: transparent; border: 0; border-top: 1px solid var(--line); text-align: left; cursor: pointer; font: inherit; color: var(--ink); }
.results li:first-child .result { border-top: 0; }
.result:hover { background: var(--hover); }
.result-cv { width: 28px; height: 40px; }
.result-body { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.result-body strong { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.result-go { font-size: 12.5px; color: var(--red); white-space: nowrap; }
.sub { font-size: 12.5px; color: var(--sub); margin-top: 2px; }

.picked { display: flex; align-items: center; gap: 14px; padding: 12px 14px; background: var(--card-2); border: 1px solid var(--line); border-radius: 3px; }
.picked-cv { width: 44px; height: 62px; }
.picked-body { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.picked-body strong { font-size: 15px; font-weight: 600; }
.text-btn { font: inherit; font-size: 13px; color: var(--sub); background: none; border: 0; cursor: pointer; padding: 4px 2px; white-space: nowrap; }
.text-btn:hover { color: var(--red); }

.input { box-sizing: border-box; }
textarea.input { resize: vertical; min-height: 120px; line-height: 1.55; }
.ta { position: relative; }
.count { position: absolute; right: 12px; bottom: 10px; font-size: 11.5px; color: var(--muted); pointer-events: none; }

.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip { font: inherit; font-size: 13.5px; padding: 6px 13px; }

.foot { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-top: 22px; border-top: 1px solid var(--line); }
.note { margin: 0; font-size: 13px; color: var(--sub); }
.err { color: var(--red); }
.go { flex: none; padding: 10px 22px; }
.go:disabled { opacity: .45; cursor: default; }

@media (max-width: 640px) {
  .form { padding: 4px 18px 18px; }
  .group.two { grid-template-columns: 1fr; gap: 18px; }
  .foot { flex-direction: column; align-items: stretch; }
  .go { width: 100%; }
}
</style>
