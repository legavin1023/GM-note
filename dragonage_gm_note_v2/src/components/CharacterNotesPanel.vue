<template>
  <section
    class="character-notes"
    :class="{ 'character-notes--team-overview': mode === 'party-team' }"
  >
    <div class="notes-heading">
      <div>
        <span class="eyebrow">CHARACTER MEMORIES</span>
        <h3>{{ mode === "scenario" ? "시나리오 한마디" : "파티원 메모" }}</h3>
        <p class="muted">
          {{
            mode === "scenario"
              ? "시나리오에서 캐릭터들이 서로에게 남긴 말"
              : mode === "party-team"
              ? "팀원들이 남긴 메모를 시나리오 순서로 모아봅니다."
              : "이 캐릭터에 대한 첫인상과 함께 기억하고 싶은 메모"
          }}
        </p>
      </div>
      <button
        v-if="mode !== 'party-team'"
        class="outline-button"
        type="button"
        :disabled="loading"
        @click="loadNotes"
      >
        새로고침
      </button>
    </div>

    <form v-if="canWrite" class="note-composer" @submit.prevent="saveNote">
      <div v-if="mode === 'scenario'" class="note-form-grid">
        <label class="form-label">
          작성자
          <select
            v-if="isGM"
            v-model="authorCharacterId"
            class="form-input"
            required
          >
            <option value="" disabled>작성자 선택</option>
            <option v-if="isGM" value="__gm__">마스터 (GM)</option>
            <option
              v-for="character in teamCharacters"
              :key="character.id"
              :value="character.id"
            >
              {{ character.character_name || character.username }}
            </option>
          </select>
          <span v-else class="note-identity">{{
            characterName(authorCharacterId)
          }}</span>
        </label>
        <label class="form-label">
          대상 캐릭터
          <select v-model="targetDraftId" class="form-input" required>
            <option value="" disabled>캐릭터 선택</option>
            <option
              v-for="character in teamCharacters"
              :key="character.id"
              :value="character.id"
            >
              {{ character.character_name || character.username }}
            </option>
          </select>
        </label>
      </div>
      <label v-if="mode !== 'scenario' && isGM" class="form-label">
        작성자
        <select v-model="authorCharacterId" class="form-input" required>
          <option value="" disabled>작성자 선택</option>
          <option v-if="isGM" value="__gm__">마스터 (GM)</option>
          <option
            v-for="character in teamCharacters"
            :key="character.id"
            :value="character.id"
          >
            {{ character.character_name || character.username }}
          </option>
        </select>
      </label>
      <label v-if="mode === 'party-team' && isGM" class="form-label">
        대상 캐릭터
        <select v-model="targetDraftId" class="form-input" required>
          <option value="" disabled>캐릭터 선택</option>
          <option
            v-for="character in teamCharacters"
            :key="character.id"
            :value="character.id"
          >
            {{ character.character_name || character.username }}
          </option>
        </select>
      </label>
      <label class="form-label" for="character-note-input">
        {{ mode === "scenario" ? "한마디" : "메모" }}
        <textarea
          id="character-note-input"
          v-model="draftContent"
          class="form-textarea"
          rows="3"
          maxlength="1200"
          required
          :placeholder="
            mode === 'scenario'
              ? '이 시나리오에서 남기고 싶은 말을 적어주세요.'
              : '첫인상, 기억할 점, 관계 변화를 적어주세요.'
          "
        />
      </label>
      <div class="note-options">
        <template v-if="mode === 'scenario'">
          <label class="check-label">
            <input v-model="publicDraft" type="checkbox" /> 모든 팀에 공개
          </label>
          <label class="check-label">
            <input v-model="showAuthorDraft" type="checkbox" /> 작성자 표시
          </label>
        </template>
        <template v-else>
          <label class="form-label note-date">
            기록 날짜
            <input v-model="dateDraft" class="form-input" type="date" />
          </label>
          <label class="form-label note-visibility">
            공개 범위
            <select v-model="visibilityDraft" class="form-input">
              <option value="team">팀원과 공유</option>
              <option value="private">나만 보기</option>
            </select>
          </label>
          <label class="form-label note-related-scenario">
            관련 시나리오 (선택)
            <select v-model="relatedScenarioId" class="form-input">
              <option value="">선택 안 함</option>
              <option
                v-for="scenario in scenarios"
                :key="scenario.id"
                :value="scenario.id"
              >
                {{ scenario.title }}
              </option>
            </select>
          </label>
        </template>
        <div class="note-form-actions">
          <button
            v-if="editingId"
            class="secondary-button"
            type="button"
            :disabled="saving"
            @click="cancelEdit"
          >
            취소
          </button>
          <button
            class="primary-button"
            type="submit"
            :disabled="saving || !draftContent.trim() || !authorCharacterId"
          >
            {{ saving ? "저장 중…" : editingId ? "수정 저장" : "기록 남기기" }}
          </button>
        </div>
      </div>
      <p v-if="errorMessage" class="notes-error" role="alert">
        {{ errorMessage }}
      </p>
    </form>
    <p v-else-if="!loading && mode !== 'party-team'" class="muted">
      현재 팀 정보가 없어 기록을 작성할 수 없습니다.
    </p>

    <p v-if="loading" class="notes-state">기록을 불러오는 중입니다…</p>
    <p v-else-if="!notes.length" class="notes-state">
      아직 남겨진 기록이 없습니다.
    </p>
    <div v-else class="note-list">
      <article v-for="note in visibleNotes" :key="note.id" class="note-entry">
        <div class="note-entry-meta">
          <strong>{{ noteAuthor(note) }}</strong>
          <span v-if="mode === 'scenario'"
            >→ {{ characterName(note.target_character_id) }}</span
          >
          <span v-else-if="mode === 'party-team'">
            {{
              note.target_character_name ||
              characterName(note.target_character_id)
            }}에 대한 메모
          </span>
          <span v-else>{{
            note.visibility === "private" ? "나만 보기" : "팀 공유"
          }}</span>
          <time :datetime="note.created_at">{{
            formatDate(note.note_date || note.created_at)
          }}</time>
          <span
            v-if="
              mode === 'party-team' &&
              note.author_user_id === currentUserId &&
              note.visibility === 'private'
            "
            class="note-private-badge"
            >나만 보기</span
          >
        </div>
        <p class="note-entry-content">{{ note.content }}</p>
        <p v-if="mode !== 'scenario' && note.scenario_id" class="note-related">
          관련 시나리오: {{ scenarioName(note.scenario_id) }}
        </p>
        <p v-else-if="mode === 'party-team'" class="note-related">
          시나리오 미지정
        </p>
        <div
          v-if="
            mode !== 'party-team' &&
            !isPlayerPreview &&
            note.author_user_id === currentUserId
          "
          class="note-entry-actions"
        >
          <button
            v-if="note.team_id === teamId"
            class="text-button"
            type="button"
            @click="beginEdit(note)"
          >
            수정
          </button>
          <button
            class="text-button"
            type="button"
            :disabled="deletingId === note.id"
            @click="deleteNote(note)"
          >
            {{ deletingId === note.id ? "삭제 중…" : "삭제" }}
          </button>
        </div>
      </article>
    </div>
  </section>
</template>

<script>
import { supabase } from "@/supabase";

export default {
  name: "CharacterNotesPanel",
  props: {
    mode: {
      type: String,
      required: true,
      validator: (value) => ["scenario", "party", "party-team"].includes(value),
    },
    teamId: { type: String, required: true },
    scenarioId: { type: String, default: "" },
    targetCharacterId: { type: String, default: "" },
    teamCharacters: { type: Array, default: () => [] },
  },
  data() {
    return {
      notes: [],
      scenarios: [],
      currentUserId: "",
      authorCharacterId: "",
      targetDraftId: "",
      draftContent: "",
      publicDraft: false,
      showAuthorDraft: true,
      visibilityDraft: "team",
      dateDraft: new Date().toISOString().slice(0, 10),
      relatedScenarioId: "",
      editingId: "",
      loading: true,
      saving: false,
      deletingId: "",
      errorMessage: "",
    };
  },
  computed: {
    isGM() {
      return this.$store.getters.isGM;
    },
    isPlayerPreview() {
      return this.$store.getters.isPlayerPreview;
    },
    canWrite() {
      return Boolean(
        !this.isPlayerPreview &&
          this.currentUserId &&
          this.teamId &&
          (this.isGM ||
            (this.mode !== "party-team" && this.$store.state.playerCharacterId))
      );
    },
    visibleNotes() {
      if (this.mode !== "party-team") return this.notes;
      const scenarioOrder = new Map(
        this.scenarios.map((scenario, index) => [
          scenario.id,
          scenario.sort_order !== null &&
          scenario.sort_order !== "" &&
          Number.isFinite(Number(scenario.sort_order))
            ? Number(scenario.sort_order)
            : index,
        ])
      );
      return [...this.notes].sort((a, b) => {
        const aOrder =
          scenarioOrder.get(a.scenario_id) ?? Number.MAX_SAFE_INTEGER;
        const bOrder =
          scenarioOrder.get(b.scenario_id) ?? Number.MAX_SAFE_INTEGER;
        if (aOrder !== bOrder) return aOrder - bOrder;
        const aDate = a.note_date || a.created_at;
        const bDate = b.note_date || b.created_at;
        return new Date(aDate) - new Date(bDate);
      });
    },
  },
  watch: {
    teamId() {
      this.loadNotes();
    },
    scenarioId() {
      this.loadNotes();
    },
    targetCharacterId() {
      this.loadNotes();
    },
    teamCharacters: {
      immediate: true,
      handler(characters) {
        const characterIds = characters.map((character) => character.id);
        if (!characterIds.includes(this.authorCharacterId)) {
          this.authorCharacterId =
            this.isGM
              ? "__gm__"
              : this.$store.state.playerCharacterId || characters[0]?.id || "";
        }
        if (!characterIds.includes(this.targetDraftId))
          this.targetDraftId = characters[0]?.id || "";
      },
    },
  },
  async mounted() {
    const { data } = await supabase.auth.getUser();
    this.currentUserId = data.user?.id || "";
    await this.loadNotes();
  },
  methods: {
    async loadNotes() {
      if (!this.teamId) {
        this.loading = false;
        return;
      }
      this.loading = true;
      this.errorMessage = "";
      try {
        if (this.mode === "party" || this.mode === "party-team") {
          const campaignId = this.$store.getters.campaignId;
          const [notesResult, scenariosResult] = await Promise.all([
            (() => {
              let query = supabase
                .from("party_character_notes")
                .select("*")
                .eq("team_id", this.teamId);
              if (this.mode === "party")
                query = query.eq("target_character_id", this.targetCharacterId);
              return query.order("created_at", { ascending: false });
            })(),
            campaignId
              ? supabase
                  .from("scenarios")
                  .select("id,title,sort_order")
                  .eq("campaign_id", campaignId)
                  .order("sort_order", { ascending: true })
              : Promise.resolve({
                  data: this.$store.state.scenarios || [],
                  error: null,
                }),
          ]);
          if (notesResult.error) throw notesResult.error;
          if (scenariosResult.error && scenariosResult.error.code !== "42501")
            throw scenariosResult.error;
          this.notes = notesResult.data || [];
          this.scenarios = scenariosResult.data || [];
        } else {
          const isStep = /^\d+$/.test(String(this.scenarioId));
          let query = supabase.from("scenario_character_notes").select("*");
          query = isStep
            ? query.eq("step_number", Number(this.scenarioId))
            : query.eq("scenario_id", this.scenarioId);
          const { data, error } = await query
            .or(`is_public.eq.true,team_id.eq.${this.teamId}`)
            .order("created_at", { ascending: true });
          if (error) throw error;
          this.notes = data || [];
        }
      } catch (error) {
        this.errorMessage = `기록을 불러오지 못했습니다. 관련 DB 마이그레이션과 팀 권한을 확인해 주세요. (${error.message})`;
      } finally {
        this.loading = false;
      }
    },
    async saveNote() {
      if (this.saving || !this.draftContent.trim()) return;
      const playerCharacterId = this.$store.state.playerCharacterId;
      const authorCharacterId = this.isGM
        ? this.authorCharacterId
        : playerCharacterId;
      if (!authorCharacterId) return;
      const storedAuthorCharacterId =
        this.isGM && authorCharacterId === "__gm__" ? null : authorCharacterId;
      this.saving = true;
      this.errorMessage = "";
      try {
        const common = { content: this.draftContent.trim() };
        if (this.mode === "scenario") {
          Object.assign(common, {
            team_id: this.teamId,
            scenario_id: /^\d+$/.test(String(this.scenarioId))
              ? null
              : this.scenarioId,
            step_number: /^\d+$/.test(String(this.scenarioId))
              ? Number(this.scenarioId)
              : null,
            author_user_id: this.currentUserId,
            author_character_id: storedAuthorCharacterId,
            target_character_id: this.targetDraftId,
            is_public: this.publicDraft,
            show_author: this.showAuthorDraft,
          });
        } else {
          Object.assign(common, {
            team_id: this.teamId,
            target_character_id:
              this.mode === "party-team"
                ? this.targetDraftId
                : this.targetCharacterId,
            author_user_id: this.currentUserId,
            author_character_id: storedAuthorCharacterId,
            note_date: this.dateDraft || null,
            visibility: this.visibilityDraft,
            scenario_id: this.relatedScenarioId || null,
          });
        }
        const request = this.editingId
          ? supabase
              .from(this.tableName())
              .update(common)
              .eq("id", this.editingId)
              .select("id")
              .single()
          : supabase
              .from(this.tableName())
              .insert(common)
              .select("id")
              .single();
        const { error } = await request;
        if (error) throw error;
        this.cancelEdit();
        this.draftContent = "";
        this.publicDraft = false;
        this.showAuthorDraft = true;
        this.visibilityDraft = "team";
        this.dateDraft = new Date().toISOString().slice(0, 10);
        this.relatedScenarioId = "";
        await this.loadNotes();
      } catch (error) {
        this.errorMessage = `기록을 저장하지 못했습니다. 입력은 유지됩니다. (${error.message})`;
      } finally {
        this.saving = false;
      }
    },
    tableName() {
      return this.mode === "scenario"
        ? "scenario_character_notes"
        : "party_character_notes";
    },
    beginEdit(note) {
      this.editingId = note.id;
      this.draftContent = note.content;
      this.authorCharacterId =
        note.author_character_id || (this.isGM ? "__gm__" : "");
      if (this.mode === "scenario") {
        this.targetDraftId = note.target_character_id;
        this.publicDraft = note.is_public;
        this.showAuthorDraft = note.show_author;
      } else {
        this.visibilityDraft = note.visibility;
        this.dateDraft = note.note_date || "";
        this.relatedScenarioId = note.scenario_id || "";
      }
      this.$el?.querySelector("textarea")?.focus();
    },
    cancelEdit() {
      this.editingId = "";
    },
    async deleteNote(note) {
      if (this.deletingId || !window.confirm("이 기록을 삭제할까요?")) return;
      this.deletingId = note.id;
      this.errorMessage = "";
      try {
        const { error } = await supabase
          .from(this.tableName())
          .delete()
          .eq("id", note.id);
        if (error) throw error;
        this.notes = this.notes.filter((item) => item.id !== note.id);
      } catch (error) {
        this.errorMessage = `기록을 삭제하지 못했습니다. (${error.message})`;
      } finally {
        this.deletingId = "";
      }
    },
    characterName(id) {
      const character = this.teamCharacters.find((item) => item.id === id);
      return character?.character_name || character?.username || "캐릭터";
    },
    noteAuthor(note) {
      if (this.mode === "scenario" && !note.show_author) return "익명 캐릭터";
      return note.author_character_name || this.characterName(note.author_character_id);
    },
    scenarioName(id) {
      return this.scenarios.find((item) => item.id === id)?.title || "시나리오";
    },
    formatDate(value) {
      if (!value) return "";
      return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(
        new Date(value)
      );
    },
  },
};
</script>

<style scoped>
.character-notes {
  display: grid;
  min-width: 0;
  gap: 1rem;
  margin-top: 0.75rem;
  padding: 1rem 1rem 0;
  border-top: 1px solid var(--line);
  color: var(--ink);
}
.character-notes--team-overview {
  margin-top: 0;
  padding: 0;
  border-top: 0;
}
.notes-heading,
.note-options,
.note-entry-meta,
.note-entry-actions,
.note-form-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.notes-heading,
.note-options {
  justify-content: space-between;
}
.notes-heading {
  align-items: flex-start;
}
.notes-heading > div {
  min-width: 0;
}
.notes-heading h3 {
  margin: 0.25rem 0;
}
.notes-heading p {
  margin: 0;
}
.note-composer {
  display: grid;
  min-width: 0;
  gap: 0.8rem;
  padding: 1rem;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent) 4%, var(--panel));
}
.note-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}
.note-date,
.note-visibility,
.note-related-scenario {
  min-width: 0;
  max-width: none;
}
.note-composer .form-input,
.note-composer .form-textarea {
  width: 100%;
  min-width: 0;
}
.note-entry {
  min-width: 0;
  padding: 0.9rem 0;
  border-bottom: 1px solid var(--line);
  overflow-wrap: anywhere;
}
.note-entry-meta {
  flex-wrap: wrap;
  color: var(--muted);
  font-size: 0.9rem;
}
.note-entry-meta strong {
  color: var(--ink);
}
.note-private-badge {
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 0.72rem;
}
.note-entry-meta time {
  margin-left: auto;
}
.note-entry-content {
  white-space: pre-wrap;
  margin: 0.55rem 0;
}
.note-related {
  color: var(--muted);
  font-size: 0.85rem;
}
.note-entry-actions {
  justify-content: flex-end;
}
.notes-state,
.notes-error {
  margin: 0;
  padding: 0.7rem 0;
}
.notes-error {
  color: #a33;
}
.note-form-actions {
  margin-left: auto;
}
@media (max-width: 640px) {
  .character-notes {
    gap: 0.75rem;
    padding: 0.8rem 0.85rem 0;
  }
  .notes-heading {
    gap: 0.5rem;
  }
  .notes-heading .outline-button {
    flex: 0 0 auto;
    padding-inline: 10px;
  }
  .note-composer {
    padding: 0.75rem;
  }
  .note-form-grid {
    grid-template-columns: 1fr;
  }
  .note-options {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: stretch;
    gap: 0.7rem;
  }
  .note-date,
  .note-visibility,
  .note-related-scenario {
    max-width: none;
  }
  .note-form-actions {
    margin-left: 0;
    justify-content: stretch;
  }
  .note-form-actions > button {
    flex: 1 1 0;
    min-height: 42px;
  }
  .note-entry-meta {
    align-items: flex-start;
    gap: 0.4rem 0.6rem;
    font-size: 0.82rem;
  }
  .note-entry-meta time {
    margin-left: 0;
  }
}
</style>

<style>
.memory-tabs {
  display: flex;
  min-width: 0;
  gap: 0.35rem;
  margin: 0.85rem 0 1rem;
  border-bottom: 1px solid var(--line);
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}
.memory-tabs::-webkit-scrollbar {
  display: none;
}
.memory-tab {
  min-height: 42px;
  padding: 0.65rem 0.9rem;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}
.memory-tab.active {
  border-bottom-color: var(--accent);
  color: var(--ink);
  font-weight: 700;
}
.memory-tab:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
