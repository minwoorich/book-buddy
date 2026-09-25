<script setup lang="ts">
import type { Club, GroupedClubs } from '#shared/types'

const api = useApi()
const { data, pending } = await useAsyncData<GroupedClubs>(
  'my-clubs',
  () => api<GroupedClubs>('/api/clubs'),
  { default: () => ({ invites: [], needsResponse: [], active: [], past: [] }) }
)
const { data: open } = await useAsyncData<Club[]>(
  'open-clubs',
  () => api<Club[]>('/api/clubs/open'),
  { default: () => [] }
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
      <div class="head">
        <div>
          <h1>책모임</h1>
          <p class="lead">같은 책을 읽은 동료를 책벗이 찾아 제안하고, 직접 열 수도 있어요.</p>
        </div>
        <NuxtLink class="new-btn" to="/clubs/new">모임 만들기</NuxtLink>
      </div>

      <section v-if="open.length > 0">
        <h2>열려 있는 모임 ({{ open.length }})</h2>
        <div class="list">
          <ClubCard v-for="c in open" :key="c.id" :club="c" open />
        </div>
      </section>

      <p v-if="pending" class="empty">불러오는 중…</p>
      <p v-else-if="empty && open.length === 0" class="empty">
        아직 모임이 없어요. 책을 완독하면 같은 책을 읽은 동료와 묶어 제안드리고, 직접 열 수도 있어요.
      </p>
      <p v-else-if="empty" class="empty">내가 참여한 모임은 아직 없어요. 위에서 열려 있는 모임에 참여해 보세요.</p>

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
.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
h1 { font-size: 24px; margin: 0 0 4px; }
.lead { color: var(--muted, #666); font-size: 14px; margin: 0 0 24px; }
.new-btn { flex: none; padding: 9px 14px; border-radius: 8px; background: var(--red); color: #fff; text-decoration: none; font-size: 14px; }
h2 { font-size: 16px; margin: 24px 0 10px; }
.list { display: grid; gap: 10px; }
.empty { color: var(--muted, #666); font-size: 14px; }
@media (max-width: 640px) { .head { flex-direction: column; } }
</style>
