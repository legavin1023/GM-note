<template>
  <section class="free-board">
    <header class="board-heading">
      <div>
        <span class="eyebrow">COMMUNITY</span>
        <h2>팀 작품 게시판</h2>
        <p>
          {{ selectedTeamName || "마스터 팀 선택" }} 작품과 댓글을 나눠보세요.
        </p>
      </div>
      <button
        class="secondary-button"
        type="button"
        @click="loadPosts()"
        :disabled="loading"
      >
        새로고침
      </button>
    </header>
    <div v-if="playerViewMode" class="player-view-toolbar">
      <span v-if="playerViewMode" class="player-view-label"
        >플레이어 화면 미리보기 · 읽기 전용</span
      >
    </div>
    <div v-if="taggedCharacterIds.length" class="tag-filter-banner">
      <span
        >캐릭터 필터:
        {{ taggedCharacterIds.map(characterName).join(" · ") }}</span
      >
      <button type="button" class="text-button" @click="clearCharacterFilters">
        전체 해제
      </button>
    </div>
    <div class="team-tab-row">
      <div
        v-if="teams.length"
        class="team-board-tabs"
        role="tablist"
        aria-label="팀 작품 필터"
      >
        <button
          type="button"
          role="tab"
          class="team-board-tab"
          :class="{ active: !selectedTeamId }"
          :aria-selected="!selectedTeamId"
          @click="selectTeam('')"
        >
          전체 글
        </button>
        <button
          v-for="team in teams"
          :key="team.id"
          type="button"
          role="tab"
          class="team-board-tab"
          :class="{ active: selectedTeamId === team.id }"
          :aria-selected="selectedTeamId === team.id"
          @click="selectTeam(team.id)"
        >
          {{ team.name }}
        </button>
        <button
          type="button"
          role="tab"
          class="team-board-tab"
          :class="{ active: selectedTeamId === '__master__' }"
          :aria-selected="selectedTeamId === '__master__'"
          @click="selectTeam('__master__')"
        >
          마스터 뇌물
        </button>
      </div>
      <button
        v-if="!playerViewMode"
        type="button"
        class="primary-button composer-toggle"
        :aria-expanded="composerOpen"
        aria-controls="team-art-composer"
        @click="composerOpen = !composerOpen"
      >
        {{ composerOpen ? "작성창 닫기" : "글쓰기" }}
      </button>
    </div>
    <p v-if="pageError" class="notice error-notice" role="alert">
      {{ pageError }}
    </p>

    <transition name="composer-reveal">
      <form
        v-if="composerOpen && !playerViewMode"
        id="team-art-composer"
        class="composer card"
        @submit.prevent="createPost"
      >
        <label
          v-if="canManageBoard && !postIsMasterArtwork"
          class="form-label"
          for="post-team"
        >
          게시할 팀
          <select
            id="post-team"
            v-model="postTeamId"
            class="form-select"
            required
            :disabled="posting"
          >
            <option value="" disabled>팀을 선택하세요</option>
            <option v-for="team in teams" :key="team.id" :value="team.id">
              {{ team.name }}
            </option>
          </select>
        </label>
        <label v-if="canManageBoard" class="spoiler-toggle">
          <input
            v-model="postIsMasterArtwork"
            type="checkbox"
            :disabled="posting"
          />
          마스터 관련 작품으로 등록
        </label>
        <p v-else class="team-scope-label">
          내 팀: {{ playerTeamName || "팀 정보 없음" }}
        </p>
        <label class="sr-only" for="post-content">게시글 내용</label>
        <textarea
          id="post-content"
          v-model="postContent"
          rows="4"
          maxlength="10000"
          placeholder="무슨 이야기를 나눌까요?"
          :disabled="posting"
        />
        <div class="form-label tag-picker-label">
          <label for="post-character-tag">언급할 캐릭터</label>
          <select
            id="post-character-tag"
            v-model="tagCharacterToAdd"
            class="form-select"
            :disabled="posting"
            aria-label="게시글에 태그할 캐릭터 선택"
          >
            <option value="">캐릭터를 선택하세요</option>
            <option
              v-for="character in availableCharacters"
              :key="character.id"
              :value="character.id"
              :disabled="postCharacterTags.includes(character.id)"
            >
              {{ tagOptionLabel(character) }}
            </option>
          </select>
          <button
            class="outline-button"
            type="button"
            :disabled="!tagCharacterToAdd || posting"
            @click="addPostTag"
          >
            태그 추가
          </button>
          <button
            class="outline-button tag-all-team-button"
            type="button"
            :disabled="!postingTeamCharacters.length || posting"
            @click="addAllTeamTags"
          >
            팀 전체 태그
          </button>
        </div>
        <div v-if="postCharacterTags.length" class="tag-chip-list">
          <span
            v-for="id in postCharacterTags"
            :key="id"
            class="character-tag-chip"
          >
            @{{ characterName(id) }}
            <button
              type="button"
              :aria-label="`${characterName(id)} 태그 제거`"
              @click="removePostTag(id)"
            >
              ×
            </button>
          </span>
        </div>
        <label class="spoiler-toggle">
          <input v-model="postIsSpoiler" type="checkbox" :disabled="posting" />
          스포일러 포함 (내용과 이미지를 가려서 표시)
        </label>
        <div class="composer-footer">
          <div class="attachment-tools">
            <label class="file-button" for="post-files"
              >이미지 첨부 (최대 10장)</label
            >
            <input
              id="post-files"
              ref="postInput"
              class="sr-only"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              :disabled="posting"
              @change="selectPostFiles"
            />
            <div v-if="postFiles.length" class="preview-row">
              <figure
                v-for="(item, index) in postFiles"
                :key="item.key"
                class="preview-item"
              >
                <img
                  :src="item.preview"
                  :alt="`첨부 이미지 ${index + 1} 미리보기`"
                />
                <button
                  type="button"
                  :aria-label="`이미지 ${index + 1} 제거`"
                  @click="removePostFile(index)"
                >
                  ×
                </button>
              </figure>
            </div>
          </div>
          <button
            class="primary-button"
            type="submit"
            :disabled="posting || !canSubmitPost"
          >
            {{ posting ? "등록 중…" : "게시글 등록" }}
          </button>
        </div>
        <p v-if="postError" class="field-error" role="alert">{{ postError }}</p>
      </form>
    </transition>

    <div v-if="loading && !posts.length" class="state-card">
      게시글을 불러오는 중입니다…
    </div>
    <div v-else-if="!posts.length && !pageError" class="state-card">
      아직 게시글이 없습니다. 첫 글을 남겨보세요.
    </div>
    <div v-else class="post-list">
      <article
        v-for="post in posts"
        :id="`post-${post.id}`"
        :key="post.id"
        class="post-card card"
      >
        <header class="post-author">
          <img
            :src="post.avatar_url || defaultAvatar"
            :alt="`${post.nickname} 프로필`"
            @error="useDefaultAvatar"
          />
          <div class="author-meta">
            <strong>{{ post.nickname || "사용자" }}</strong
            ><time :datetime="post.created_at">{{
              formatDate(post.created_at)
            }}</time>
          </div>
          <label v-if="canManageBoard" class="moderation-toggle">
            <input
              type="checkbox"
              :checked="post.is_spoiler"
              :disabled="post.moderating || playerViewMode"
              @change="toggleSpoiler(post, $event)"
            />
            스포일러
          </label>
          <button
            v-if="canManageBoard"
            class="danger-button"
            type="button"
            @click="deletePost(post)"
          >
            삭제
          </button>
        </header>
        <div v-if="canManageBoard && !post.team_id" class="legacy-assignment">
          <label class="form-label">
            기존 글 팀 지정
            <select
              v-model="post.assignmentDraft"
              class="form-select"
              :disabled="playerViewMode"
            >
              <option value="">팀 선택</option>
              <option v-for="team in teams" :key="team.id" :value="team.id">
                {{ team.name }}
              </option>
            </select>
          </label>
          <button
            class="outline-button"
            type="button"
            :disabled="
              !post.assignmentDraft || post.moderating || playerViewMode
            "
            :class="{ 'preview-disabled': playerViewMode }"
            @click="assignPost(post)"
          >
            팀에 배정
          </button>
        </div>
        <p
          v-if="canManageBoard && post.moderationError"
          class="field-error"
          role="alert"
        >
          {{ post.moderationError }}
        </p>
        <div
          v-if="post.character_tags?.length || canManageBoard || playerViewMode"
          class="character-tags"
        >
          <span class="tag-caption">언급된 캐릭터</span>
          <button
            v-for="taggedCharacter in taggedCharacters(post)"
            :key="taggedCharacter.id"
            type="button"
            class="character-tag"
            :class="{ active: taggedCharacterIds.includes(taggedCharacter.id) }"
            :aria-pressed="taggedCharacterIds.includes(taggedCharacter.id)"
            @click="toggleCharacterFilter(taggedCharacter.id)"
          >
            @{{ taggedCharacter.character_name || taggedCharacter.username }}
          </button>
          <span v-if="!post.character_tags?.length" class="muted tag-empty"
            >태그 없음</span
          >
          <div v-if="canManageBoard" class="moderation-toggle tag-admin-picker">
            마스터 태그 수정
            <select
              v-model="post.tagToAdd"
              class="form-select"
              :disabled="post.moderating || playerViewMode"
              aria-label="마스터 캐릭터 태그 수정"
            >
              <option value="">캐릭터 선택</option>
              <option
                v-for="character in allCharacters"
                :key="character.id"
                :value="character.id"
                :disabled="post.tagDraft.includes(character.id)"
              >
                {{ tagOptionLabel(character) }}
              </option>
            </select>
            <button
              type="button"
              class="outline-button"
              :disabled="!post.tagToAdd || post.moderating || playerViewMode"
              :class="{ 'preview-disabled': playerViewMode }"
              @click="addExistingPostTag(post)"
            >
              추가
            </button>
            <span
              v-for="id in post.tagDraft"
              :key="id"
              class="character-tag-chip"
            >
              @{{ characterName(id) }}
              <button
                type="button"
                :disabled="post.moderating || playerViewMode"
                :aria-label="`${characterName(id)} 태그 제거`"
                @click="removeExistingPostTag(post, id)"
              >
                ×
              </button>
            </span>
            <button
              type="button"
              class="outline-button"
              :disabled="
                post.moderating ||
                playerViewMode ||
                sameIds(post.tagDraft, post.character_tags)
              "
              :class="{ 'preview-disabled': playerViewMode }"
              @click="savePostTags(post)"
            >
              저장
            </button>
          </div>
        </div>
        <span v-if="post.is_master_artwork" class="team-pill">마스터 뇌물</span>
        <span v-else-if="post.team_id" class="team-pill">{{
          teamNameFor(post.team_id)
        }}</span>
        <div class="post-artwork-wrap">
          <button
            v-if="post.is_spoiler && !revealedSpoilers[post.id]"
            class="spoiler-reveal"
            type="button"
            @click="revealSpoiler(post.id)"
          >
            스포일러 작품 보기
          </button>
          <div
            :class="{
              'spoiler-blur': post.is_spoiler && !revealedSpoilers[post.id],
            }"
          >
            <p v-if="post.content" class="post-content">{{ post.content }}</p>
            <div
              v-if="post.image_paths?.length"
              class="post-image-carousel"
              :class="{ 'has-arrows': post.image_paths.length > 1 }"
            >
              <button
                v-if="post.image_paths.length > 1"
                class="carousel-peek carousel-arrow-left"
                type="button"
                :aria-label="`이전 이미지 (${post.image_index + 1}/${
                  post.image_paths.length
                })`"
                @click="movePostImage(post, -1)"
              >
                <img :src="adjacentPostImage(post, -1)" alt="" />
                ↑ 이전
              </button>
              <button
                type="button"
                class="image-open carousel-image"
                :aria-label="`게시글 이미지 ${post.image_index + 1} 확대`"
                @click="openPostImage(post)"
                @touchstart.passive="startPostImageSwipe(post, $event)"
                @touchend.passive="endPostImageSwipe(post, $event)"
              >
                <img
                  :src="post.image_urls[post.image_index]"
                  :alt="`게시글 첨부 이미지 ${post.image_index + 1}`"
                />
              </button>
              <div v-if="post.image_paths.length > 1" class="carousel-footer">
                <span
                  >{{ post.image_index + 1 }} /
                  {{ post.image_paths.length }}</span
                >
                <button
                  class="carousel-peek carousel-arrow-right"
                  type="button"
                  :aria-label="`다음 이미지 (${post.image_index + 1}/${
                    post.image_paths.length
                  })`"
                  @click="movePostImage(post, 1)"
                >
                  <img :src="adjacentPostImage(post, 1)" alt="" />
                  ↓ 다음
                </button>
              </div>
            </div>
          </div>
          <section class="comments">
            <h3>
              댓글 <span>{{ (post.comments || []).length }}</span>
            </h3>
            <p v-if="!(post.comments || []).length" class="no-comments">
              첫 댓글을 남겨보세요.
            </p>
            <div
              v-for="comment in post.comments || []"
              :key="comment.id"
              class="comment-row"
            >
              <img
                class="comment-avatar"
                :src="comment.avatar_url || defaultAvatar"
                :alt="`${comment.nickname} 프로필`"
                @error="useDefaultAvatar"
              />
              <div class="comment-body">
                <div class="comment-meta">
                  <strong>{{ comment.nickname || "사용자" }}</strong
                  ><time :datetime="comment.created_at">{{
                    formatDate(comment.created_at)
                  }}</time>
                </div>
                <p v-if="comment.content" class="comment-content">
                  {{ comment.content }}
                </p>
                <button
                  v-if="comment.image_path"
                  type="button"
                  class="comment-image image-open"
                  aria-label="댓글 이미지 확대"
                  @click="openImage(comment.image_url)"
                >
                  <img :src="comment.image_url" alt="댓글 첨부 이미지" />
                </button>
              </div>
              <button
                v-if="canManageBoard"
                class="comment-delete"
                type="button"
                aria-label="댓글 삭제"
                @click="deleteComment(post, comment)"
              >
                ×
              </button>
            </div>
            <form
              v-if="!playerViewMode"
              class="comment-form"
              @submit.prevent="createComment(post)"
            >
              <label class="sr-only" :for="`comment-${post.id}`"
                >댓글 내용</label
              >
              <textarea
                :id="`comment-${post.id}`"
                v-model="commentDrafts[post.id].content"
                rows="2"
                maxlength="4000"
                placeholder="댓글을 입력하세요"
                :disabled="commentDrafts[post.id].posting"
              />
              <div class="comment-form-footer">
                <div class="comment-attachment">
                  <label
                    class="file-button compact"
                    :for="`comment-file-${post.id}`"
                    >이미지</label
                  >
                  <input
                    :id="`comment-file-${post.id}`"
                    :ref="(el) => setCommentInput(post.id, el)"
                    class="sr-only"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    :disabled="commentDrafts[post.id].posting"
                    @change="(event) => selectCommentFile(post.id, event)"
                  />
                  <span v-if="commentDrafts[post.id].file" class="selected-file"
                    >{{ commentDrafts[post.id].file.name }}
                    <button
                      type="button"
                      aria-label="댓글 이미지 제거"
                      @click="clearCommentFile(post.id)"
                    >
                      ×
                    </button></span
                  >
                  <img
                    v-if="commentDrafts[post.id].preview"
                    class="comment-preview"
                    :src="commentDrafts[post.id].preview"
                    alt="댓글 이미지 미리보기"
                  />
                </div>
                <button
                  class="secondary-button"
                  type="submit"
                  :disabled="
                    commentDrafts[post.id].posting || !canSubmitComment(post.id)
                  "
                >
                  {{
                    commentDrafts[post.id].posting ? "등록 중…" : "댓글 등록"
                  }}
                </button>
              </div>
              <p
                v-if="commentDrafts[post.id].error"
                class="field-error"
                role="alert"
              >
                {{ commentDrafts[post.id].error }}
              </p>
            </form>
          </section>
        </div>
      </article>
      <button
        v-if="hasMore && !loading"
        class="secondary-button load-more"
        type="button"
        @click="loadMore"
      >
        이전 게시글 더 보기
      </button>
      <p v-if="loading && posts.length" class="loading-more">불러오는 중…</p>
    </div>
    <div
      v-if="lightboxUrl"
      class="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="이미지 확대 보기"
      tabindex="-1"
      @click.self="lightboxUrl = null"
      @keydown.esc="lightboxUrl = null"
    >
      <button
        type="button"
        class="lightbox-close"
        aria-label="닫기"
        @click="lightboxUrl = null"
      >
        ×</button
      ><img :src="lightboxUrl" alt="확대 이미지" />
    </div>
  </section>
</template>

<script>
import { supabase } from "@/supabase";

const BUCKET = "free-board-images";
const PAGE_SIZE = 20;
const MAX_BYTES = 10 * 1024 * 1024;
const MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const DEFAULT_AVATAR = `${process.env.BASE_URL}image/default.webp`;

export default {
  name: "FreeBoardView",
  data() {
    return {
      user: null,
      isAdmin: false,
      posts: [],
      composerOpen: false,
      postContent: "",
      postFiles: [],
      commentDrafts: {},
      commentInputs: {},
      loading: true,
      posting: false,
      pageError: "",
      postError: "",
      hasMore: false,
      offset: 0,
      lightboxUrl: "",
      teams: [],
      masterTagTargets: [],
      selectedTeamId: "",
      postTeamId: "",
      postIsSpoiler: false,
      postIsMasterArtwork: false,
      postCharacterTags: [],
      tagCharacterToAdd: "",
      revealedSpoilers: {},
      playerTeamId: "",
      taggedCharacterIds: [],
      defaultAvatar: DEFAULT_AVATAR,
    };
  },
  computed: {
    playerViewMode() {
      return this.$store.getters.isPlayerPreview;
    },
    canSubmitPost() {
      return Boolean(
        (this.postContent.trim() || this.postFiles.length) &&
          (this.isAdmin
            ? this.postIsMasterArtwork || this.postTeamId
            : this.playerTeamId)
      );
    },
    canManageBoard() {
      return this.isAdmin && !this.playerViewMode;
    },
    selectedTeamName() {
      if (this.selectedTeamId === "__master__") return "마스터 뇌물";
      return this.selectedTeamId
        ? this.teams.find((team) => team.id === this.selectedTeamId)?.name ||
            "선택한 팀"
        : "전체 팀";
    },
    playerTeamName() {
      return (
        this.teams.find((team) => team.id === this.playerTeamId)?.name || ""
      );
    },
    allCharacters() {
      const characters = (this.teams || []).flatMap((team) =>
        (team.characters || team.users || []).map((character) => ({
          ...character,
          team_id: character.team_id || team.id,
        }))
      );
      this.masterTagTargets.forEach((target) => {
        const existing = characters.find(
          (character) => character.id === target.id
        );
        if (existing) {
          existing.username = target.label;
          existing.character_name = target.label;
          existing.team_id = null;
          existing.is_gm = true;
        } else {
          characters.push({
            id: target.id,
            username: target.label,
            character_name: target.label,
            team_id: null,
            is_gm: true,
          });
        }
      });
      if (
        this.isAdmin &&
        this.user?.id &&
        !characters.some((item) => item.id === this.user.id)
      ) {
        characters.push({
          id: this.user.id,
          username: "마스터",
          character_name: "마스터",
          team_id: null,
          is_gm: true,
        });
      }
      return characters;
    },
    availableCharacters() {
      if (this.isAdmin) return this.allCharacters;
      return this.allCharacters.filter(
        (character) =>
          character.team_id === this.playerTeamId || character.is_gm
      );
    },
    postingTeamCharacters() {
      const teamId = this.isAdmin ? this.postTeamId : this.playerTeamId;
      if (!teamId) return [];
      return this.allCharacters.filter(
        (character) => character.team_id === teamId
      );
    },
  },
  async mounted() {
    await this.initialize();
  },
  watch: {
    "$store.state.gmPreviewTeamId"(teamId) {
      if (!this.playerViewMode || !teamId) return;
      this.playerTeamId = teamId;
      this.selectedTeamId = "";
      this.postTeamId = teamId;
      this.composerOpen = false;
      if (this.user) this.loadPosts();
    },
    "$store.state.gmPlayerPreviewMode"(enabled) {
      if (!enabled) return;
      const teamId = this.$store.getters.activePlayerTeamId;
      if (!teamId) return;
      this.playerTeamId = teamId;
      this.selectedTeamId = "";
      this.postTeamId = teamId;
      this.composerOpen = false;
      if (this.user) this.loadPosts();
    },
    "$route.query"() {
      this.syncCharacterFiltersFromRoute();
      const requestedTeam = String(this.$route.query.teamId || "");
      this.selectedTeamId =
        requestedTeam === "__master__"
          ? "__master__"
          : this.teams.some((team) => team.id === requestedTeam)
          ? requestedTeam
          : "";
      if (this.user) this.loadPosts();
    },
  },
  beforeUnmount() {
    this.postFiles.forEach((item) => URL.revokeObjectURL(item.preview));
    Object.values(this.commentDrafts).forEach((draft) => {
      if (draft.preview) URL.revokeObjectURL(draft.preview);
    });
    this._preloadedPostImages?.clear();
  },
  methods: {
    async initialize() {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        this.pageError =
          "로그인 정보를 확인하지 못했습니다. 다시 로그인해 주세요.";
        this.loading = false;
        return;
      }
      this.user = data.user;
      const { data: gm, error: gmError } = await supabase.rpc(
        "current_user_is_gm"
      );
      if (!gmError) this.isAdmin = Boolean(gm);
      const { data: masterTargets, error: masterTargetsError } =
        await supabase.rpc("player_team_art_master_tag_targets");
      if (masterTargetsError) {
        console.warn("Master tag targets unavailable", masterTargetsError);
      } else {
        this.masterTagTargets = (masterTargets || []).map((target) => ({
          id: target.id,
          label: target.label || "마스터",
        }));
      }
      this.teams = this.$store.state.teams || [];
      this.syncCharacterFiltersFromRoute();
      if (this.isAdmin) {
        const requestedTeam = String(this.$route.query.teamId || "");
        const previewTeamId = this.$store.getters.activePlayerTeamId;
        this.selectedTeamId =
          this.playerViewMode &&
          !this.teams.some((team) => team.id === requestedTeam)
            ? ""
            : requestedTeam === "__master__"
            ? "__master__"
            : this.teams.some((team) => team.id === requestedTeam)
            ? requestedTeam
            : "";
        this.playerTeamId = previewTeamId || "";
        this.postTeamId = this.playerViewMode
          ? previewTeamId
          : this.selectedTeamId;
      } else {
        const { data: context, error: contextError } = await supabase.rpc(
          "player_character_context"
        );
        if (contextError || !Array.isArray(context) || !context[0]?.team_id) {
          this.pageError =
            "소속 팀을 확인하지 못했습니다. 관리자에게 문의해 주세요.";
          this.loading = false;
          return;
        }
        this.playerTeamId = context[0].team_id;
        const requestedTeam = String(this.$route.query.teamId || "");
        this.selectedTeamId =
          requestedTeam === "__master__"
            ? "__master__"
            : this.teams.some((team) => team.id === requestedTeam)
            ? requestedTeam
            : "";
        this.postTeamId = this.playerTeamId;
      }
      await this.loadPosts();
    },
    selectTeam(teamId) {
      if (this.selectedTeamId === teamId && !this.$route.query.postId) return;
      this.selectedTeamId = teamId;
      this.offset = 0;
      if (this.$route.query.postId) {
        const query = {
          ...this.$route.query,
          teamId: teamId || undefined,
          postId: undefined,
        };
        this.$router.replace({
          name: "free-board",
          query,
        });
        return;
      }
      this.loadPosts();
    },
    async loadPosts(append = false) {
      this.loading = true;
      this.pageError = "";
      const from = append ? this.offset : 0;
      let query = supabase
        .from("team_art_posts")
        .select(
          "id, team_id, user_id, nickname, avatar_url, content, image_paths, is_spoiler, is_master_artwork, character_tags, created_at, team_art_comments(id, user_id, nickname, avatar_url, content, image_path, created_at)"
        );
      // The team tab is a display filter. RLS lets signed-in users browse all
      // team artwork; write policies still restrict where players can post.
      if (this.taggedCharacterIds.length) {
        query = query.overlaps("character_tags", this.taggedCharacterIds);
      }
      if (this.selectedTeamId === "__master__") {
        query = query.eq("is_master_artwork", true);
      } else if (this.selectedTeamId) {
        query = query.eq("team_id", this.selectedTeamId);
      }
      const notificationPostId = String(this.$route.query.postId || "");
      if (notificationPostId) {
        query = query.eq("id", notificationPostId);
      }
      const { data, error } = await query
        .order("created_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (error) {
        const migrationHint = error.message?.includes("is_master_artwork")
          ? "migration_npc_lore_and_master_art.sql까지 적용했는지 확인해 주세요. 이 파일은 migration_team_art_character_tags.sql과 migration_team_art_all_users_read.sql 적용 후 실행해야 합니다."
          : "migration_team_art_board.sql 및 필요한 후속 마이그레이션 적용 여부를 확인해 주세요.";
        this.pageError = `작품 글을 불러오지 못했습니다. ${migrationHint} (${error.message})`;
        console.error("[FreeBoard] load posts", error);
        this.loading = false;
        return;
      }
      return this.processLoadedPosts(data || [], append);
    },
    async processLoadedPosts(data, append) {
      const authors = data.flatMap((post) => [
        post,
        ...(post.team_art_comments || []),
      ]);
      const tokenUrls = await this.loadAuthorTokenUrls(authors);
      const rows = await Promise.all(
        data.map(async (post) => {
          const imagePaths = this.parsePaths(post.image_paths);
          const comments = await Promise.all(
            (post.team_art_comments || []).map(async (comment) => ({
              ...comment,
              avatar_url: this.authorAvatar(comment, tokenUrls),
              image_url: comment.image_path
                ? await this.signedUrl(comment.image_path)
                : "",
            }))
          );
          return {
            ...post,
            avatar_url: this.authorAvatar(post, tokenUrls),
            assignmentDraft: post.team_id || "",
            character_tags: post.character_tags || [],
            tagDraft: [...(post.character_tags || [])],
            tagToAdd: "",
            image_paths: imagePaths,
            image_index: 0,
            image_urls: await Promise.all(
              imagePaths.map((path) => this.signedUrl(path))
            ),
            comments: comments.sort(
              (a, b) => new Date(a.created_at) - new Date(b.created_at)
            ),
          };
        })
      );
      rows.forEach((post) => this.preloadPostImages(post.image_urls));
      this.posts = append ? [...this.posts, ...rows] : rows;
      this.offset = this.posts.length;
      this.hasMore = rows.length === PAGE_SIZE;
      this.ensureDrafts(this.posts);
      this.loading = false;
      const targetPostId = String(this.$route.query.postId || "");
      if (targetPostId) {
        this.$nextTick(() => {
          document.getElementById(`post-${targetPostId}`)?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        });
      }
    },
    async loadAuthorTokenUrls(authors) {
      const userIds = [
        ...new Set(authors.map((author) => author.user_id).filter(Boolean)),
      ];
      if (!userIds.length) return {};
      const { data, error } = await supabase.rpc("team_art_author_profiles", {
        p_user_ids: userIds,
      });
      if (error) {
        console.warn("[FreeBoard] author token images unavailable", error);
        return {};
      }
      return Object.fromEntries(
        (data || []).map((profile) => [profile.user_id, profile])
      );
    },
    authorAvatar(author, tokenUrls) {
      const profile = tokenUrls[author.user_id];
      if (
        profile?.is_gm ||
        (this.isAdmin && author.user_id === this.user?.id)
      ) {
        return DEFAULT_AVATAR;
      }
      return profile?.token_url || author.avatar_url || DEFAULT_AVATAR;
    },
    async signedUrl(path) {
      if (!path) return "";
      if (/^(https?:|data:)/i.test(path)) return path;
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, 3600);
      if (error) {
        const legacy = await supabase.storage
          .from("post-images")
          .createSignedUrl(path, 3600);
        if (legacy.error) {
          console.error("[FreeBoard] image URL", error, legacy.error);
          return "";
        }
        return legacy.data.signedUrl;
      }
      return data.signedUrl;
    },
    teamNameFor(teamId) {
      return this.teams.find((team) => team.id === teamId)?.name || "팀 작품";
    },
    movePostImage(post, delta) {
      const total = post.image_paths.length;
      if (!total) return;
      post.image_index = (post.image_index + delta + total) % total;
    },
    syncCharacterFiltersFromRoute() {
      const queryIds = this.$route.query.characterIds;
      const values = Array.isArray(queryIds)
        ? queryIds.flatMap((value) => String(value || "").split(","))
        : String(queryIds || this.$route.query.characterId || "").split(",");
      this.taggedCharacterIds = [
        ...new Set(values.map((id) => id.trim()).filter(Boolean)),
      ];
    },
    toggleCharacterFilter(characterId) {
      const next = this.taggedCharacterIds.includes(characterId)
        ? this.taggedCharacterIds.filter((id) => id !== characterId)
        : [...this.taggedCharacterIds, characterId];
      const query = { ...this.$route.query, characterId: undefined };
      if (next.length) query.characterIds = next.join(",");
      else query.characterIds = undefined;
      this.$router.replace({ name: "free-board", query });
    },
    clearCharacterFilters() {
      const query = {
        ...this.$route.query,
        characterId: undefined,
        characterIds: undefined,
      };
      this.$router.replace({ name: "free-board", query });
    },
    adjacentPostImage(post, direction) {
      const total = post.image_urls.length;
      if (total < 2) return "";
      const index = (post.image_index + direction + total) % total;
      return post.image_urls[index] || "";
    },
    startPostImageSwipe(post, event) {
      if (post.image_paths.length < 2) return;
      this._postSwipeStart = {
        postId: post.id,
        x: event.changedTouches[0].clientX,
      };
    },
    endPostImageSwipe(post, event) {
      if (!this._postSwipeStart || this._postSwipeStart.postId !== post.id)
        return;
      const distance = event.changedTouches[0].clientX - this._postSwipeStart.x;
      this._postSwipeStart = null;
      if (Math.abs(distance) < 45) return;
      this._skipNextPostImageClick = post.id;
      this.movePostImage(post, distance < 0 ? 1 : -1);
      setTimeout(() => {
        if (this._skipNextPostImageClick === post.id) {
          this._skipNextPostImageClick = null;
        }
      }, 500);
    },
    openPostImage(post) {
      if (this._skipNextPostImageClick === post.id) {
        this._skipNextPostImageClick = null;
        return;
      }
      this.openImage(post.image_urls[post.image_index]);
    },
    preloadPostImages(urls) {
      if (!this._preloadedPostImages) this._preloadedPostImages = new Map();
      urls.filter(Boolean).forEach((url) => {
        if (this._preloadedPostImages.has(url)) return;
        const image = new Image();
        image.decoding = "async";
        image.src = url;
        this._preloadedPostImages.set(url, image);
      });
    },
    taggedCharacters(post) {
      return (post.character_tags || [])
        .map((id) =>
          this.allCharacters.find((character) => character.id === id)
        )
        .filter(Boolean);
    },
    characterName(id) {
      const taggedCharacter = this.allCharacters.find((item) => item.id === id);
      if (taggedCharacter?.is_gm) return "마스터";
      if (this.isAdmin && id === this.user?.id) return "마스터";
      const character = taggedCharacter;
      return character?.character_name || character?.username || "캐릭터";
    },
    tagOptionLabel(character) {
      if (character.is_gm || (this.isAdmin && character.id === this.user?.id)) {
        return character.username && character.username !== "마스터"
          ? `마스터 · ${character.username}`
          : "마스터";
      }
      const name = character.character_name || character.username || "캐릭터";
      return `${name} · ${this.teamNameFor(character.team_id)}`;
    },
    addPostTag() {
      const id = this.tagCharacterToAdd;
      if (!id || this.postCharacterTags.includes(id)) return;
      this.postCharacterTags = [...this.postCharacterTags, id];
      this.tagCharacterToAdd = "";
    },
    addAllTeamTags() {
      this.postCharacterTags = this.postingTeamCharacters.map(
        (character) => character.id
      );
      this.tagCharacterToAdd = "";
    },
    removePostTag(id) {
      this.postCharacterTags = this.postCharacterTags.filter(
        (tagId) => tagId !== id
      );
    },
    addExistingPostTag(post) {
      if (!post.tagToAdd || post.tagDraft.includes(post.tagToAdd)) return;
      post.tagDraft = [...post.tagDraft, post.tagToAdd];
      post.tagToAdd = "";
    },
    removeExistingPostTag(post, id) {
      post.tagDraft = post.tagDraft.filter((tagId) => tagId !== id);
    },
    sameIds(left = [], right = []) {
      return (
        left.length === right.length && left.every((id) => right.includes(id))
      );
    },
    async savePostTags(post) {
      if (!this.canManageBoard || post.moderating) return;
      post.moderating = true;
      post.moderationError = "";
      const tags = [...new Set(post.tagDraft || [])];
      const { error } = await supabase
        .from("team_art_posts")
        .update({ character_tags: tags })
        .eq("id", post.id);
      if (error) {
        console.error("[FreeBoard] update character tags", error);
        post.moderationError = "캐릭터 태그를 저장하지 못했습니다.";
        post.tagDraft = [...post.character_tags];
      } else {
        post.character_tags = tags;
        post.tagDraft = [...tags];
      }
      post.moderating = false;
    },
    revealSpoiler(postId) {
      this.revealedSpoilers = { ...this.revealedSpoilers, [postId]: true };
    },
    async toggleSpoiler(post, event) {
      if (!this.canManageBoard || post.moderating) return;
      const nextValue = event.target.checked;
      post.moderating = true;
      post.moderationError = "";
      const { error } = await supabase
        .from("team_art_posts")
        .update({ is_spoiler: nextValue })
        .eq("id", post.id);
      if (error) {
        console.error("[FreeBoard] update spoiler", error);
        post.moderationError = "스포일러 표시를 저장하지 못했습니다.";
        event.target.checked = post.is_spoiler;
      } else {
        post.is_spoiler = nextValue;
        if (nextValue) {
          const remaining = { ...this.revealedSpoilers };
          delete remaining[post.id];
          this.revealedSpoilers = remaining;
        }
      }
      post.moderating = false;
    },
    async assignPost(post) {
      if (!this.canManageBoard || !post.assignmentDraft || post.moderating)
        return;
      post.moderating = true;
      post.moderationError = "";
      const { error } = await supabase
        .from("team_art_posts")
        .update({ team_id: post.assignmentDraft })
        .eq("id", post.id);
      if (error) {
        console.error("[FreeBoard] assign legacy post", error);
        post.moderationError = "이전 글을 팀에 배정하지 못했습니다.";
      } else {
        post.team_id = post.assignmentDraft;
        if (this.selectedTeamId && this.selectedTeamId !== post.team_id) {
          this.posts = this.posts.filter((item) => item.id !== post.id);
        }
      }
      post.moderating = false;
    },
    parsePaths(value) {
      if (Array.isArray(value)) return value;
      try {
        return JSON.parse(value || "[]");
      } catch (_) {
        return [];
      }
    },
    ensureDrafts(posts) {
      posts.forEach((post) => {
        if (!this.commentDrafts[post.id])
          this.commentDrafts[post.id] = {
            content: "",
            file: null,
            preview: "",
            posting: false,
            error: "",
          };
      });
    },
    validateFile(file) {
      if (!MIME_TYPES.includes(file.type))
        throw new Error("JPEG, PNG, WebP, GIF 이미지만 첨부할 수 있습니다.");
      if (file.size > MAX_BYTES)
        throw new Error("이미지는 파일당 10MB 이하만 첨부할 수 있습니다.");
    },
    selectPostFiles(event) {
      const incoming = Array.from(event.target.files || []);
      event.target.value = "";
      try {
        if (this.postFiles.length + incoming.length > 10)
          throw new Error(
            "게시글에는 이미지를 최대 10장까지 첨부할 수 있습니다."
          );
        incoming.forEach((file) => this.validateFile(file));
        this.postError = "";
        this.postFiles.push(
          ...incoming.map((file) => ({
            file,
            preview: URL.createObjectURL(file),
            key: `${Date.now()}-${Math.random()}`,
          }))
        );
      } catch (error) {
        this.postError = error.message;
      }
    },
    removePostFile(index) {
      const [item] = this.postFiles.splice(index, 1);
      if (item) URL.revokeObjectURL(item.preview);
    },
    setCommentInput(id, el) {
      if (el) this.commentInputs[id] = el;
    },
    selectCommentFile(id, event) {
      const draft = this.commentDrafts[id];
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      try {
        this.validateFile(file);
        if (draft.preview) URL.revokeObjectURL(draft.preview);
        draft.file = file;
        draft.preview = URL.createObjectURL(file);
        draft.error = "";
      } catch (error) {
        draft.error = error.message;
      }
    },
    clearCommentFile(id) {
      const draft = this.commentDrafts[id];
      if (draft.preview) URL.revokeObjectURL(draft.preview);
      draft.file = null;
      draft.preview = "";
      if (this.commentInputs[id]) this.commentInputs[id].value = "";
    },
    canSubmitComment(id) {
      const draft = this.commentDrafts[id];
      return Boolean(draft && (draft.content.trim() || draft.file));
    },
    authorInfo() {
      const metadata = this.user?.user_metadata || {};
      return {
        nickname:
          metadata.nickname ||
          metadata.name ||
          metadata.full_name ||
          this.user?.email?.split("@")[0] ||
          "사용자",
        avatar_url: metadata.avatar_url || metadata.picture || null,
      };
    },
    makePath(file, kind, id) {
      const ext = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif",
      }[file.type];
      return `${this.user.id}/${kind}/${id}/${crypto.randomUUID()}.${ext}`;
    },
    async uploadFiles(items, kind, id) {
      const uploaded = [];
      for (const item of items) {
        const file = item.file || item;
        const path = this.makePath(file, kind, id);
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false });
        if (error) {
          if (uploaded.length) await this.cleanup(uploaded);
          throw error;
        }
        uploaded.push(path);
      }
      return uploaded;
    },
    async cleanup(paths) {
      if (!paths.length) return;
      const { error } = await supabase.storage.from(BUCKET).remove(paths);
      if (error) throw error;
    },
    async createPost() {
      if (this.playerViewMode || this.posting || !this.canSubmitPost) return;
      this.posting = true;
      this.postError = "";
      let uploaded = [];
      try {
        const postId = crypto.randomUUID();
        uploaded = await this.uploadFiles(this.postFiles, "posts", postId);
        const { nickname, avatar_url } = this.authorInfo();
        const { error } = await supabase.from("team_art_posts").insert({
          id: postId,
          team_id: this.isAdmin
            ? this.postIsMasterArtwork
              ? null
              : this.postTeamId
            : this.playerTeamId,
          user_id: this.user.id,
          nickname,
          avatar_url,
          content: this.postContent.trim(),
          image_paths: uploaded,
          is_spoiler: this.postIsSpoiler,
          is_master_artwork: this.isAdmin && this.postIsMasterArtwork,
          character_tags: [...new Set(this.postCharacterTags)],
        });
        if (error) throw error;
        this.postFiles.forEach((item) => URL.revokeObjectURL(item.preview));
        this.postFiles = [];
        this.postContent = "";
        this.postIsSpoiler = false;
        this.postIsMasterArtwork = false;
        this.postCharacterTags = [];
        this.tagCharacterToAdd = "";
        this.composerOpen = false;
        await this.loadPosts();
      } catch (error) {
        try {
          await this.cleanup(uploaded);
        } catch (cleanupError) {
          console.error("[FreeBoard] cleanup uploaded images", cleanupError);
        }
        console.error("[FreeBoard] create post", error);
        this.postError = error.message?.includes("is_master_artwork")
          ? "마스터 뇌물 필드가 없습니다. migration_npc_lore_and_master_art.sql을 필요한 선행 마이그레이션 뒤에 적용해 주세요."
          : error.message?.includes("team_art_posts")
          ? "팀 작품 게시판 설정이 필요합니다. 관리자에게 마이그레이션 적용을 요청해 주세요."
          : "게시글을 등록하지 못했습니다. 입력 내용과 첨부 이미지는 유지했습니다.";
      } finally {
        this.posting = false;
      }
    },
    async createComment(post) {
      const draft = this.commentDrafts[post.id];
      if (
        this.playerViewMode ||
        !draft ||
        draft.posting ||
        !this.canSubmitComment(post.id)
      )
        return;
      draft.posting = true;
      draft.error = "";
      let uploaded = [];
      try {
        const commentId = crypto.randomUUID();
        uploaded = draft.file
          ? await this.uploadFiles([draft.file], "comments", commentId)
          : [];
        const { nickname, avatar_url } = this.authorInfo();
        const { data, error } = await supabase
          .from("team_art_comments")
          .insert({
            id: commentId,
            post_id: post.id,
            user_id: this.user.id,
            nickname,
            avatar_url,
            content: draft.content.trim(),
            image_path: uploaded[0] || null,
          })
          .select(
            "id, user_id, nickname, avatar_url, content, image_path, created_at"
          )
          .single();
        if (error) throw error;
        const comment = {
          ...data,
          avatar_url: this.authorAvatar(
            data,
            await this.loadAuthorTokenUrls([data])
          ),
          image_url: data.image_path
            ? await this.signedUrl(data.image_path)
            : "",
        };
        const target = this.posts.find((item) => item.id === post.id);
        target.comments = [...(target.comments || []), comment].sort(
          (a, b) => new Date(a.created_at) - new Date(b.created_at)
        );
        draft.content = "";
        this.clearCommentFile(post.id);
      } catch (error) {
        try {
          await this.cleanup(uploaded);
        } catch (cleanupError) {
          console.error("[FreeBoard] cleanup comment image", cleanupError);
        }
        console.error("[FreeBoard] create comment", error);
        draft.error =
          "댓글을 등록하지 못했습니다. 입력 내용과 첨부 이미지는 유지했습니다.";
      } finally {
        draft.posting = false;
      }
    },
    async deletePost(post) {
      if (
        !this.canManageBoard ||
        !window.confirm(
          "이 게시글과 댓글을 삭제할까요? 첨부 파일도 함께 삭제됩니다."
        )
      )
        return;
      try {
        const paths = [...post.image_paths];
        (post.comments || []).forEach((comment) => {
          if (comment.image_path) paths.push(comment.image_path);
        });
        const { error } = await supabase
          .from("team_art_posts")
          .delete()
          .eq("id", post.id);
        if (error) throw error;
        this.posts = this.posts.filter((item) => item.id !== post.id);
        await this.cleanup(paths);
      } catch (error) {
        console.error("[FreeBoard] delete post", error);
        this.pageError = "게시글 또는 첨부 파일 일부를 삭제하지 못했습니다.";
        await this.loadPosts();
      }
    },
    async deleteComment(post, comment) {
      if (!this.canManageBoard || !window.confirm("이 댓글을 삭제할까요?"))
        return;
      try {
        const { error } = await supabase
          .from("team_art_comments")
          .delete()
          .eq("id", comment.id);
        if (error) throw error;
        const target = this.posts.find((item) => item.id === post.id);
        target.comments = target.comments.filter(
          (item) => item.id !== comment.id
        );
        if (comment.image_path) await this.cleanup([comment.image_path]);
      } catch (error) {
        console.error("[FreeBoard] delete comment", error);
        this.pageError = "댓글 또는 첨부 파일을 모두 삭제하지 못했습니다.";
        await this.loadPosts();
      }
    },
    async loadMore() {
      await this.loadPosts(true);
    },
    openImage(url) {
      if (url) this.lightboxUrl = url;
    },
    useDefaultAvatar(event) {
      event.target.src = DEFAULT_AVATAR;
    },
    formatDate(value) {
      return new Intl.DateTimeFormat("ko-KR", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value));
    },
  },
};
</script>

<style scoped>
.free-board {
  width: min(920px, 100%);
  margin: 0 auto;
}
.board-heading {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  margin-bottom: 20px;
}
.board-heading h2 {
  margin: 5px 0;
  color: var(--ink);
}
.board-heading p {
  margin: 0;
  color: var(--muted);
  font-size: 14px;
}
.player-view-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  min-height: 42px;
  margin: -8px 0 14px;
}
.player-view-label {
  color: var(--muted);
  font-size: 12px;
}
.team-tab-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--line);
}
.team-board-tabs {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  gap: 7px;
  margin: 0;
  padding: 4px 2px 9px;
  overflow-x: auto;
  scrollbar-width: thin;
}
.team-board-tab {
  flex: 0 0 auto;
  padding: 8px 13px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--panel);
  color: var(--muted);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.team-board-tab:hover,
.team-board-tab:focus-visible {
  border-color: var(--accent);
  color: var(--accent);
}
.team-board-tab.active {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-foreground, #fff);
}
.team-board-tab:focus-visible {
  outline: 2px solid var(--accent-soft);
  outline-offset: 2px;
}
.team-scope-label {
  margin: 0 0 12px;
  color: var(--muted);
  font-size: 13px;
}
.spoiler-toggle,
.moderation-toggle {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--muted);
  font-size: 12px;
}
.spoiler-toggle {
  margin-top: 10px;
}
.moderation-toggle {
  flex: 0 0 auto;
}
.moderation-toggle input,
.spoiler-toggle input {
  accent-color: var(--accent);
}
.team-pill {
  display: inline-flex;
  margin-top: 12px;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 11px;
}
.tag-filter-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 0 0 14px;
  padding: 10px 13px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--panel);
  color: var(--ink);
  font-size: 13px;
}
.character-tag {
  color: var(--accent);
}
.tag-picker-label {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin: 12px 0;
}
.tag-picker-label > label {
  flex: 0 0 100%;
}
.tag-picker-label select {
  width: min(320px, calc(100% - 100px));
  min-width: 0;
  min-height: 38px;
  flex: 0 1 320px;
}
.tag-picker-label > button {
  min-height: 38px;
  flex: 0 0 auto;
}
.tag-all-team-button {
  white-space: nowrap;
}
.composer-toggle {
  flex: 0 0 auto;
  margin-bottom: 9px;
}
.composer-reveal-enter-active,
.composer-reveal-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.composer-reveal-enter-from,
.composer-reveal-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
.tag-admin-picker select {
  min-height: 34px;
}
.character-tags {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 7px;
  margin: 10px 0;
}
.tag-caption {
  color: var(--muted);
  font-size: 11px;
}
.tag-empty {
  font-size: 10px;
}
.character-tag {
  padding: 3px 8px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--accent-soft);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.character-tag.active {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--panel);
}
.character-tag:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.tag-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin: -4px 0 12px;
}
.character-tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 7px 3px 9px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 11px;
}
.character-tag-chip button {
  display: inline-grid;
  place-items: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  font-size: 15px;
  cursor: pointer;
}
.character-tag-chip button:disabled {
  opacity: 0.5;
  cursor: wait;
}
.tag-admin-picker {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  width: 100%;
  margin-top: 5px;
}
.tag-admin-picker select {
  width: min(260px, 100%);
  min-width: 0;
  flex: 0 1 260px;
}
.legacy-assignment {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  margin-top: 12px;
  padding: 10px;
  border: 1px dashed var(--line);
}
.legacy-assignment .form-label {
  min-width: min(260px, 100%);
}
.post-artwork-wrap {
  position: relative;
}
.spoiler-blur {
  filter: blur(14px);
  user-select: none;
  pointer-events: none;
}
.spoiler-reveal {
  position: absolute;
  z-index: 1;
  inset: 0;
  display: grid;
  place-items: center;
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: color-mix(in srgb, var(--panel) 82%, transparent);
  color: var(--ink);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.composer {
  margin-bottom: 20px;
}
.composer textarea,
.comment-form textarea {
  display: block;
  width: 100%;
  max-width: 100%;
  resize: vertical;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--panel);
  color: var(--ink);
  font: inherit;
  line-height: 1.55;
}
.composer textarea:focus,
.comment-form textarea:focus,
button:focus-visible,
.file-button:focus-within {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.composer-footer,
.comment-form-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
}
.file-button {
  display: inline-flex;
  align-items: center;
  min-height: 38px;
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: 4px;
  color: var(--ink);
  background: var(--paper);
  cursor: pointer;
  font-size: 13px;
}
.file-button:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.file-button.compact {
  min-height: 32px;
  padding: 5px 10px;
}
.preview-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}
.preview-item {
  position: relative;
  width: 82px;
  height: 82px;
  margin: 0;
}
.preview-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 4px;
}
.preview-item button,
.lightbox-close {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 27px;
  height: 27px;
  border: 0;
  border-radius: 50%;
  background: #111c;
  color: white;
  font-size: 20px;
  cursor: pointer;
}
.field-error {
  margin: 10px 0 0;
  color: var(--error);
  font-size: 13px;
}
.notice,
.state-card {
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 5px;
  background: var(--panel);
  text-align: center;
  color: var(--muted);
}
.error-notice {
  color: var(--error);
}
.post-list {
  display: grid;
  gap: 16px;
}
.post-card {
  overflow: hidden;
}
.post-author {
  display: flex;
  align-items: center;
  gap: 10px;
}
.post-author > img,
.comment-avatar {
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--line);
}
.author-meta {
  display: grid;
  gap: 3px;
  min-width: 0;
  flex: 1;
}
.author-meta strong,
.comment-meta strong {
  color: var(--ink);
  font-size: 14px;
}
time {
  color: var(--muted);
  font-size: 11px;
}
.danger-button,
.comment-delete {
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--panel);
  color: var(--error);
  padding: 6px 10px;
  cursor: pointer;
}
.post-content,
.comment-content {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.7;
  color: var(--ink);
}
.post-content {
  margin: 16px 0;
}
.post-image-carousel {
  position: relative;
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr) 76px;
  align-items: center;
  gap: 2px;
  width: min(100%, 620px);
  margin: 0 auto;
  padding: 10px 6px 36px;
  border: 1px solid var(--line);
  border-radius: 5px;
  background: var(--paper);
  overflow: hidden;
}
.image-open {
  display: block;
  max-width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: zoom-in;
}
.carousel-image {
  width: 100%;
  height: min(60vh, 560px);
  min-height: 220px;
  grid-column: 2;
  touch-action: pan-y;
}
.post-image-carousel:not(.has-arrows) {
  grid-template-columns: minmax(0, 1fr);
}
.post-image-carousel:not(.has-arrows) .carousel-image {
  grid-column: 1;
}
.carousel-image img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 4px;
  background: var(--paper);
}
.carousel-peek {
  position: relative;
  display: block;
  width: 100%;
  height: min(60vh, 560px);
  min-height: 220px;
  padding: 0;
  overflow: hidden;
  border: 0;
  border-radius: 4px;
  background: var(--line);
  color: transparent;
  font-size: 0;
  opacity: 0.62;
  cursor: pointer;
}
.carousel-peek img {
  position: absolute;
  top: 0;
  width: 100%;
  max-width: 100%;
  height: 100%;
  object-fit: contain;
  background: var(--paper);
}
.carousel-arrow-left img {
  right: 0;
}
.carousel-arrow-right img {
  left: 0;
}
.carousel-peek::after {
  position: absolute;
  top: 50%;
  display: grid;
  place-items: center;
  width: 30px;
  height: 42px;
  transform: translateY(-50%);
  border-radius: 4px;
  background: color-mix(in srgb, var(--panel) 88%, transparent);
  color: var(--ink);
  font-size: 25px;
}
.carousel-arrow-left::after {
  right: 3px;
  content: "←";
}
.carousel-arrow-right::after {
  left: 3px;
  content: "→";
}
.carousel-peek:focus-visible {
  opacity: 1;
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
.carousel-arrow-left {
  grid-column: 1;
  grid-row: 1;
}
.carousel-arrow-right {
  grid-column: 3;
  grid-row: 1;
}
.carousel-footer {
  display: contents;
}
.carousel-footer > button {
  grid-column: 3;
  grid-row: 1;
}
.carousel-footer > span {
  position: absolute;
  right: 0;
  bottom: 9px;
  left: 0;
  color: var(--muted);
  font-size: 12px;
  text-align: center;
}
.comments {
  margin-top: 20px;
  padding-top: 14px;
  border-top: 1px solid var(--line);
}
.comments h3 {
  margin: 0 0 12px;
  font-size: 14px;
}
.comments h3 span {
  color: var(--muted);
  font-weight: 500;
}
.no-comments,
.loading-more {
  color: var(--muted);
  font-size: 13px;
}
.comment-row {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 10px 0;
  border-bottom: 1px solid var(--line);
}
.comment-avatar {
  width: 30px;
  height: 30px;
  flex-basis: 30px;
}
.comment-body {
  flex: 1;
  min-width: 0;
}
.comment-meta {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
}
.comment-meta strong {
  font-size: 12px;
}
.comment-content {
  margin: 5px 0;
  font-size: 13px;
}
.comment-image img {
  display: block;
  max-width: min(260px, 100%);
  max-height: 260px;
  object-fit: contain;
  border-radius: 4px;
}
.comment-delete {
  padding: 1px 7px;
  font-size: 18px;
}
.comment-form {
  margin-top: 14px;
}
.comment-form textarea {
  min-height: 66px;
}
.comment-attachment {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.selected-file {
  color: var(--muted);
  font-size: 12px;
}
.selected-file button {
  border: 0;
  background: none;
  color: var(--error);
  cursor: pointer;
  font-size: 17px;
}
.comment-preview {
  width: 42px;
  height: 42px;
  object-fit: cover;
  border-radius: 4px;
}
.load-more {
  display: block;
  margin: 20px auto 0;
}
.lightbox {
  position: fixed;
  z-index: 200;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 28px;
  background: #000e;
}
.lightbox img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.lightbox-close {
  top: 16px;
  right: 16px;
  width: 38px;
  height: 38px;
  font-size: 28px;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
@media (max-width: 600px) {
  .board-heading {
    align-items: flex-start;
  }
  .composer,
  .post-card {
    padding: 14px;
  }
  .composer-footer,
  .comment-form-footer {
    align-items: flex-start;
    flex-direction: column;
  }
  .post-author {
    flex-wrap: wrap;
  }
  .legacy-assignment {
    align-items: stretch;
    flex-direction: column;
  }
  .team-tab-row {
    gap: 6px;
  }
  .composer-toggle {
    padding: 7px 10px;
    font-size: 12px;
  }
  .tag-picker-label select {
    width: auto;
    flex: 1 1 0;
  }
  .composer-footer > button,
  .comment-form-footer > button {
    align-self: flex-end;
  }
  .post-image-carousel {
    grid-template-columns: 42px minmax(0, 1fr) 42px;
    gap: 1px;
    padding: 6px 3px 30px;
  }
  .carousel-image,
  .carousel-peek {
    height: min(48vh, 430px);
    min-height: 180px;
  }
  .carousel-peek::after {
    width: 24px;
    height: 36px;
    font-size: 20px;
  }
}
</style>
