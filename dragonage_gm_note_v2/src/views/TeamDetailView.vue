<template>
  <div v-if="team" class="team-detail-view">
    <!-- 상단 헤더 -->
    <div class="team-header-card card">
      <div class="team-header-top">
        <div
          class="team-symbol-lg"
          :style="{ background: team.color }"
          :aria-label="team.name + ' 팀 색상'"
          role="img"
        ></div>
        <div class="team-header-info">
          <div class="team-title-row">
            <h2>{{ team.name }}</h2>
            <span class="region-badge">{{ team.region || "지역 미정" }}</span>
          </div>
          <p class="muted">{{ team.description || "설명이 없습니다." }}</p>
        </div>
        <div v-if="isGM" class="team-header-actions">
          <button class="outline-button" @click="showEditModal = true">
            팀 정보 수정
          </button>
          <button class="danger-button" @click="handleDeleteTeam">
            팀 삭제
          </button>
        </div>
        <div v-else class="team-header-actions">
          <button
            class="outline-button"
            :class="{ 'preview-disabled': isPlayerPreview }"
            :disabled="isPlayerPreview"
            @click="showEditModal = true"
          >
            팀 프로필 수정
          </button>
        </div>
      </div>

      <div class="team-header-stats" aria-label="팀 대시보드 요약">
        <div class="stat-item">
          <span class="eyebrow">팀</span>
          <strong>1<small>개</small></strong>
        </div>
        <div class="stat-item">
          <span class="eyebrow">시나리오</span>
          <strong>{{ scenarios.length }}<small>개</small></strong>
        </div>
        <div class="stat-item">
          <span class="eyebrow">캐릭터</span>
          <strong>{{ teamCharacters.length }}<small>명</small></strong>
        </div>
      </div>
      <div class="team-progress-summary">
        <div class="team-progress-label">
          <span class="eyebrow">팀 진행현황</span>
          <strong>
            {{
              progressTotal
                ? `${currentProgressStep} / ${progressTotal}단계`
                : "등록된 진행 단계 없음"
            }}
          </strong>
        </div>
        <span v-if="progressTotal" class="team-progress-percent"
          >{{ progressPct }}%</span
        >
        <div
          v-if="progressTotal"
          class="progress-bar team-progress-bar"
          role="progressbar"
          :aria-valuenow="progressPct"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-label="`${team.name} 진행현황 ${progressPct}%`"
        >
          <div
            class="progress-bar-fill"
            :style="{ width: `${progressPct}%`, backgroundColor: team.color }"
          ></div>
        </div>
      </div>
    </div>

    <!-- 탭 / 섹션 -->
    <!-- 캐릭터 섹션 -->
    <section class="section-block">
      <div class="section-heading">
        <div>
          <span class="eyebrow">CHARACTERS</span>
          <h3 class="section-title">소속 캐릭터</h3>
        </div>
        <button v-if="isGM" class="primary-button" @click="handleAddCharacter">
          ＋ 캐릭터 추가
        </button>
      </div>

      <div class="character-grid">
        <component
          :is="isGM ? 'router-link' : 'div'"
          v-for="char in teamCharacters"
          :key="char.id"
          :to="isGM ? '/characters/' + char.id : undefined"
          class="character-card card"
          :class="{ 'character-card--interactive': !isGM }"
          @click="!isGM && openCharacterProfile(char)"
        >
          <div class="char-avatar" :style="{ backgroundColor: team.color }">
            <img
              v-if="char.token_url && !imageErrors[char.id]"
              :src="char.token_url"
              class="char-avatar-image"
              :alt="char.character_name || 'Character token'"
              @error="markImageError(char.id)"
            />
            <span v-if="!char.token_url || imageErrors[char.id]">{{
              (char.character_name || "?")[0]
            }}</span>
          </div>
          <div class="char-info">
            <h4>{{ char.character_name || "이름 없음" }}</h4>
            <span class="char-sub muted">
              {{ char.age || "나이 미정" }} · {{ char.race || "종족미정" }} ·
              {{ char.class || "클래스미정" }} · Lv.{{ char.level || 1 }}
            </span>
          </div>
          <span v-if="isGM" class="char-arrow">↗</span>
        </component>
        <div v-if="!teamCharacters.length" class="empty-state">
          소속된 캐릭터가 없습니다. 캐릭터를 추가해보세요.
        </div>
      </div>
    </section>

    <section class="section-block team-memory-section">
      <CharacterNotesPanel
        mode="party-team"
        :team-id="teamId"
        :team-characters="teamCharacters"
      />
    </section>

    <!-- 시나리오 진행 및 기록 -->
    <TeamArtPreview :team-id="teamId" :characters="teamCharacters" />

    <section class="section-block">
      <div class="section-heading">
        <div>
          <span class="eyebrow">SESSION LOGS</span>
          <h3 class="section-title">팀 로그 백업</h3>
        </div>
        <label v-if="isGM" class="primary-button log-upload-button">
          {{ logUploadBusy ? "업로드 중…" : "HTML 로그 추가" }}
          <input
            ref="logBackupInput"
            type="file"
            accept=".html,.htm,text/html"
            :disabled="logUploadBusy"
            aria-label="HTML 로그 백업 파일 선택"
            @change="uploadTeamLogBackup"
          />
        </label>
      </div>
      <label v-if="isGM && scenarios.length" class="log-scenario-picker">
        <span>챕터 연결</span>
        <select
          v-model="logUploadScenarioId"
          class="form-input"
          :disabled="logUploadBusy"
        >
          <option value="">시나리오를 선택하지 않음</option>
          <option
            v-for="scenario in scenarios"
            :key="scenario.id"
            :value="scenario.id"
          >
            {{ scenario.title }}
          </option>
        </select>
      </label>
      <p class="muted log-help">
        팀 세션 기록의 .html 또는 .htm 파일을 올리면 팀원과 마스터가 읽을 수
        있습니다. 파일당 최대 10MB입니다.
      </p>
      <p v-if="logUploadError" class="log-error" role="alert">
        {{ logUploadError }}
      </p>
      <div v-if="logBackupsLoading" class="empty-state">
        로그 백업을 불러오는 중입니다…
      </div>
      <div v-else-if="logBackupsError" class="log-error" role="alert">
        <span>{{ logBackupsError }}</span>
        <button class="text-button" @click="loadTeamLogBackups">
          다시 불러오기
        </button>
      </div>
      <div v-else-if="!teamLogBackups.length" class="empty-state">
        등록된 로그 백업이 없습니다.
      </div>
      <ul v-else class="log-backup-list">
        <li
          v-for="backup in teamLogBackups"
          :key="backup.id"
          class="log-backup-row"
        >
          <div class="log-backup-info">
            <strong>{{ backup.file_name }}</strong>
            <span class="muted"
              >{{ scenarioTitle(backup.scenario_id) }} ·
              {{ formatLogBackupDate(backup.created_at) }} ·
              {{ formatFileSize(backup.file_size) }}</span
            >
          </div>
          <div class="log-backup-actions">
            <button
              class="outline-button"
              :disabled="logReadingId === backup.id"
              @click="readTeamLogBackup(backup)"
            >
              {{ logReadingId === backup.id ? "여는 중…" : "읽기" }}
            </button>
            <button
              v-if="isGM"
              class="danger-button"
              :disabled="logDeletingId === backup.id"
              @click="deleteTeamLogBackup(backup)"
            >
              {{ logDeletingId === backup.id ? "삭제 중…" : "삭제" }}
            </button>
          </div>
        </li>
      </ul>
    </section>

    <div
      v-if="activeLogBackup"
      class="log-reader-overlay"
      @click.self="closeLogReader"
    >
      <section
        class="log-reader-panel"
        role="dialog"
        aria-modal="true"
        :aria-label="activeLogBackup.file_name"
      >
        <header class="log-reader-header">
          <div class="log-reader-title">
            <h3>{{ activeLogBackup.file_name }}</h3>
            <span class="muted">{{
              formatLogBackupDate(activeLogBackup.created_at)
            }}</span>
          </div>
          <button class="outline-button" @click="closeLogReader">닫기</button>
        </header>
        <p v-if="logReaderError" class="log-error" role="alert">
          {{ logReaderError }}
        </p>
        <iframe
          v-else-if="logReaderDocument"
          class="log-reader-frame"
          title="세션 로그 읽기 창"
          sandbox=""
          referrerpolicy="no-referrer"
          :srcdoc="logReaderDocument"
        ></iframe>
      </section>
    </div>

    <section v-if="isGM" class="section-block">
      <div class="section-heading">
        <div>
          <span class="eyebrow">SCENARIO TRACKER</span>
          <h3 class="section-title">시나리오 진행 상태 및 선택</h3>
        </div>
      </div>

      <div class="stage-tracker">
        <h4>
          진행 단계 · {{ team.progress_step || 1 }}단계 /
          {{ progressStages.length }}
        </h4>
        <div v-if="!progressStages.length" class="empty-state">
          등록된 진행 단계가 없습니다.
        </div>
        <label
          v-for="stage in progressStages"
          :key="stage.step_number"
          class="stage-row card"
        >
          <input
            type="checkbox"
            :checked="getStageRecord(stage.step_number)?.completed || false"
            :disabled="stageSaving[stage.step_number]"
            @change="handleToggleStage(stage, $event)"
          />
          <span class="stage-number">{{ stage.step_number }}</span>
          <span class="stage-copy">
            <strong>{{ stage.title }}</strong>
            <small class="muted">{{ stage.description }}</small>
          </span>
          <span v-if="stageSaving[stage.step_number]" class="muted"
            >저장 중…</span
          >
        </label>
      </div>
      <div class="scenario-board">
        <div
          v-for="scenario in scenarios"
          :key="scenario.id"
          class="scenario-row card"
        >
          <div class="sr-head">
            <span class="scenario-code">{{ scenario.code }}</span>
            <div class="sr-title">
              <h4>{{ scenario.title }}</h4>
              <span class="muted">{{ scenario.description }}</span>
              <div
                v-if="scenarioLogBackups(scenario.id).length"
                class="scenario-log-links"
              >
                <button
                  v-for="backup in scenarioLogBackups(scenario.id)"
                  :key="backup.id"
                  type="button"
                  class="text-button scenario-log-link"
                  :disabled="logReadingId === backup.id"
                  @click.stop="readTeamLogBackup(backup)"
                >
                  {{
                    logReadingId === backup.id
                      ? "여는 중…"
                      : `📄 ${backup.file_name}`
                  }}
                </button>
              </div>
            </div>
            <router-link
              :to="{
                path: '/scenarios/' + scenario.id,
                query: { teamId: team.id },
              }"
              class="outline-button"
            >
              기록 수정 →
            </router-link>
          </div>
          <!-- 팀의 선택 요약 -->
          <div class="sr-body">
            <div class="sr-answers">
              <div
                v-for="q in scenario.questions"
                :key="q.id"
                class="sr-answer-item"
              >
                <span class="q-label">{{ q.code }}:</span>
                <span class="a-label">{{
                  getAnswerLabel(scenario.id, q)
                }}</span>
              </div>
            </div>
            <div v-if="getTeamRecord(scenario.id)?.gm_note" class="sr-note">
              <strong>GM 메모:</strong> {{ getTeamRecord(scenario.id).gm_note }}
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 팀 갤러리 -->
    <section class="section-block">
      <div class="section-heading">
        <div>
          <span class="eyebrow">TEAM GALLERY</span>
          <h3 class="section-title">팀 토큰 갤러리</h3>
        </div>
        <router-link
          :to="{ path: '/gallery', query: { teamId: team.id } }"
          class="text-button"
        >
          전체 갤러리 보기 →
        </router-link>
      </div>

      <div class="gallery-preview-grid">
        <div
          v-for="img in teamImages"
          :key="img.id"
          class="gallery-preview-item"
        >
          <img :src="img.url" :alt="img.caption" />
          <div class="gp-caption">{{ img.caption || "이미지" }}</div>
        </div>
        <div v-if="!teamImages.length" class="empty-state">
          등록된 팀 이미지가 없습니다.
        </div>
      </div>
    </section>

    <!-- 팀 수정 모달 -->
    <div
      v-if="showEditModal"
      class="modal-overlay"
      @click.self="showEditModal = false"
    >
      <div class="modal">
        <div class="modal-head">
          <h3>{{ isGM ? "팀 정보 수정" : "팀 프로필 수정" }}</h3>
          <button class="delete-button" @click="showEditModal = false">
            ×
          </button>
        </div>
        <div class="modal-body">
          <label class="form-label"
            >팀 이름 <input v-model="editForm.name" class="form-input" required
          /></label>
          <label class="form-label"
            >지역 <input v-model="editForm.region" class="form-input"
          /></label>
          <label class="form-label"
            >설명
            <textarea
              v-model="editForm.description"
              class="form-textarea"
            ></textarea>
          </label>
          <label class="form-label">
            색상
            <div class="color-row">
              <input
                v-model="editForm.color"
                type="color"
                class="color-picker"
              />
              <span>{{ editForm.color }}</span>
            </div>
          </label>
          <div v-if="isGM" class="form-row">
            <label class="form-label"
              >진행 단계
              <input
                v-model.number="editForm.progress_step"
                type="number"
                min="1"
                max="25"
                class="form-input"
            /></label>
            <label class="form-label"
              >전체 단계
              <input
                v-model.number="editForm.total_steps"
                type="number"
                min="1"
                max="25"
                class="form-input"
            /></label>
          </div>
        </div>
        <div class="modal-foot">
          <button class="secondary-button" @click="showEditModal = false">
            취소
          </button>
          <button
            class="primary-button"
            :disabled="saving"
            @click="handleUpdateTeam"
          >
            {{ saving ? "저장 중..." : "저장" }}
          </button>
        </div>
      </div>
    </div>
  </div>
  <div
    v-if="selectedCharacter && !isGM"
    class="modal-overlay profile-modal-overlay"
    @click.self="selectedCharacter = null"
  >
    <section
      class="modal player-character-profile"
      role="dialog"
      aria-modal="true"
      aria-label="캐릭터 프로필"
    >
      <div class="profile-modal-cover">
        <div
          class="profile-modal-token"
          :style="{ backgroundColor: team.color }"
        >
          <img
            v-if="
              selectedCharacter.token_url && !imageErrors[selectedCharacter.id]
            "
            :src="selectedCharacter.token_url"
            :alt="selectedCharacter.character_name || '캐릭터 토큰'"
            @error="markImageError(selectedCharacter.id)"
          />
          <span v-else>{{ (selectedCharacter.character_name || "?")[0] }}</span>
        </div>
        <div class="profile-cover-copy">
          <span class="eyebrow">CHARACTER PROFILE</span>
          <span>{{ selectedCharacter.player || "플레이어 미지정" }}</span>
        </div>
      </div>
      <div class="modal-head">
        <h3>{{ selectedCharacter.character_name || "캐릭터 이름 미입력" }}</h3>
        <button
          class="delete-button"
          aria-label="닫기"
          @click="selectedCharacter = null"
        >
          ×
        </button>
      </div>
      <nav class="memory-tabs" aria-label="캐릭터 정보 메뉴">
        <button
          type="button"
          class="memory-tab"
          :class="{ active: selectedCharacterTab === 'profile' }"
          @click="selectedCharacterTab = 'profile'"
        >
          프로필
        </button>
        <button
          type="button"
          class="memory-tab"
          :class="{ active: selectedCharacterTab === 'notes' }"
          @click="selectedCharacterTab = 'notes'"
        >
          파티원 메모
        </button>
        <button
          type="button"
          class="memory-tab"
          :class="{ active: selectedCharacterTab === 'mentioned-posts' }"
          @click="selectedCharacterTab = 'mentioned-posts'"
        >
          이 캐릭터 언급 글
        </button>
      </nav>
      <template v-if="selectedCharacterTab === 'profile'">
        <div class="profile-vitals">
          <div>
            <span>나이</span>
            <strong>{{ selectedCharacter.age || "—" }}</strong>
          </div>
          <div>
            <span>종족</span>
            <strong>{{ selectedCharacter.race || "—" }}</strong>
          </div>
          <div>
            <span>직업</span>
            <strong>{{ selectedCharacter.class || "—" }}</strong>
          </div>
          <div>
            <span>레벨</span>
            <strong>{{ selectedCharacter.level || "—" }}</strong>
          </div>
        </div>
        <div v-if="canRequestCharacterEdits" class="profile-request-actions">
          <p v-if="profileRequestLoading" class="muted">
            요청 상태를 확인하는 중…
          </p>
          <p v-else-if="pendingProfileRequest" class="muted">
            수정 요청이 GM 승인 대기 중입니다.
          </p>
          <button
            v-else-if="!profileEditMode && !profileRequestLoading"
            class="outline-button"
            @click="startProfileEdit"
          >
            내 캐릭터 수정 요청
          </button>
        </div>
        <form
          v-if="profileEditMode"
          class="profile-request-form"
          @submit.prevent="submitProfileEdit"
        >
          <label
            v-for="field in profileFields"
            :key="field.key"
            class="form-label"
          >
            {{ field.label }}
            <textarea
              v-model="profileEditForm[field.key]"
              class="form-textarea"
              rows="2"
            ></textarea>
          </label>
          <div class="modal-foot">
            <button
              type="button"
              class="secondary-button"
              @click="profileEditMode = false"
            >
              취소
            </button>
            <button
              type="submit"
              class="primary-button"
              :disabled="profileRequestSaving"
            >
              {{ profileRequestSaving ? "요청 중…" : "GM에게 승인 요청" }}
            </button>
          </div>
        </form>
        <dl v-else class="player-profile-grid">
          <div>
            <dt>나이</dt>
            <dd>{{ selectedCharacter.age || "미입력" }}</dd>
          </div>
          <div>
            <dt>종족</dt>
            <dd>{{ selectedCharacter.race || "미입력" }}</dd>
          </div>
          <div>
            <dt>직업</dt>
            <dd>{{ selectedCharacter.class || "미입력" }}</dd>
          </div>
          <div>
            <dt>레벨</dt>
            <dd>{{ selectedCharacter.level || "미입력" }}</dd>
          </div>
          <div>
            <dt>배경</dt>
            <dd>{{ selectedCharacter.background || "미입력" }}</dd>
          </div>
          <div>
            <dt>사회 계층</dt>
            <dd>{{ selectedCharacter.social_class || "미입력" }}</dd>
          </div>
          <div>
            <dt>동기</dt>
            <dd>{{ selectedCharacter.motivation || "미입력" }}</dd>
          </div>
          <div>
            <dt>목표</dt>
            <dd>{{ selectedCharacter.goal || "미입력" }}</dd>
          </div>
          <div>
            <dt>강점</dt>
            <dd>{{ selectedCharacter.strengths || "미입력" }}</dd>
          </div>
          <div>
            <dt>언어</dt>
            <dd>{{ selectedCharacter.languages || "미입력" }}</dd>
          </div>
          <div>
            <dt>특징</dt>
            <dd>{{ selectedCharacter.traits || "미입력" }}</dd>
          </div>
          <div>
            <dt>특이 사항</dt>
            <dd>{{ selectedCharacter.character_quirk || "미입력" }}</dd>
          </div>
          <div>
            <dt>소개</dt>
            <dd>{{ selectedCharacter.biography || "미입력" }}</dd>
          </div>
        </dl>
      </template>
      <CharacterNotesPanel
        v-if="selectedCharacterTab === 'notes'"
        mode="party"
        :team-id="team.id"
        :target-character-id="selectedCharacter.id"
        :team-characters="teamCharacters"
      />
      <CharacterTaggedPostsPanel
        v-if="selectedCharacterTab === 'mentioned-posts'"
        :character-id="selectedCharacter.id"
        :character-name="selectedCharacter.character_name"
      />
    </section>
  </div>
  <section
    v-if="isGM && pendingCharacterRequests.length"
    class="section-block pending-character-requests"
  >
    <div class="section-heading">
      <div>
        <span class="eyebrow">PLAYER REQUESTS</span>
        <h3 class="section-title">캐릭터 수정 승인 대기</h3>
      </div>
    </div>
    <article
      v-for="request in pendingCharacterRequests"
      :key="request.request_id"
      class="card profile-request-card"
    >
      <h4>
        {{ request.character_name || "이름 미입력" }}
        <small v-if="request.player">· {{ request.player }}</small>
      </h4>
      <dl class="player-profile-grid">
        <template v-for="field in profileFields" :key="field.key">
          <div
            v-if="
              Object.prototype.hasOwnProperty.call(
                request.requested_changes,
                field.key
              )
            "
          >
            <dt>{{ field.label }}</dt>
            <dd>{{ request.requested_changes[field.key] || "(비움)" }}</dd>
          </div>
        </template>
      </dl>
      <div class="modal-foot">
        <button
          class="secondary-button"
          :disabled="reviewBusy === request.request_id"
          @click="reviewProfileRequest(request, false)"
        >
          거절
        </button>
        <button
          class="primary-button"
          :disabled="reviewBusy === request.request_id"
          @click="reviewProfileRequest(request, true)"
        >
          승인하고 반영
        </button>
      </div>
    </article>
  </section>
</template>

<script>
import {
  updateTeam,
  updatePlayerTeamProfile,
  deleteTeam,
} from "@/services/teams";
import { saveCharacter } from "@/services/characters";
import { supabase } from "@/supabase";
import TeamArtPreview from "@/components/TeamArtPreview.vue";
import CharacterNotesPanel from "@/components/CharacterNotesPanel.vue";
import CharacterTaggedPostsPanel from "@/components/CharacterTaggedPostsPanel.vue";
import {
  getTeamScenarios,
  getOrCreateTeamProgressStage,
  saveTeamScenarioStatus,
} from "@/services/scenarios";
import { getPlayerTeamGalleryImages, getTeamImages } from "@/services/images";
import {
  getPlayerCharacterChangeStatus,
  getTeamCharacterChangeRequests,
  reviewPlayerCharacterChange,
  submitPlayerCharacterChange,
} from "@/services/playerCharacterChanges";

export default {
  name: "TeamDetailView",
  components: {
    TeamArtPreview,
    CharacterNotesPanel,
    CharacterTaggedPostsPanel,
  },
  props: {
    teamId: { type: String, required: true },
  },
  data() {
    return {
      showEditModal: false,
      saving: false,
      editForm: {},
      teamScenarios: [],
      teamImages: [],
      stageSaving: {},
      imageErrors: {},
      selectedCharacter: null,
      selectedCharacterTab: "profile",
      pendingProfileRequest: null,
      profileRequestLoading: false,
      profileRequestSaving: false,
      profileEditMode: false,
      profileEditForm: {},
      pendingCharacterRequests: [],
      reviewBusy: null,
      teamLogBackups: [],
      logBackupsLoading: false,
      logBackupsError: "",
      logUploadBusy: false,
      logUploadError: "",
      logReadingId: null,
      logReaderDocument: "",
      logReaderError: "",
      activeLogBackup: null,
      logDeletingId: null,
      logUploadScenarioId: "",
    };
  },
  computed: {
    team() {
      return this.$store.getters.teamById(this.teamId);
    },
    teamCharacters() {
      const allTeamCharacters = this.$store.getters.sortedTeams.flatMap(
        (sourceTeam) =>
          (sourceTeam.characters || []).map((character) => ({
            ...character,
            team_id: character.team_id || sourceTeam.id,
          }))
      );
      const roster = [...(this.team?.characters || []), ...allTeamCharacters];
      const unique = new Map();
      roster.forEach((character) => {
        if (character.team_id === this.teamId && !unique.has(character.id)) {
          unique.set(character.id, character);
        }
      });
      return [...unique.values()];
    },
    isGM() {
      return this.$store.getters.isGM;
    },
    isPlayerPreview() {
      return this.$store.getters.isPlayerPreview;
    },
    scenarios() {
      return this.$store.getters.sortedScenarios;
    },
    progressStages() {
      return this.$store.state.progressStages;
    },
    progressTotal() {
      return this.progressStages.length || this.scenarios.length;
    },
    currentProgressStep() {
      if (!this.progressTotal) return 0;
      return Math.min(
        Number(this.team?.progress_step) || 1,
        this.progressTotal
      );
    },
    progressPct() {
      if (!this.progressTotal) return 0;
      return Math.round((this.currentProgressStep / this.progressTotal) * 100);
    },
    profileFields() {
      return [
        { key: "character_name", label: "캐릭터 이름" },
        { key: "age", label: "나이" },
        { key: "height", label: "키" },
        { key: "weight", label: "몸무게" },
        { key: "race", label: "종족" },
        { key: "class", label: "직업" },
        { key: "background", label: "배경" },
        { key: "social_class", label: "사회 계층" },
        { key: "motivation", label: "동기" },
        { key: "goal", label: "목표" },
        { key: "strengths", label: "강점" },
        { key: "languages", label: "언어" },
        { key: "traits", label: "특징" },
        { key: "character_quirk", label: "특이 사항" },
        { key: "biography", label: "소개" },
        { key: "token_url", label: "토큰 이미지 URL" },
      ];
    },
    playerCharacterId() {
      return (
        this.$store.state.playerCharacterId ||
        this.$store.state.gmUser?.user_metadata?.player_user_id ||
        null
      );
    },
    canRequestCharacterEdits() {
      return this.selectedCharacter?.id === this.playerCharacterId;
    },
  },
  async mounted() {
    if (this.team) {
      this.initEditForm();
      await this.loadData();
    }
  },
  watch: {
    isPlayerPreview(enabled) {
      if (enabled) {
        this.showEditModal = false;
        this.profileEditMode = false;
        this.pendingCharacterRequests = [];
        this.reviewBusy = null;
      }
    },
    team(team) {
      if (team) {
        this.initEditForm();
        this.loadData();
      }
    },
    teamId() {
      if (this.team) {
        this.initEditForm();
        this.loadData();
      }
    },
    "$store.state.playerTeamId"(teamId) {
      if (teamId && this.team) this.loadData();
    },
  },
  methods: {
    markImageError(characterId) {
      this.imageErrors = { ...this.imageErrors, [characterId]: true };
    },
    initEditForm() {
      this.editForm = {
        name: this.team.name,
        region: this.team.region,
        description: this.team.description,
        color: this.team.color,
        progress_step: this.team.progress_step || 1,
        total_steps: this.team.total_steps || 5,
      };
    },
    async loadData() {
      await this.loadTeamLogBackups();
      if (this.isGM) {
        try {
          const [ts, imgs] = await Promise.all([
            getTeamScenarios(this.teamId),
            getTeamImages(this.teamId),
          ]);
          this.teamScenarios = ts;
          this.teamImages = imgs;
        } catch (e) {
          console.error(e);
        }
      } else {
        try {
          const galleryImages = await getPlayerTeamGalleryImages(
            this.teamId,
            this.team.campaign_id,
            [this.team]
          );
          this.teamImages = galleryImages.filter(
            (image) => image.team_id === this.teamId
          );
        } catch (e) {
          console.error("Team token gallery could not be loaded", e);
        }
      }
      if (this.isGM) {
        try {
          this.pendingCharacterRequests = await getTeamCharacterChangeRequests(
            this.teamId
          );
        } catch (e) {
          console.error("Character change requests could not be loaded", e);
        }
      }
    },
    async loadTeamLogBackups() {
      this.logBackupsLoading = true;
      this.logBackupsError = "";
      const { data, error } = await supabase
        .from("team_log_backups")
        .select(
          "id, team_id, scenario_id, file_name, storage_path, file_size, created_at"
        )
        .eq("team_id", this.teamId)
        .order("created_at", { ascending: false });
      if (error) {
        this.logBackupsError =
          "로그 백업을 불러오지 못했습니다. DB 마이그레이션 적용 여부와 팀 접근 권한을 확인해 주세요.";
        console.error("Team log backup list failed", error);
      } else {
        this.teamLogBackups = data || [];
      }
      this.logBackupsLoading = false;
    },
    async uploadTeamLogBackup(event) {
      const input = event.target;
      const file = input.files && input.files[0];
      this.logUploadError = "";
      if (!file) return;
      if (!/\.html?$/i.test(file.name)) {
        this.logUploadError = "HTML 또는 HTM 파일만 추가할 수 있습니다.";
        return;
      }
      if (file.size < 1 || file.size > 10 * 1024 * 1024) {
        this.logUploadError = "파일 크기는 1바이트 이상, 10MB 이하여야 합니다.";
        return;
      }
      if (
        file.type &&
        ![
          "text/html",
          "application/xhtml+xml",
          "text/plain",
          "application/octet-stream",
        ].includes(file.type)
      ) {
        this.logUploadError = "HTML 파일 형식이 아닙니다.";
        return;
      }
      this.logUploadBusy = true;
      let uploadedPath = null;
      try {
        const { data: authData, error: authError } =
          await supabase.auth.getUser();
        if (authError || !authData.user)
          throw new Error("관리자 로그인 상태를 확인할 수 없습니다.");
        const id = crypto.randomUUID
          ? crypto.randomUUID()
          : [...crypto.getRandomValues(new Uint8Array(16))]
              .map((byte) => byte.toString(16).padStart(2, "0"))
              .join("");
        uploadedPath = `${authData.user.id}/${this.teamId}/${id}.html`;
        const { error: uploadError } = await supabase.storage
          .from("team-log-backups")
          .upload(uploadedPath, file, {
            contentType: "text/html",
            upsert: false,
          });
        if (uploadError) throw uploadError;
        const { error: insertError } = await supabase
          .from("team_log_backups")
          .insert({
            team_id: this.teamId,
            scenario_id: this.logUploadScenarioId || null,
            uploaded_by: authData.user.id,
            file_name: file.name,
            storage_path: uploadedPath,
            file_size: file.size,
          });
        if (insertError) {
          const { error: cleanupError } = await supabase.storage
            .from("team-log-backups")
            .remove([uploadedPath]);
          if (cleanupError)
            console.error(
              "Could not clean up unreferenced log backup",
              cleanupError
            );
          uploadedPath = null;
          throw new Error(
            cleanupError
              ? "목록 저장에 실패했고 업로드 파일 정리도 실패했습니다. 마스터에게 알려주세요."
              : "목록 저장에 실패해 업로드한 파일을 정리했습니다. 다시 시도해 주세요."
          );
        }
        uploadedPath = null;
        await this.loadTeamLogBackups();
        input.value = "";
      } catch (error) {
        this.logUploadError = error.message || "파일 업로드에 실패했습니다.";
        console.error("Team log backup upload failed", error);
      } finally {
        if (uploadedPath) {
          const { error } = await supabase.storage
            .from("team-log-backups")
            .remove([uploadedPath]);
          if (error)
            console.error("Could not clean up failed log upload", error);
        }
        this.logUploadBusy = false;
      }
    },
    sanitizeLogHtml(source) {
      const parsed = new DOMParser().parseFromString(source, "text/html");
      parsed
        .querySelectorAll(
          "script, iframe, frame, frameset, object, embed, applet, form, input, button, select, textarea, link, base, meta, svg, math, video, audio, source, track, portal"
        )
        .forEach((node) => node.remove());
      const safeStyles = [...parsed.querySelectorAll("style")]
        .map((style) =>
          style.textContent
            .replace(/@import[^;]+;?/gi, "")
            .replace(/url\s*\([^)]*\)/gi, "none")
        )
        .join("\n");
      parsed.querySelectorAll("style").forEach((style) => style.remove());
      parsed.querySelectorAll("*").forEach((node) => {
        [...node.attributes].forEach((attribute) => {
          const name = attribute.name.toLowerCase();
          const value = attribute.value.trim();
          if (
            name.startsWith("on") ||
            [
              "srcdoc",
              "srcset",
              "action",
              "formaction",
              "ping",
              "xlink:href",
              "xmlns",
            ].includes(name)
          ) {
            node.removeAttribute(attribute.name);
          } else if (
            ["href", "src", "poster", "background"].includes(name) &&
            !/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(value)
          ) {
            node.removeAttribute(attribute.name);
          } else if (
            name === "style" &&
            /url\s*\(|expression\s*\(|@import/i.test(value)
          ) {
            node.removeAttribute(attribute.name);
          }
        });
      });
      const safeBody = parsed.body.innerHTML;
      return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; script-src 'none'; connect-src 'none'; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:system-ui,sans-serif;line-height:1.65;overflow-wrap:anywhere;margin:1rem}img{max-width:100%;height:auto}pre{white-space:pre-wrap;overflow-wrap:anywhere}table{max-width:100%;border-collapse:collapse}td,th{border:1px solid #aaa;padding:.35rem} ${safeStyles}</style></head><body>${safeBody}</body></html>`;
    },
    async readTeamLogBackup(backup) {
      this.logReadingId = backup.id;
      this.activeLogBackup = backup;
      this.logReaderDocument = "";
      this.logReaderError = "";
      try {
        const { data, error } = await supabase.storage
          .from("team-log-backups")
          .download(backup.storage_path);
        if (error) throw error;
        this.logReaderDocument = this.sanitizeLogHtml(await data.text());
      } catch (error) {
        this.logReaderError =
          "로그 파일을 읽지 못했습니다. 저장소 접근 권한을 확인해 주세요.";
        console.error("Team log backup read failed", error);
      } finally {
        this.logReadingId = null;
      }
    },
    closeLogReader() {
      this.activeLogBackup = null;
      this.logReaderDocument = "";
      this.logReaderError = "";
    },
    async deleteTeamLogBackup(backup) {
      if (!window.confirm(`'${backup.file_name}' 로그 백업을 삭제할까요?`))
        return;
      this.logDeletingId = backup.id;
      try {
        const { error: storageError } = await supabase.storage
          .from("team-log-backups")
          .remove([backup.storage_path]);
        if (storageError)
          throw new Error(
            "파일 삭제에 실패해 목록은 유지했습니다: " + storageError.message
          );
        const { error: rowError } = await supabase
          .from("team_log_backups")
          .delete()
          .eq("id", backup.id);
        if (rowError)
          throw new Error(
            "파일은 삭제됐지만 목록 정리에 실패했습니다. 다시 불러와 상태를 확인해 주세요."
          );
        this.teamLogBackups = this.teamLogBackups.filter(
          (item) => item.id !== backup.id
        );
      } catch (error) {
        this.logBackupsError =
          error.message || "로그 백업을 삭제하지 못했습니다.";
      } finally {
        this.logDeletingId = null;
      }
    },
    formatLogBackupDate(value) {
      return new Intl.DateTimeFormat("ko-KR", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value));
    },
    scenarioTitle(scenarioId) {
      return (
        this.scenarios.find((scenario) => scenario.id === scenarioId)?.title ||
        "챕터 미지정"
      );
    },
    scenarioLogBackups(scenarioId) {
      return this.teamLogBackups.filter(
        (backup) => backup.scenario_id === scenarioId
      );
    },
    formatFileSize(size) {
      return size < 1024 * 1024
        ? `${Math.max(1, Math.round(size / 1024))} KB`
        : `${(size / (1024 * 1024)).toFixed(1)} MB`;
    },
    async openCharacterProfile(character) {
      this.selectedCharacter = character;
      this.selectedCharacterTab = "profile";
      this.profileEditMode = false;
      this.pendingProfileRequest = null;
      if (character.id !== this.playerCharacterId) return;
      this.profileRequestLoading = true;
      try {
        this.pendingProfileRequest = await getPlayerCharacterChangeStatus();
      } catch (error) {
        this.$store.dispatch("showToast", {
          message: "수정 요청 상태 조회 실패: " + error.message,
          type: "error",
        });
      } finally {
        this.profileRequestLoading = false;
      }
    },
    startProfileEdit() {
      this.profileEditForm = Object.fromEntries(
        this.profileFields.map(({ key }) => [
          key,
          this.selectedCharacter[key] ?? "",
        ])
      );
      this.profileEditMode = true;
    },
    async submitProfileEdit() {
      this.profileRequestSaving = true;
      try {
        await submitPlayerCharacterChange(this.profileEditForm);
        this.pendingProfileRequest = { status: "pending" };
        this.profileEditMode = false;
        this.$store.dispatch("showToast", {
          message: "GM 승인 요청을 보냈습니다.",
          type: "success",
        });
      } catch (error) {
        this.$store.dispatch("showToast", {
          message: "수정 요청 실패: " + error.message,
          type: "error",
        });
      } finally {
        this.profileRequestSaving = false;
      }
    },
    async reviewProfileRequest(request, approve) {
      this.reviewBusy = request.request_id;
      try {
        await reviewPlayerCharacterChange(request.request_id, approve);
        if (approve) {
          const updatedTeam = {
            ...this.team,
            characters: (this.team.characters || []).map((character) =>
              character.id === request.character_id
                ? { ...character, ...request.requested_changes }
                : character
            ),
          };
          this.$store.commit("updateTeam", updatedTeam);
        }
        this.pendingCharacterRequests = this.pendingCharacterRequests.filter(
          (item) => item.request_id !== request.request_id
        );
        this.$store.dispatch("showToast", {
          message: approve
            ? "요청을 승인하고 프로필에 반영했습니다."
            : "요청을 거절했습니다.",
          type: "success",
        });
      } catch (error) {
        this.$store.dispatch("showToast", {
          message: "요청 처리 실패: " + error.message,
          type: "error",
        });
      } finally {
        this.reviewBusy = null;
      }
    },
    getTeamRecord(scenarioId) {
      return this.teamScenarios.find((ts) => ts.scenario_id === scenarioId);
    },
    getStageRecord(stepNumber) {
      return this.teamScenarios.find(
        (record) => record.step_number === stepNumber
      );
    },
    async handleToggleStage(stage, event) {
      const step = stage.step_number;
      const completed = event.target.checked;
      this.stageSaving = { ...this.stageSaving, [step]: true };
      try {
        const record = await getOrCreateTeamProgressStage(this.teamId, step);
        const saved = await saveTeamScenarioStatus(record.id, {
          completed,
          gmNote: record.gm_note || "",
        });
        const index = this.teamScenarios.findIndex(
          (item) => item.id === saved.id
        );
        const records = [...this.teamScenarios];
        if (index < 0) records.push(saved);
        else records.splice(index, 1, { ...records[index], ...saved });
        this.teamScenarios = records;
      } catch (error) {
        event.target.checked = !completed;
        this.$store.dispatch("showToast", {
          message: "단계 저장 실패: " + error.message,
          type: "error",
        });
      } finally {
        this.stageSaving = { ...this.stageSaving, [step]: false };
      }
    },
    getAnswerLabel(scenarioId, question) {
      const ts = this.getTeamRecord(scenarioId);
      if (!ts) return "미선택";
      const ans = (ts.team_scenario_answers || []).find(
        (a) => a.question_id === question.id
      );
      if (!ans) return "미선택";
      const choice = (question.choices || []).find(
        (c) => c.id === ans.choice_id
      );
      return choice ? choice.label : "미선택";
    },
    async handleUpdateTeam() {
      this.saving = true;
      try {
        const updated = this.isGM
          ? await updateTeam(this.teamId, this.editForm)
          : await updatePlayerTeamProfile({
              name: this.editForm.name,
              region: this.editForm.region,
              description: this.editForm.description,
              color: this.editForm.color,
            });
        this.$store.commit("updateTeam", { ...this.team, ...updated });
        this.$store.dispatch("showToast", {
          message: "팀 정보가 수정되었습니다.",
          type: "success",
        });
        this.showEditModal = false;
      } catch (error) {
        this.$store.dispatch("showToast", {
          message: "수정 실패: " + error.message,
          type: "error",
        });
      } finally {
        this.saving = false;
      }
    },
    async handleDeleteTeam() {
      if (
        !confirm(
          `'${this.team.name}' 팀을 정말 삭제하시겠습니까? 소속 캐릭터와 관련 기록이 모두 삭제될 수 있습니다.`
        )
      )
        return;
      try {
        await deleteTeam(this.teamId);
        this.$store.commit("removeTeam", this.teamId);
        this.$store.dispatch("showToast", {
          message: "팀이 삭제되었습니다.",
          type: "success",
        });
        this.$router.push({ name: "teams" });
      } catch (error) {
        this.$store.dispatch("showToast", {
          message: "삭제 실패: " + error.message,
          type: "error",
        });
      }
    },
    async handleAddCharacter() {
      const newChar = {
        team_id: this.teamId,
        username: "",
        character_name: "새 캐릭터",
        player: "홍길동",
        level: 1,
        race: "인간",
        class: "전사",
      };
      try {
        const saved = await saveCharacter(newChar);
        const updatedChars = [...(this.team.characters || []), saved];
        this.$store.commit("updateTeam", {
          ...this.team,
          characters: updatedChars,
          users: updatedChars,
        });
        this.$store.dispatch("showToast", {
          message: "새 캐릭터가 추가되었습니다.",
          type: "success",
        });
        this.$router.push(`/characters/${saved.id}`);
      } catch (error) {
        this.$store.dispatch("showToast", {
          message: "캐릭터 추가 실패: " + error.message,
          type: "error",
        });
      }
    },
  },
};
</script>

<style scoped>
/* 개별 팀의 상세 정보와 팀원 관리 화면에 적용됩니다. */
.team-detail-view {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.team-header-card {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.team-header-top {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
}
.team-symbol-lg {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  color: #fff;
  font-size: 24px;
  font-weight: 800;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.team-header-info {
  flex: 1;
  min-width: 200px;
}
.team-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 4px;
}
.team-title-row h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 800;
}
.region-badge {
  background: var(--line);
  padding: 4px 10px;
  border-radius: 99px;
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
}
.team-header-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.team-header-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
}
.stat-item {
  min-width: 0;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--paper);
}
.stat-item strong {
  display: block;
  font-size: 20px;
  font-weight: 800;
}
.stat-item strong small {
  font-size: 13px;
  color: var(--muted);
  margin-left: 2px;
}
.team-progress-summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px 16px;
}
.team-progress-label {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px 12px;
  min-width: 0;
}
.team-progress-label strong {
  font-size: 13px;
}
.team-progress-percent {
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}
.team-progress-bar {
  grid-column: 1 / -1;
  height: 9px;
  border-radius: 999px;
}
.team-progress-bar .progress-bar-fill {
  border-radius: inherit;
}

.section-block {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 24px;
}
.log-help {
  margin: -8px 0 16px;
}
.log-scenario-picker {
  display: grid;
  gap: 6px;
  max-width: 520px;
  margin: 0 0 16px;
  color: var(--muted);
  font-size: 13px;
}
.log-scenario-picker select {
  width: 100%;
}
.log-upload-button {
  position: relative;
  cursor: pointer;
}
.log-upload-button:focus-within {
  outline: 3px solid var(--accent);
  outline-offset: 3px;
}
.log-upload-button input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  overflow: hidden;
}
.log-backup-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.log-backup-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 0;
  border-top: 1px solid var(--line);
}
.log-backup-info {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.log-backup-info strong {
  overflow-wrap: anywhere;
}
.log-backup-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
}
.log-error {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  color: var(--danger, #a44);
}
.log-reader-overlay {
  position: fixed;
  z-index: 1200;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(0 0 0 / 62%);
}
.log-reader-panel {
  display: flex;
  flex-direction: column;
  width: min(1100px, 100%);
  height: min(88vh, 900px);
  overflow: hidden;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 10px;
}
.log-reader-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--line);
}
.log-reader-title {
  min-width: 0;
}
.log-reader-title h3 {
  margin: 0 0 4px;
  overflow-wrap: anywhere;
}
.log-reader-frame {
  flex: 1;
  width: 100%;
  border: 0;
  background: #fff;
}

.character-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}
.character-card {
  display: flex;
  align-items: center;
  gap: 12px;
  text-decoration: none;
  color: var(--ink);
  transition: border-color 0.15s, transform 0.1s;
  padding: 14px;
}
.character-card--interactive {
  cursor: pointer;
}
.player-profile-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
  margin: 0;
}
.player-profile-grid > div {
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 4px;
}
.player-profile-grid dt {
  color: var(--muted);
  font-size: 12px;
  margin-bottom: 5px;
}
.player-profile-grid dd {
  margin: 0;
  white-space: pre-wrap;
}
.profile-request-actions {
  margin: 16px 0;
}
.profile-request-form {
  display: grid;
  gap: 10px;
  max-height: 60vh;
  overflow: auto;
}
.profile-request-card {
  padding: 16px;
  margin-bottom: 12px;
}
.character-card:hover {
  border-color: var(--accent);
  transform: translateY(-1px);
}
.char-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background-size: cover;
  background-position: center;
  display: grid;
  place-items: center;
  color: #fff;
  font-weight: 700;
  flex-shrink: 0;
  background-color: var(--line);
  overflow: hidden;
}
.char-avatar-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: inherit;
}
.char-info {
  flex: 1;
  min-width: 0;
}
.char-info h4 {
  margin: 0 0 2px;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.char-sub {
  display: block;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.char-player {
  display: block;
  font-size: 11px;
}
.char-arrow {
  color: var(--muted);
  font-size: 14px;
}

.scenario-board {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.stage-tracker {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 24px;
}
.stage-tracker h4 {
  margin: 0 0 4px;
}
.stage-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
}
.stage-number {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--line);
  color: var(--accent);
  font-weight: 800;
  flex-shrink: 0;
}
.stage-copy {
  display: flex;
  flex-direction: column;
  flex: 1;
}
.stage-copy small {
  font-size: 12px;
}
.scenario-row {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}
.sr-head {
  display: flex;
  align-items: center;
  gap: 12px;
}
.scenario-code {
  font: 700 12px "DM Mono", monospace;
  background: var(--line);
  padding: 4px 8px;
  border-radius: 2px;
  color: var(--muted);
}
.sr-title {
  flex: 1;
}
.sr-title h4 {
  margin: 0 0 2px;
  font-size: 15px;
}
.scenario-log-links {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  margin-top: 8px;
}
.scenario-log-link {
  max-width: 100%;
  overflow-wrap: anywhere;
  text-align: left;
}
.sr-answers {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 13px;
}
.sr-answer-item {
  background: var(--paper);
  border: 1px solid var(--line);
  padding: 4px 10px;
  border-radius: 4px;
}
.q-label {
  font-weight: 700;
  color: var(--muted);
  margin-right: 6px;
}
.a-label {
  font-weight: 600;
  color: var(--accent);
}
.sr-note {
  background: rgba(201, 121, 84, 0.06);
  border: 1px solid rgba(201, 121, 84, 0.2);
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 13px;
}

.gallery-preview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
}
.gallery-preview-item {
  height: 100px;
  border-radius: 4px;
  overflow: hidden;
  position: relative;
  border: 1px solid var(--line);
}
.gallery-preview-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.gp-caption {
  position: absolute;
  bottom: 0;
  inset-x: 0;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 11px;
  padding: 4px 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.modal {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 6px;
  width: 100%;
  max-width: 480px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.2);
}
.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--line);
}
.modal-head h3 {
  margin: 0;
  font-size: 18px;
}
.modal-body {
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.modal-foot {
  padding: 16px 24px;
  border-top: 1px solid var(--line);
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
.color-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.color-picker {
  width: 48px;
  height: 36px;
  border: none;
  cursor: pointer;
  padding: 0;
}
.empty-state {
  text-align: center;
  padding: 24px;
  color: var(--muted);
  font-size: 13px;
  width: 100%;
}

.profile-modal-overlay {
  padding: 20px;
  background: rgba(20, 18, 17, 0.68);
  backdrop-filter: blur(5px);
}
.player-character-profile {
  width: min(720px, 100%);
  max-width: 720px;
  max-height: min(90vh, 920px);
  overflow-y: auto;
  border-radius: 16px;
  box-shadow: 0 28px 90px rgba(0, 0, 0, 0.38);
}
.profile-modal-cover {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 24px 28px 12px;
  background: linear-gradient(135deg, var(--panel), var(--paper));
}
.profile-modal-token {
  display: grid;
  place-items: center;
  width: 82px;
  height: 82px;
  flex: 0 0 82px;
  overflow: hidden;
  border: 3px solid var(--panel);
  border-radius: 50%;
  box-shadow: 0 0 0 1px var(--line), 0 8px 20px rgba(0, 0, 0, 0.16);
  color: #fff;
  font-size: 28px;
  font-weight: 700;
}
.profile-modal-token img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.profile-cover-copy {
  display: grid;
  gap: 5px;
  color: var(--muted);
  font-size: 13px;
}
.player-character-profile .modal-head {
  align-items: flex-start;
  padding: 8px 28px 20px;
  border-bottom: 0;
}
.player-character-profile .modal-head h3 {
  font-size: clamp(22px, 4vw, 30px);
  line-height: 1.2;
  letter-spacing: -0.025em;
}
.player-character-profile .delete-button {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: var(--paper);
  color: var(--ink);
  font-size: 24px;
  line-height: 1;
}
.profile-vitals {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  padding: 0 28px 20px;
}
.profile-vitals > div {
  display: grid;
  gap: 5px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--paper);
}
.profile-vitals span {
  color: var(--muted);
  font-size: 11px;
}
.profile-vitals strong {
  overflow-wrap: anywhere;
  color: var(--ink);
  font-size: 14px;
}
.player-character-profile .profile-request-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 0;
  padding: 0 28px 18px;
}
.player-character-profile .profile-request-actions p {
  margin: 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--paper);
}
.player-character-profile .player-profile-grid {
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 10px;
  padding: 0 28px 28px;
}
.player-character-profile .player-profile-grid > div {
  min-width: 0;
  padding: 13px 14px;
  border-radius: 10px;
  background: var(--paper);
}
.player-character-profile .player-profile-grid > div:last-child {
  grid-column: 1 / -1;
}
.player-character-profile .player-profile-grid dt {
  margin-bottom: 7px;
  font-size: 11px;
  letter-spacing: 0.04em;
}
.player-character-profile .player-profile-grid dd {
  overflow-wrap: anywhere;
  line-height: 1.55;
}
.player-character-profile .profile-request-form {
  margin: 0 28px 28px;
  max-height: none;
  overflow: visible;
}
.player-character-profile .profile-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 8px;
}

@media (max-width: 560px) {
  .team-detail-view {
    gap: 16px;
  }
  .team-header-card {
    padding: 16px;
  }
  .team-title-row {
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 8px;
  }
  .team-title-row h2 {
    font-size: 21px;
    overflow-wrap: anywhere;
  }
  .team-header-actions {
    width: 100%;
    flex-wrap: wrap;
  }
  .team-header-actions > * {
    flex: 1 1 auto;
  }
  .team-header-stats {
    gap: 8px;
  }
  .stat-item {
    padding: 10px;
  }
  .team-progress-summary {
    gap: 8px 10px;
  }
  .team-progress-label {
    gap: 6px 8px;
  }
  .team-progress-label strong {
    font-size: 12px;
  }
  .section-block {
    padding: 16px;
  }
  .log-backup-row {
    align-items: flex-start;
    flex-direction: column;
  }
  .log-backup-actions {
    width: 100%;
  }
  .log-backup-actions > button {
    flex: 1;
  }
  .log-reader-overlay {
    padding: 0;
  }
  .log-reader-panel {
    width: 100%;
    height: 100dvh;
    border-radius: 0;
  }
  .character-grid {
    grid-template-columns: 1fr;
  }
  .sr-head {
    align-items: flex-start;
  }
  .sr-answers {
    gap: 8px;
  }
  .form-row {
    grid-template-columns: 1fr;
  }
  .modal-overlay {
    align-items: flex-end;
    padding: 0;
  }
  .modal {
    max-height: 92dvh;
    overflow-y: auto;
    border-radius: 16px 16px 0 0;
  }
  .modal-head,
  .modal-body,
  .modal-foot {
    padding-inline: 16px;
  }
  .modal-foot {
    flex-wrap: wrap;
  }
  .profile-modal-overlay {
    align-items: flex-end;
    padding: 0;
  }
  .player-character-profile {
    width: 100%;
    max-height: 92vh;
    border-radius: 16px 16px 0 0;
  }
  .profile-modal-cover {
    gap: 14px;
    padding: 20px 20px 10px;
  }
  .profile-modal-token {
    width: 68px;
    height: 68px;
    flex-basis: 68px;
  }
  .player-character-profile .modal-head {
    padding: 8px 20px 18px;
  }
  .profile-vitals {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    padding: 0 20px 18px;
  }
  .player-character-profile .profile-request-actions {
    align-items: stretch;
    flex-direction: column;
    padding: 0 20px 16px;
  }
  .player-character-profile .player-profile-grid {
    padding: 0 20px 20px;
  }
  .player-character-profile .profile-request-form {
    margin: 0 20px 20px;
  }
}

@media (max-width: 380px) {
  .team-header-top {
    gap: 10px;
  }
  .team-symbol-lg {
    width: 44px;
    height: 44px;
    font-size: 20px;
  }
  .stat-item strong {
    font-size: 18px;
  }
  .section-heading {
    align-items: flex-start;
    flex-direction: column;
  }
  .section-heading > :last-child {
    width: 100%;
  }
}
</style>
