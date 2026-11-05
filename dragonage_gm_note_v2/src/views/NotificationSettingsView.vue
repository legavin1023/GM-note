<template>
  <section class="section-block">
    <h2 class="section-title">알림 설정</h2>
    <p class="muted">기기별로 받고 싶은 알림을 선택하세요.</p>
    <PushSubscriptionButton :teams="$store.getters.sortedTeams" />
  </section>
</template>
<script>
import PushSubscriptionButton from "@/components/PushSubscriptionButton.vue";
export default { components: { PushSubscriptionButton } };
</script>
