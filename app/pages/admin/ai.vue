<script setup lang="ts">
import type { AiSetting, AiUsageRecord, AiUsageSummary } from '#shared/types'

interface FeatureMeta {
  key: string
  title: string
}

const FEATURES: FeatureMeta[] = [
  { key: 'chat', title: '책벗 챗봇' },
  { key: 'search', title: 'AI 검색' },
  { key: 'places', title: '장소 큐레이션' },
]

const MODEL_OPTIONS = ['claude-sonnet-5', 'claude-opus-5', 'claude-haiku-4-5-20251001']

interface FormState {
  systemPrompt: string
  model: string
  maxTokens: number
  temperature: number
  recursionLimit: number | null
}

const api = useApi()

const forms = ref<Record<string, FormState>>({})
const loading = ref(false)
const busyKey = ref<string | null>(null)
const savedKey = ref<string | null>(null)
let savedTimer: ReturnType<typeof setTimeout> | undefined

function toForm(s: AiSetting): FormState {
  return {
    systemPrompt: s.systemPrompt,
    model: s.model,
    maxTokens: s.maxTokens,
    temperature: s.temperature,
    recursionLimit: s.recursionLimit,
  }
}

async function loadSettings() {
  loading.value = true
  try {
    const rows = await api<AiSetting[]>('/api/admin/ai-settings')
    const next: Record<string, FormState> = {}
    for (const row of rows) next[row.featureKey] = toForm(row)
    forms.value = next
  } catch (e) {
    alert(apiErrorMessage(e))
  } finally {
    loading.value = false
  }
}

const usage = ref<{ summary: AiUsageSummary; recent: AiUsageRecord[] } | null>(null)

async function loadUsage() {
  try {
    usage.value = await api<{ summary: AiUsageSummary; recent: AiUsageRecord[] }>('/api/admin/ai-usage')
  } catch (e) {
    alert(apiErrorMessage(e))
  }
}

onMounted(() => {
  loadSettings()
  loadUsage()
})

function flashSaved(key: string) {
  savedKey.value = key
  if (savedTimer) clearTimeout(savedTimer)
  savedTimer = setTimeout(() => {
    if (savedKey.value === key) savedKey.value = null
  }, 2000)
}

async function save(key: string) {
  const form = forms.value[key]
  if (!form || busyKey.value !== null) return
  busyKey.value = key
  try {
    await api<AiSetting>(`/api/admin/ai-settings/${key}`, {
      method: 'PATCH',
      body: {
        systemPrompt: form.systemPrompt,
        model: form.model,
        maxTokens: form.maxTokens,
        temperature: form.temperature,
        recursionLimit: form.recursionLimit,
      },
    })
    await loadUsage()
    flashSaved(key)
  } catch (e) {
    alert(apiErrorMessage(e))
  } finally {
    busyKey.value = null
  }
}

async function resetDefault(key: string) {
  if (busyKey.value !== null) return
  if (!confirm('기본값으로 되돌릴까요? 지금 입력한 내용은 사라져요.')) return
  busyKey.value = key
  try {
    const reset = await api<AiSetting>(`/api/admin/ai-settings/${key}/reset`, { method: 'POST' })
    forms.value[key] = toForm(reset)
    flashSaved(key)
  } catch (e) {
    alert(apiErrorMessage(e))
  } finally {
    busyKey.value = null
  }
}

function formatWhen(iso: string): string {
  const d = parseDbDate(iso)
  return `${d.getMonth() + 1}. ${d.getDate()}. ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const FEATURE_LABEL: Record<string, string> = { chat: '챗봇', search: 'AI 검색', places: '장소 큐레이션' }
</script>

<template>
  <div>
    <AdminHeader active="ai" />
    <div class="wrap">
      <div class="page-head">
        <span class="eyebrow">AI OPERATIONS</span>
        <h1>AI 설정</h1>
      </div>

      <div class="warning-banner">
        프롬프트의 JSON 응답 형식·경로 목록 지시를 지우면 버튼·책 카드가 동작하지 않을 수 있어요
      </div>

      <div class="stat-tiles">
        <div class="tile">
          <div class="lbl">오늘 호출 수</div>
          <b>{{ usage?.summary.today.calls ?? 0 }}</b><span class="unit">회</span>
        </div>
        <div class="tile">
          <div class="lbl">오늘 토큰(입력+출력)</div>
          <b>{{ (usage?.summary.today.inputTokens ?? 0) + (usage?.summary.today.outputTokens ?? 0) }}</b>
        </div>
        <div class="tile">
          <div class="lbl">누적 토큰</div>
          <b>{{ (usage?.summary.total.inputTokens ?? 0) + (usage?.summary.total.outputTokens ?? 0) }}</b>
        </div>
      </div>

      <p v-if="loading" class="hint">불러오는 중…</p>

      <template v-else>
        <div v-for="feature in FEATURES" :key="feature.key" class="panel feature-panel">
          <div class="sec-head" style="margin-top:0;">
            <h2>{{ feature.title }}</h2>
            <div class="rule" />
            <span v-if="savedKey === feature.key" class="saved-flag">저장했어요</span>
          </div>

          <template v-if="forms[feature.key]">
            <label class="field-label">시스템 프롬프트</label>
            <textarea v-model="forms[feature.key].systemPrompt" class="input prompt-area" rows="12" spellcheck="false" />

            <div class="field-grid">
              <div>
                <label class="field-label">모델</label>
                <input
                  v-model="forms[feature.key].model"
                  class="input"
                  :list="`model-options-${feature.key}`"
                  placeholder="claude-sonnet-5"
                >
                <datalist :id="`model-options-${feature.key}`">
                  <option v-for="m in MODEL_OPTIONS" :key="m" :value="m" />
                </datalist>
              </div>
              <div>
                <label class="field-label">maxTokens</label>
                <input v-model.number="forms[feature.key].maxTokens" class="input" type="number" min="1" max="8000">
              </div>
              <div>
                <label class="field-label">temperature</label>
                <input
                  v-model.number="forms[feature.key].temperature"
                  class="input"
                  type="number"
                  min="0"
                  max="1"
                  step="0.1"
                >
              </div>
              <div>
                <label class="field-label">recursionLimit</label>
                <input
                  v-model.number="forms[feature.key].recursionLimit"
                  class="input"
                  type="number"
                  min="1"
                  max="25"
                  placeholder="없음"
                >
              </div>
            </div>

            <div class="panel-actions">
              <button type="button" class="btn primary sm" :disabled="busyKey !== null" @click="save(feature.key)">저장</button>
              <button type="button" class="btn sm" :disabled="busyKey !== null" @click="resetDefault(feature.key)">기본값 복원</button>
            </div>
          </template>
        </div>
      </template>

      <div class="sec-head">
        <h2>최근 호출 20건</h2>
        <div class="rule" />
      </div>
      <div class="panel" style="padding: 8px 14px;">
        <div v-if="usage?.recent.length" class="table-scroll"><table class="usage-table table">
          <tbody>
            <tr>
              <th style="width: 90px;">시간</th>
              <th style="width: 100px;">기능</th>
              <th style="width: 120px;">사용자</th>
              <th>모델</th>
              <th style="width: 90px;">in / out</th>
              <th style="width: 70px;">ms</th>
            </tr>
            <tr v-for="row in usage.recent" :key="row.id">
              <td style="color: var(--sub); font-size: 12.5px;">{{ formatWhen(row.createdAt) }}</td>
              <td>{{ FEATURE_LABEL[row.featureKey] ?? row.featureKey }}</td>
              <td>{{ row.userName ?? '탈퇴/리셋' }}</td>
              <td style="font-size: 12.5px;">{{ row.model }}</td>
              <td>{{ row.inputTokens }} / {{ row.outputTokens }}</td>
              <td>{{ row.durationMs }}</td>
            </tr>
          </tbody>
        </table></div>
        <div v-else class="hint">아직 호출 기록이 없어요</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.warning-banner {
  background: var(--warn-tint);
  color: var(--warn);
  border: 1px solid var(--warn);
  border-radius: 4px;
  padding: 10px 14px;
  font-size: 13px;
  margin-bottom: 24px;
}
.stat-tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-bottom: 34px; }
.tile { background: var(--card); border: 1px solid var(--line); border-radius: 4px; padding: 18px 20px; box-shadow: 0 2px 10px rgba(84,70,45,.06); }
.tile .lbl { font-size: 12.5px; color: var(--sub); margin-bottom: 8px; }
.tile b { font-family: "Noto Serif KR", serif; font-size: 26px; font-weight: 600; }
.tile .unit { font-size: 14px; color: var(--sub); margin-left: 4px; }

.feature-panel { margin-bottom: 26px; }
.field-label { display: block; font-size: 12px; color: var(--sub); margin-bottom: 6px; margin-top: 14px; }
.prompt-area { font-family: "SFMono-Regular", Consolas, Menlo, monospace; font-size: 12px; line-height: 1.55; resize: vertical; }
.field-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
.panel-actions { display: flex; gap: 8px; margin-top: 18px; align-items: center; }
.saved-flag { font-size: 12.5px; color: var(--ok); margin-left: auto; }
.hint { color: var(--sub); font-size: 14px; padding: 14px 0; }

@media (max-width: 760px) {
  .field-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 640px) {
  .stat-tiles { grid-template-columns: 1fr; gap: 12px; margin-bottom: 24px; }
  .prompt-area { font-size: 11.5px; }
  .field-grid { gap: 10px; }
  .feature-panel .sec-head { flex-wrap: wrap; }
  .usage-table { min-width: 620px; }
}
</style>
