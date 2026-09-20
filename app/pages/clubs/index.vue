<script setup lang="ts">
import type { Club } from '#shared/types'

interface GroupedClubs {
  invites: Club[]
  needsResponse: Club[]
  active: Club[]
  past: Club[]
}

const api = useApi()
const { data, pending } = await useAsyncData<GroupedClubs>(
  'my-clubs',
  () => api<GroupedClubs>('/api/clubs'),
  { default: () => ({ invites: [], needsResponse: [], active: [], past: [] }) }
)

const empty = computed(
  () =>
    data.value.invites.length === 0 &&
    data.value.needsResponse.length === 0 &&
    data.value.active.length === 0 &&
    data.value.past.length === 0
)
</script>

<template>
  <div>
    <CommonAppHeader active="clubs" />
    <main class="wrap">
      <h1>책모임</h1>
      <p class="lead">같은 책을 읽은 동료를 책벗이 찾아 모임을 제안해요.</p>

      <p v-if="pending" class="empty">불러오는 중…</p>
      <p v-else-if="empty" class="empty">
        아직 초대된 모임이 없어요. 책을 완독하면 같은 책을 읽은 동료와 묶어 제안드릴게요.
      </p>

      <section v-if="data.invites.length > 0">
        <h2>나의 초대 ({{ data.invites.length }})</h2>
        <div class="list">
          <ClubCard v-for="c in data.invites" :key="c.id" :club="c" show-deadline />
        </div>
      </section>

      <section v-if="data.needsResponse.length > 0">
        <h2>내 응답이 필요해요</h2>
        <div class="list">
          <ClubCard v-for="c in data.needsResponse" :key="c.id" :club="c" />
        </div>
      </section>

      <section v-if="data.active.length > 0">
        <h2>참여 중</h2>
        <div class="list">
          <ClubCard v-for="c in data.active" :key="c.id" :club="c" />
        </div>
      </section>

      <section v-if="data.past.length > 0">
        <h2>지난 모임</h2>
        <div class="list">
          <ClubCard v-for="c in data.past" :key="c.id" :club="c" />
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.wrap { max-width: 880px; margin: 0 auto; padding: 24px 16px 60px; }
h1 { font-size: 24px; margin: 0 0 4px; }
.lead { color: var(--muted, #666); font-size: 14px; margin: 0 0 24px; }
h2 { font-size: 16px; margin: 24px 0 10px; }
.list { display: grid; gap: 10px; }
.empty { color: var(--muted, #666); font-size: 14px; }
</style>
