<template>
  <section class="section-block session-panel">
    <div class="section-heading">
      <div>
        <span class="eyebrow">SESSION SCHEDULE</span>
        <h3 class="section-title">세션 일정</h3>
      </div>
    </div>
    <p class="muted">
      날짜와 시간은 한국 시간입니다. 알림 설정에서 세션 알림을 켜면 시작 10분
      전에 알려드립니다.
    </p>
    <div class="calendar" aria-label="이 팀의 세션 달력">
      <div class="calendar-heading">
        <button
          type="button"
          class="outline-button"
          :disabled="busy"
          aria-label="이전 달"
          @click="moveMonth(-1)"
        >
          ‹
        </button>
        <strong>{{ month.replace("-", "년 ") }}월 · {{ teamName }}</strong>
        <button
          type="button"
          class="outline-button"
          :disabled="busy"
          aria-label="다음 달"
          @click="moveMonth(1)"
        >
          ›
        </button>
      </div>
      <div class="calendar-grid">
        <span v-for="day in weekdays" :key="day" class="calendar-weekday">{{
          day
        }}</span>
        <button
          v-for="day in days"
          :key="day.key"
          type="button"
          class="calendar-day"
          :class="{
            'outside-month': !day.inMonth,
            selected: day.key === selectedDate,
            today: day.key === today,
          }"
          :aria-pressed="day.key === selectedDate"
          :aria-label="`${day.key}, 일정 ${sessionsOn(day.key).length}개`"
          :disabled="busy"
          @click="selectDay(day)"
        >
          <span>{{ day.day }}</span>
          <small
            v-for="session in sessionsOn(day.key).slice(0, 2)"
            :key="session.id"
            >{{ sessionTime(session.starts_at) }} {{ session.title }}</small
          >
          <small v-if="sessionsOn(day.key).length > 2"
            >+{{ sessionsOn(day.key).length - 2 }}개</small
          >
        </button>
      </div>
    </div>
    <h4>{{ selectedDate }} · {{ teamName }} 일정</h4>
    <form v-if="isGM" class="session-form" @submit.prevent="save">
      <label
        >세션 이름<input
          v-model.trim="title"
          class="form-input"
          maxlength="120"
          required
          placeholder="예: 3회차 세션"
      /></label>
      <label
        >시작 시간 (한국 시간)<input
          v-model="startTime"
          class="form-input"
          type="time"
          required
      /></label>
      <button class="primary-button" :disabled="busy">
        {{ editing ? "일정 수정" : "일정 등록" }}
      </button>
      <button
        v-if="editing"
        type="button"
        class="outline-button"
        @click="reset"
      >
        수정 취소
      </button>
    </form>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="loading" class="empty-state">일정을 불러오는 중…</p>
    <p v-else-if="!selectedSessions.length" class="empty-state">
      선택한 날짜에 이 팀의 세션이 없습니다.
    </p>
    <div
      v-for="session in selectedSessions"
      :key="session.id"
      class="session-row"
    >
      <div>
        <strong>{{ session.title }}</strong>
        <p>{{ formatDate(session.starts_at) }}</p>
      </div>
      <div v-if="isGM" class="session-actions">
        <button class="text-button" :disabled="busy" @click="edit(session)">
          수정</button
        ><button class="text-button" :disabled="busy" @click="cancel(session)">
          일정 취소
        </button>
      </div>
    </div>
    <router-link to="/notifications" class="text-button"
      >🔔 알림 설정 →</router-link
    >
  </section>
</template>
<script>
import { supabase } from "@/supabase";
import {
  koreanDate,
  calendarDays,
  shiftMonth,
  monthRange,
} from "@/services/sessionCalendar.mjs";
export default {
  props: { teamId: { type: String, required: true } },
  data: () => ({
    sessions: [],
    loading: false,
    busy: false,
    error: "",
    title: "",
    startTime: "20:00",
    selectedDate: koreanDate(),
    month: koreanDate().slice(0, 7),
    weekdays: ["일", "월", "화", "수", "목", "금", "토"],
    loadVersion: 0,
    editing: null,
  }),
  computed: {
    today() {
      return koreanDate();
    },
    teamName() {
      return (
        this.$store.state.teams.find((team) => team.id === this.teamId)?.name ||
        "이 팀"
      );
    },
    days() {
      return calendarDays(this.month);
    },
    selectedSessions() {
      return this.sessionsOn(this.selectedDate);
    },
    isGM() {
      return this.$store.getters.isGM;
    },
  },
  watch: {
    teamId: {
      immediate: true,
      handler() {
        this.sessions = [];
        this.error = "";
        this.reset();
        this.load();
      },
    },
  },
  mounted() {
    window.addEventListener("focus", this.load);
  },
  beforeUnmount() {
    window.removeEventListener("focus", this.load);
  },
  methods: {
    sessionsOn(date) {
      return this.sessions.filter(
        (session) =>
          session.team_id === this.teamId &&
          koreanDate(session.starts_at) === date
      );
    },
    sessionTime(value) {
      return new Date(Date.parse(value) + 9 * 3600000)
        .toISOString()
        .slice(11, 16);
    },
    moveMonth(offset) {
      this.month = shiftMonth(this.month, offset);
      this.selectedDate = `${this.month}-01`;
      this.sessions = [];
      this.reset();
      this.load();
    },
    selectDay(day) {
      this.reset();
      this.selectedDate = day.key;
      if (!day.inMonth) {
        this.month = day.key.slice(0, 7);
        this.sessions = [];
        this.load();
      }
    },
    async load() {
      const version = ++this.loadVersion,
        teamId = this.teamId,
        range = monthRange(this.month);
      this.loading = true;
      this.error = "";
      try {
        const { data, error } = await supabase
          .from("team_sessions")
          .select("*")
          .eq("team_id", teamId)
          .eq("cancelled", false)
          .gte("starts_at", range.start)
          .lt("starts_at", range.end)
          .order("starts_at");
        if (error) throw error;
        if (version === this.loadVersion && teamId === this.teamId)
          this.sessions = data || [];
      } catch (e) {
        if (version === this.loadVersion)
          this.error = `일정 조회 실패: ${e.message}`;
      } finally {
        if (version === this.loadVersion) this.loading = false;
      }
    },
    reset() {
      this.title = "";
      this.startTime = "20:00";
      this.editing = null;
    },
    edit(session) {
      this.editing = session.id;
      this.title = session.title;
      this.selectedDate = koreanDate(session.starts_at);
      this.startTime = this.sessionTime(session.starts_at);
    },
    formatDate(value) {
      return new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        dateStyle: "full",
        timeStyle: "short",
      }).format(new Date(value));
    },
    async save() {
      const time = new Date(`${this.selectedDate}T${this.startTime}:00+09:00`);
      const teamId = this.teamId;
      if (
        !this.title ||
        !Number.isFinite(time.getTime()) ||
        time.getTime() <= Date.now()
      ) {
        this.error = "세션 이름과 미래의 날짜·시간을 입력하세요.";
        return;
      }
      this.busy = true;
      this.error = "";
      try {
        const row = {
          title: this.title,
          starts_at: time.toISOString(),
        };
        const result = this.editing
          ? await supabase
              .from("team_sessions")
              .update(row)
              .eq("id", this.editing)
              .eq("team_id", teamId)
          : await supabase
              .from("team_sessions")
              .insert({ ...row, team_id: teamId });
        if (result.error) throw result.error;
        this.reset();
        await this.load();
      } catch (e) {
        this.error = `일정 저장 실패: ${e.message}`;
      } finally {
        this.busy = false;
      }
    },
    async cancel(session) {
      if (!window.confirm(`${session.title} 일정을 취소할까요?`)) return;
      this.busy = true;
      try {
        const { error } = await supabase
          .from("team_sessions")
          .update({ cancelled: true })
          .eq("id", session.id)
          .eq("team_id", this.teamId);
        if (error) throw error;
        if (this.editing === session.id) this.reset();
        await this.load();
      } catch (e) {
        this.error = e.message;
      } finally {
        this.busy = false;
      }
    },
  },
};
</script>
<style scoped>
.calendar {
  margin: 20px 0;
  border: 1px solid var(--line);
  border-radius: 12px;
  overflow: hidden;
}
.calendar-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  background: var(--surface);
}
.calendar-heading strong {
  min-width: 0;
  text-align: center;
  overflow-wrap: anywhere;
}
.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 1px;
  background: var(--line);
}
.calendar-weekday {
  background: var(--surface);
  padding: 10px 0;
  text-align: center;
  font-size: 12px;
}
.calendar-day {
  min-width: 0;
  min-height: 96px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  text-align: left;
  padding: 8px;
  background: var(--surface, #fff);
  color: var(--text);
  border: 0;
  font: inherit;
  cursor: pointer;
}
.calendar-day > span {
  font-weight: 600;
}
.calendar-day small {
  display: block;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  background: var(--accent-soft, #f5e9e9);
  color: var(--text);
  border-radius: 4px;
  padding: 3px;
}
.calendar-day.outside-month {
  opacity: 0.5;
}
.calendar-day.selected {
  box-shadow: inset 0 0 0 2px var(--accent, #9f4a4a);
}
.calendar-day.today > span {
  color: var(--accent, #9f4a4a);
}
.calendar-day:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -3px;
}
@media (max-width: 640px) {
  .calendar-day {
    min-height: 72px;
    padding: 5px;
    gap: 3px;
  }
  .calendar-day small {
    font-size: 10px;
    padding: 2px;
  }
  .calendar-heading {
    padding: 8px;
  }
  .session-actions {
    flex-wrap: wrap;
  }
}
.session-form {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 12px;
  margin: 20px 0;
}
.session-form label {
  display: grid;
  gap: 8px;
  flex: 1;
  min-width: 200px;
}
.session-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 0;
  border-bottom: 1px solid var(--line);
}
.session-row p {
  margin: 6px 0;
}
.session-actions {
  display: flex;
  gap: 12px;
}
.session-panel > .text-button {
  display: inline-block;
  margin-top: 16px;
}
</style>
