<script setup lang="ts">
import type { Book, Loan } from '#shared/types'
import { extractHashtags } from '#shared/utils/hashtags'

/**
 * 새 게시물 모달 — 인스타 "새 게시물 만들기" 흐름.
 * 1단계: 사진 드롭존(끌어다 놓기 / 컴퓨터에서 선택) → 2단계: 왼쪽 사진 미리보기·썸네일 스트립,
 * 오른쪽 문구·해시태그·책 태그. 헤더 오른쪽 "공유하기"로 올린다.
 */

type LoanWithBook = Loan & { book: Book }

interface SelectedImage {
  file: File
  url: string
}

const MAX_IMAGES = 5
const MAX_CAPTION = 1000

const emit = defineEmits<{ created: []; cancel: [] }>()

const api = useApi()
const { user } = useCurrentUser()

const fileInput = ref<HTMLInputElement | null>(null)
const images = ref<SelectedImage[]>([])
const activeIndex = ref(0)
const caption = ref('')
const tags = ref<string[]>([])
const submitting = ref(false)
const dragOver = ref(false)
const captionEl = ref<HTMLTextAreaElement | null>(null)

/** 캡션 안에 직접 쓴 #태그 — 서버가 자동으로 합쳐 주므로 안내만 한다. */
const captionTags = computed(() =>
  extractHashtags(caption.value).filter((t) => !tags.value.some((x) => x.toLowerCase() === t.toLowerCase()))
)

// ── 인기 태그 제안(빈 피드면 기본 제안) ──
const DEFAULT_TAGS = ['점심독서', '완독', '퇴근후한챕터', '주말독서', '추천']
const popularTags = ref<string[]>(DEFAULT_TAGS)

// ── 책 태그: 전체 도서에서 검색해 선택한다(QA #7·#11 — 대출 이력이 없어도 태그 가능). ──
const bookOpen = ref(false)
const selectedBook = ref<Book | null>(null)
const bookQuery = ref('')
const bookResults = ref<Book[]>([])
const bookSearching = ref(false)
const bookInput = ref<HTMLInputElement | null>(null)
/** 검색어가 비어 있을 때 보여줄 제안: 내가 빌렸던(읽고 있는·읽은) 책. */
const myBooks = ref<Book[]>([])

onMounted(async () => {
  document.addEventListener('keydown', onKey)
  document.body.style.overflow = 'hidden'
  try {
    const [active, done, popular] = await Promise.all([
      api<LoanWithBook[]>('/api/loans', { query: { active: true } }),
      api<LoanWithBook[]>('/api/loans', { query: { returned: true } }),
      api<{ tag: string; count: number }[]>('/api/posts/tags').catch(() => []),
    ])
    const seen = new Set<number>()
    const result: Book[] = []
    for (const loan of [...active, ...done]) {
      if (seen.has(loan.book.id)) continue
      seen.add(loan.book.id)
      result.push(loan.book)
    }
    myBooks.value = result
    if (popular.length) popularTags.value = popular.map((p) => p.tag)
  } catch {
    myBooks.value = []
  }
})

let searchTimer: ReturnType<typeof setTimeout> | undefined
let searchSeq = 0 // 응답 역전 가드 — 늦게 도착한 옛 검색 결과가 최신 목록을 덮지 않게(QA #46)
watch(bookQuery, (q) => {
  clearTimeout(searchTimer)
  const keyword = q.trim()
  const seq = ++searchSeq
  if (!keyword) {
    bookResults.value = []
    bookSearching.value = false
    return
  }
  bookSearching.value = true
  searchTimer = setTimeout(async () => {
    try {
      const found = await api<Book[]>('/api/books', { query: { query: keyword } })
      if (seq !== searchSeq) return // 그 사이 새 검색이 시작됐다 — 이 결과는 버린다
      bookResults.value = found.slice(0, 8)
    } catch {
      if (seq === searchSeq) bookResults.value = []
    } finally {
      if (seq === searchSeq) bookSearching.value = false
    }
  }, 250)
})

/** 드롭다운에 실제로 보여줄 목록: 검색어가 있으면 검색 결과, 없으면 내 책 제안. */
const suggestions = computed(() => (bookQuery.value.trim() ? bookResults.value : myBooks.value.slice(0, 8)))

async function toggleBook() {
  bookOpen.value = !bookOpen.value
  if (bookOpen.value) {
    await nextTick()
    bookInput.value?.focus()
  }
}

function pickBook(book: Book) {
  selectedBook.value = book
  bookQuery.value = ''
  bookResults.value = []
  bookOpen.value = false
}

function clearBook() {
  selectedBook.value = null
}

// ── 사진 ──
function revokeAllPreviews() {
  for (const img of images.value) URL.revokeObjectURL(img.url)
  images.value = []
  activeIndex.value = 0
}

/** 선택할 때마다 기존 목록에 누적 추가(인스타식). 5장 초과분은 무시하고 알린다. */
function addFiles(files: File[]) {
  if (files.length === 0) return
  const room = MAX_IMAGES - images.value.length
  if (room <= 0) {
    alert('사진은 최대 5장까지예요')
    return
  }
  if (files.length > room) alert('사진은 최대 5장까지예요')

  const before = images.value.length
  for (const file of files.slice(0, room)) {
    // 업로드가 조용히 실패하는 흔한 원인 두 가지를 선택 시점에 잡아준다(QA #42):
    // 지원하지 않는 형식(아이폰 HEIC 등)과 과대 용량.
    if (!/^image\/(jpe?g|png|webp|gif)$/i.test(file.type)) {
      alert(`"${file.name}"은(는) 지원하지 않는 형식이에요. jpg·png·webp·gif만 올릴 수 있어요.`)
      continue
    }
    if (file.size > 8 * 1024 * 1024) {
      alert(`"${file.name}"이(가) 너무 커요(8MB 초과). 스크린샷이나 압축본으로 올려주세요.`)
      continue
    }
    images.value.push({ file, url: URL.createObjectURL(file) })
  }
  if (before === 0 && images.value.length > 0) {
    activeIndex.value = 0
    nextTick(() => captionEl.value?.focus())
  }
}

function handleFileChange(e: Event) {
  const target = e.target as HTMLInputElement
  const files = target.files ? Array.from(target.files) : []
  target.value = '' // 같은 파일을 다시 선택할 수 있도록 초기화
  addFiles(files)
}

function onDrop(e: DragEvent) {
  dragOver.value = false
  const files = e.dataTransfer?.files ? Array.from(e.dataTransfer.files) : []
  addFiles(files)
}

function removeImage(index: number) {
  const [removed] = images.value.splice(index, 1)
  if (removed) URL.revokeObjectURL(removed.url)
  if (activeIndex.value >= images.value.length) activeIndex.value = Math.max(0, images.value.length - 1)
}

function prevPhoto() {
  if (activeIndex.value > 0) activeIndex.value--
}

function nextPhoto() {
  if (activeIndex.value < images.value.length - 1) activeIndex.value++
}

/** 썸네일을 대표(첫 장)로 올린다. */
function makeCover(index: number) {
  if (index === 0) return
  const [img] = images.value.splice(index, 1)
  if (img) images.value.unshift(img)
  activeIndex.value = 0
}

// ── 닫기·제출 ──
const hasContent = computed(() => images.value.length > 0 || caption.value.trim().length > 0 || tags.value.length > 0)

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') cancel()
}

onBeforeUnmount(() => {
  clearTimeout(searchTimer)
  revokeAllPreviews()
  document.removeEventListener('keydown', onKey)
  document.body.style.overflow = ''
})

function cancel() {
  if (submitting.value) return
  if (hasContent.value && !confirm('작성 중인 게시물을 버릴까요?')) return
  emit('cancel')
}

async function submit() {
  if (submitting.value) return
  if (images.value.length === 0) {
    alert('사진을 선택해주세요')
    return
  }
  submitting.value = true
  try {
    const formData = new FormData()
    for (const img of images.value) formData.append('image', img.file)
    if (caption.value.trim()) formData.append('caption', caption.value.trim())
    if (selectedBook.value) formData.append('bookId', String(selectedBook.value.id))
    if (tags.value.length) formData.append('tags', JSON.stringify(tags.value))
    await api('/api/posts', { method: 'POST', body: formData })

    revokeAllPreviews()
    caption.value = ''
    tags.value = []
    selectedBook.value = null
    bookQuery.value = ''
    if (fileInput.value) fileInput.value.value = ''
    emit('created')
  } catch (e) {
    alert(apiErrorMessage(e))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="overlay" @mousedown.self="cancel">
      <div
        class="modal"
        :class="{ 'has-photos': images.length > 0, over: dragOver }"
        role="dialog"
        aria-modal="true"
        aria-label="새 게시물 만들기"
        @dragenter.prevent="dragOver = true"
        @dragover.prevent="dragOver = true"
        @dragleave.self="dragOver = false"
        @drop.prevent="onDrop"
      >
        <header class="mh">
          <button type="button" class="mh-btn" aria-label="닫기" @click="cancel">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>
          </button>
          <h2>새 게시물 만들기</h2>
          <button type="button" class="mh-btn share" :disabled="submitting || images.length === 0" @click="submit">
            {{ submitting ? '올리는 중…' : '공유하기' }}
          </button>
        </header>

        <input ref="fileInput" type="file" accept="image/*" multiple hidden @change="handleFileChange">

        <!-- 1단계: 사진 드롭존 -->
        <div v-if="images.length === 0" class="drop">
          <svg class="drop-ico" width="84" height="84" viewBox="0 0 96 96" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">
            <rect x="12" y="24" width="56" height="48" rx="6" />
            <path d="M24 66l14-16 10 11 8-8 12 13" />
            <circle cx="52" cy="40" r="5" />
            <path d="M74 20a6 6 0 0 1 6 6v38" />
            <path d="M84 12l-6-6m6 6l-6 6m6-6H70" />
          </svg>
          <p class="drop-title">사진을 여기에 끌어다 놓으세요</p>
          <p class="drop-sub">jpg · png · webp · gif, 한 장 8MB, 최대 {{ MAX_IMAGES }}장</p>
          <button type="button" class="btn primary" @click="fileInput?.click()">컴퓨터에서 선택</button>
        </div>

        <!-- 2단계: 사진 + 문구 -->
        <div v-else class="split">
          <div class="preview">
            <div class="stage">
              <img :src="images[activeIndex]?.url" alt="선택한 사진 미리보기">
              <template v-if="images.length > 1">
                <button type="button" class="nav prev" :disabled="activeIndex === 0" aria-label="이전 사진" @click="prevPhoto">‹</button>
                <button type="button" class="nav next" :disabled="activeIndex === images.length - 1" aria-label="다음 사진" @click="nextPhoto">›</button>
                <div class="dots">
                  <span v-for="(img, i) in images" :key="img.url" class="dot" :class="{ on: i === activeIndex }" />
                </div>
              </template>
              <div class="counter">{{ activeIndex + 1 }}/{{ images.length }}</div>
            </div>
            <div class="strip">
              <div v-for="(img, i) in images" :key="img.url" class="thumb" :class="{ on: i === activeIndex }">
                <button type="button" class="thumb-btn" :aria-label="`${i + 1}번째 사진 보기`" @click="activeIndex = i">
                  <img :src="img.url" alt="">
                </button>
                <span v-if="i === 0" class="cover-badge">대표</span>
                <button v-else type="button" class="thumb-act cover" title="대표 사진으로" aria-label="대표 사진으로" @click="makeCover(i)">★</button>
                <button type="button" class="thumb-act rm" aria-label="사진 제거" @click="removeImage(i)">×</button>
              </div>
              <button
                v-if="images.length < MAX_IMAGES"
                type="button" class="thumb add" aria-label="사진 추가" @click="fileInput?.click()"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                <small>{{ images.length }}/{{ MAX_IMAGES }}</small>
              </button>
            </div>
          </div>

          <div class="side">
            <div class="author">
              <span class="avatar">{{ user?.name?.charAt(0) ?? '?' }}</span>
              <div class="author-txt">
                <b>{{ user?.name ?? '나' }}</b>
                <span v-if="user?.department">{{ user.department }}</span>
              </div>
            </div>

            <textarea
              ref="captionEl"
              v-model="caption"
              class="caption"
              :maxlength="MAX_CAPTION"
              placeholder="문구 입력... (#태그를 문구에 직접 써도 돼요)"
            />
            <div class="cap-meta">
              <span v-if="captionTags.length" class="cap-tags">
                문구의 <b v-for="t in captionTags" :key="t">#{{ t }}</b> 도 태그로 붙어요
              </span>
              <span class="cap-count">{{ caption.length }}/{{ MAX_CAPTION }}</span>
            </div>

            <div class="sec">
              <div class="sec-h">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" /><line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" /></svg>
                해시태그
              </div>
              <FeedTagInput v-model="tags" :suggestions="popularTags" placeholder="태그 입력 (Enter·스페이스로 추가)" />
            </div>

            <div class="sec">
              <div v-if="selectedBook" class="picked">
                <BookCoverImage :src="selectedBook.coverUrl" :alt="selectedBook.title" />
                <div class="picked-info">
                  <b>{{ selectedBook.title }}</b>
                  <span>{{ selectedBook.author }}</span>
                </div>
                <button type="button" class="remove-book" aria-label="책 태그 제거" @click="clearBook">×</button>
              </div>
              <template v-else>
                <button type="button" class="row-btn" :class="{ open: bookOpen }" @click="toggleBook">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 0-3 3z" /><path d="M4 4v16a3 3 0 0 1 3-3h11" /></svg>
                  책 태그하기
                  <span class="opt">선택</span>
                  <svg class="chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6l6 6-6 6" /></svg>
                </button>
                <div v-if="bookOpen" class="book-picker">
                  <input
                    ref="bookInput"
                    v-model="bookQuery"
                    type="search"
                    class="book-q"
                    placeholder="제목·저자로 검색"
                  >
                  <div v-if="bookSearching" class="picker-hint">검색 중...</div>
                  <div v-else-if="bookQuery.trim() && suggestions.length === 0" class="picker-hint">검색 결과가 없어요</div>
                  <div v-else-if="suggestions.length" class="picker-list">
                    <div v-if="!bookQuery.trim()" class="picker-label">내가 빌렸던 책</div>
                    <button v-for="b in suggestions" :key="b.id" type="button" class="picker-item" @click="pickBook(b)">
                      <BookCoverImage :src="b.coverUrl" :alt="b.title" />
                      <span class="pi-title">{{ b.title }}</span>
                      <span class="pi-author">{{ b.author }}</span>
                    </button>
                  </div>
                  <div v-else class="picker-hint">빌린 책이 없어요. 제목이나 저자로 검색해보세요.</div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.overlay { position: fixed; inset: 0; z-index: 200; background: rgba(20, 16, 10, .62); display: flex; align-items: center; justify-content: center; padding: 20px; backdrop-filter: blur(2px); }
.modal { width: min(960px, 100%); max-height: min(720px, 100%); display: flex; flex-direction: column; background: var(--card); border-radius: 14px; box-shadow: 0 30px 80px rgba(0, 0, 0, .45); overflow: hidden; border: 1px solid var(--line); }
.modal.over { outline: 2px dashed var(--red); outline-offset: -6px; }

.mh { display: flex; align-items: center; justify-content: space-between; height: 48px; padding: 0 8px 0 6px; border-bottom: 1px solid var(--line); flex-shrink: 0; }
.mh h2 { margin: 0; font-size: 15px; font-weight: 700; }
.mh-btn { border: 0; background: none; font: inherit; font-size: 14px; font-weight: 700; color: var(--ink); cursor: pointer; padding: 8px 10px; border-radius: 6px; display: flex; align-items: center; }
.mh-btn:hover { background: var(--hover); }
.mh-btn.share { color: var(--red); }
.mh-btn.share:disabled { color: var(--muted); cursor: default; background: none; }

/* 1단계 드롭존 */
.drop { flex: 1; min-height: 460px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--ink); text-align: center; padding: 30px; }
.drop-ico { color: var(--ink); opacity: .85; margin-bottom: 8px; }
.modal.over .drop-ico { color: var(--red); opacity: 1; }
.drop-title { margin: 0; font-size: 19px; font-weight: 500; }
.drop-sub { margin: 0 0 14px; font-size: 12.5px; color: var(--sub); }

/* 2단계 */
.split { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(300px, 340px); flex: 1; min-height: 0; }
.preview { display: flex; flex-direction: column; background: #16130E; min-height: 0; border-right: 1px solid var(--line); }
.stage { position: relative; flex: 1; min-height: 360px; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.stage img { max-width: 100%; max-height: 100%; width: 100%; height: 100%; object-fit: contain; display: block; }
.nav { position: absolute; top: 50%; transform: translateY(-50%); width: 30px; height: 30px; border-radius: 50%; border: 0; background: rgba(255, 255, 255, .85); color: #111; font-size: 20px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0 0 2px; }
.nav:hover:not(:disabled) { background: #fff; }
.nav:disabled { opacity: 0; pointer-events: none; }
.nav.prev { left: 12px; }
.nav.next { right: 12px; }
.dots { position: absolute; bottom: 12px; left: 0; right: 0; display: flex; justify-content: center; gap: 5px; }
.dot { width: 6px; height: 6px; border-radius: 50%; background: rgba(255, 255, 255, .45); }
.dot.on { background: var(--red); }
.counter { position: absolute; top: 12px; right: 12px; background: rgba(0, 0, 0, .55); color: #fff; font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 999px; }

.strip { display: flex; gap: 8px; padding: 10px 12px; overflow-x: auto; background: rgba(0, 0, 0, .35); scrollbar-width: thin; flex-shrink: 0; }
.thumb { position: relative; width: 60px; height: 60px; flex-shrink: 0; border-radius: 6px; overflow: hidden; border: 2px solid transparent; background: #222; }
.thumb.on { border-color: var(--red); }
.thumb-btn { border: 0; padding: 0; background: none; width: 100%; height: 100%; cursor: pointer; display: block; }
.thumb-btn img { width: 100%; height: 100%; object-fit: cover; display: block; opacity: .85; }
.thumb.on .thumb-btn img { opacity: 1; }
.cover-badge { position: absolute; left: 0; bottom: 0; background: var(--red); color: #fff; font-size: 9.5px; font-weight: 700; padding: 1px 6px; border-radius: 0 5px 0 0; }
.thumb-act { position: absolute; top: 2px; width: 18px; height: 18px; border-radius: 50%; border: 0; background: rgba(0, 0, 0, .6); color: #fff; font-size: 12px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; opacity: 0; transition: opacity .12s; }
.thumb:hover .thumb-act, .thumb:focus-within .thumb-act { opacity: 1; }
.thumb-act.rm { right: 2px; }
.thumb-act.cover { left: 2px; font-size: 10px; }
.thumb-act:hover { background: rgba(0, 0, 0, .85); }
.thumb.add { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; border: 1.5px dashed rgba(255, 255, 255, .4); background: transparent; color: rgba(255, 255, 255, .8); cursor: pointer; }
.thumb.add small { font-size: 10px; opacity: .8; }
.thumb.add:hover { border-color: #fff; color: #fff; }

.side { display: flex; flex-direction: column; min-height: 0; overflow-y: auto; }
.author { display: flex; align-items: center; gap: 10px; padding: 14px 16px 8px; }
.author-txt b { display: block; font-size: 13.5px; }
.author-txt span { font-size: 11.5px; color: var(--sub); }
.caption { border: 0; outline: 0; resize: none; background: transparent; font: inherit; font-size: 14.5px; line-height: 1.6; color: var(--ink); padding: 4px 16px; min-height: 150px; }
.caption::placeholder { color: var(--muted); }
.cap-meta { display: flex; align-items: flex-end; justify-content: space-between; gap: 10px; padding: 0 16px 10px; border-bottom: 1px solid var(--line); }
.cap-tags { font-size: 11.5px; color: var(--sub); line-height: 1.5; }
.cap-tags b { color: var(--red); font-weight: 600; margin-right: 3px; }
.cap-count { font-size: 11px; color: var(--muted); margin-left: auto; font-variant-numeric: tabular-nums; white-space: nowrap; }

.sec { padding: 12px 16px; border-bottom: 1px solid var(--line); }
.sec-h { display: flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 700; margin-bottom: 8px; }
.row-btn { width: 100%; display: flex; align-items: center; gap: 8px; border: 0; background: none; font: inherit; font-size: 14px; font-weight: 600; color: var(--ink); padding: 4px 0; cursor: pointer; text-align: left; }
.row-btn .opt { font-size: 11.5px; color: var(--muted); font-weight: 500; }
.row-btn .chev { margin-left: auto; color: var(--muted); transition: transform .15s; }
.row-btn.open .chev { transform: rotate(90deg); }
.book-picker { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.book-q { font: inherit; font-size: 13.5px; color: var(--ink); background: var(--card-2); border: 1px solid var(--line); border-radius: 8px; padding: 8px 12px; outline: 0; width: 100%; }
.book-q:focus { border-color: var(--red); }
.picker-hint { font-size: 12.5px; color: var(--sub); padding: 2px 2px 0; }
.picker-label { font-size: 11.5px; font-weight: 700; color: var(--sub); padding: 4px 4px 0; }
.picker-list { display: flex; flex-direction: column; border: 1px solid var(--line); border-radius: 8px; max-height: 220px; overflow-y: auto; background: var(--card); }
.picker-item { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border: 0; background: none; cursor: pointer; font: inherit; text-align: left; border-bottom: 1px solid var(--line); }
.picker-item:last-child { border-bottom: 0; }
.picker-item:hover { background: var(--red-tint); }
.picker-item :deep(.cv), .picked :deep(.cv) { width: 26px; height: 38px; border-radius: 1px 3px 3px 1px; box-shadow: 1px 2px 4px var(--shadow-strong); }
.pi-title { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pi-author { font-size: 12px; color: var(--sub); margin-left: auto; flex-shrink: 0; }
.picked { display: flex; align-items: center; gap: 10px; }
.picked-info { flex: 1; min-width: 0; }
.picked-info b { display: block; font-size: 13.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.picked-info span { font-size: 12px; color: var(--sub); }
.remove-book { border: 0; background: none; font-size: 18px; color: var(--sub); cursor: pointer; padding: 0 4px; }
.remove-book:hover { color: var(--red); }

@media (max-width: 760px) {
  .overlay { padding: 0; }
  .modal { width: 100%; height: 100%; max-height: none; border-radius: 0; border: 0; }
  .split { grid-template-columns: 1fr; overflow-y: auto; }
  .preview { border-right: 0; border-bottom: 1px solid var(--line); }
  .stage { min-height: 0; aspect-ratio: 1 / 1; max-height: 46vh; flex: none; }
  .side { overflow: visible; }
  .caption { min-height: 110px; }
  .drop { min-height: 0; flex: 1; }
}
</style>
