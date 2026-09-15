<script setup lang="ts">
import { MAX_TAGS, normalizeTag } from '#shared/utils/hashtags'

/**
 * 해시태그 칩 입력. Enter·쉼표·스페이스로 확정, 빈 칸에서 Backspace면 마지막 칩 삭제.
 * 한글 조합 중(isComposing)에는 키를 가로채지 않는다 — 조합 중 Enter로 글자가 잘리는 흔한 버그 방지.
 */
const props = withDefaults(
  defineProps<{ modelValue: string[]; suggestions?: string[]; placeholder?: string; compact?: boolean }>(),
  { suggestions: () => [], placeholder: '태그 입력 (Enter로 추가)', compact: false }
)
const emit = defineEmits<{ 'update:modelValue': [string[]] }>()

const draft = ref('')
const inputEl = ref<HTMLInputElement | null>(null)
const full = computed(() => props.modelValue.length >= MAX_TAGS)

function has(tag: string): boolean {
  const key = tag.toLowerCase()
  return props.modelValue.some((t) => t.toLowerCase() === key)
}

function add(raw: string) {
  const tag = normalizeTag(raw)
  draft.value = ''
  if (!tag || has(tag) || full.value) return
  emit('update:modelValue', [...props.modelValue, tag])
}

function remove(index: number) {
  emit('update:modelValue', props.modelValue.filter((_, i) => i !== index))
}

function onKeydown(e: KeyboardEvent) {
  if (e.isComposing) return
  const confirmKeys = ['Enter', ',', ' ']
  if (confirmKeys.includes(e.key)) {
    e.preventDefault()
    add(draft.value)
    return
  }
  if (e.key === 'Tab' && draft.value.trim()) {
    e.preventDefault()
    add(draft.value)
    return
  }
  if (e.key === 'Backspace' && !draft.value && props.modelValue.length) {
    remove(props.modelValue.length - 1)
  }
}

const visibleSuggestions = computed(() => props.suggestions.filter((s) => !has(s)).slice(0, 8))

function focus() {
  inputEl.value?.focus()
}
</script>

<template>
  <div class="tags" :class="{ compact }">
    <div class="field" :class="{ full }" @click="focus">
      <span v-if="!modelValue.length" class="hash" aria-hidden="true">#</span>
      <span v-for="(tag, i) in modelValue" :key="tag" class="tag">
        {{ tag }}
        <button type="button" class="x" :aria-label="`${tag} 태그 제거`" @click.stop="remove(i)">×</button>
      </span>
      <input
        ref="inputEl"
        v-model="draft"
        type="text"
        class="draft"
        :placeholder="modelValue.length ? (full ? '' : '더 추가...') : placeholder"
        :disabled="full"
        :aria-label="placeholder"
        maxlength="24"
        autocomplete="off"
        @keydown="onKeydown"
        @blur="add(draft)"
      >
      <span class="count" :class="{ max: full }">{{ modelValue.length }}/{{ MAX_TAGS }}</span>
    </div>
    <div v-if="visibleSuggestions.length && !full" class="sugg">
      <button v-for="s in visibleSuggestions" :key="s" type="button" class="sugg-chip" @click="add(s)">#{{ s }}</button>
    </div>
  </div>
</template>

<style scoped>
.tags { display: flex; flex-direction: column; gap: 8px; }
.field { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--card); cursor: text; min-height: 42px; transition: border-color .15s; }
.field:focus-within { border-color: var(--red); }
.hash { color: var(--muted); font-weight: 700; font-size: 14px; margin-right: -2px; }
.tag { display: inline-flex; align-items: center; padding: 3px 4px 3px 9px; border-radius: 999px; background: var(--red-tint); color: var(--red); font-size: 12.5px; font-weight: 700; line-height: 1.3; }
.tag::before { content: '#'; opacity: .55; font-weight: 600; }
.tag .x { border: 0; background: none; margin-left: 2px; color: inherit; font-size: 14px; line-height: 1; width: 18px; height: 18px; border-radius: 50%; cursor: pointer; padding: 0; opacity: .7; }
.tag .x:hover { opacity: 1; background: rgba(0, 0, 0, .08); }
.draft { flex: 1; min-width: 90px; border: 0; outline: 0; background: transparent; font: inherit; font-size: 13.5px; color: var(--ink); padding: 3px 0; }
.draft::placeholder { color: var(--muted); }
.count { font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; margin-left: auto; }
.count.max { color: var(--red); }
.sugg { display: flex; flex-wrap: wrap; gap: 6px; }
.sugg-chip { border: 1px solid var(--line); background: transparent; color: var(--sub); font: inherit; font-size: 12px; padding: 4px 10px; border-radius: 999px; cursor: pointer; }
.sugg-chip:hover { color: var(--red); border-color: var(--red); background: var(--red-tint); }
.compact .field { padding: 6px 8px; min-height: 36px; }
</style>
