<template>
  <section class="npc-feedback-page">
    <router-link class="text-button back-link" to="/scenarios"
      >← 시나리오 목록</router-link
    >
    <p v-if="loading" class="empty-state">NPC 정보를 불러오는 중…</p>
    <div v-else-if="error" class="empty-state" role="alert">
      <p>{{ error }}</p>
      <router-link class="outline-button" to="/scenarios">목록으로</router-link>
    </div>
    <template v-else-if="npc">
      <article class="npc-summary card">
        <img
          v-if="npc.token_url"
          :src="npc.token_url"
          :alt="`${npc.name} 토큰`"
        />
        <div v-else class="npc-placeholder">NPC</div>
        <div>
          <span class="eyebrow">{{ scenarioLabel }}</span>
          <h2>{{ npc.name }}</h2>
          <p class="muted">
            {{
              [npc.age, npc.gender].filter(Boolean).join(" · ") ||
              "추가 정보 없음"
            }}
          </p>
          <p class="rating-summary">
            평균 {{ averageRating }} / 5
            <span>({{ ratings.length }}명 평가)</span>
          </p>
        </div>
      </article>

      <section
        class="rating-panel card"
        :class="{ 'preview-disabled-panel': isPlayerPreview }"
      >
        <h3>NPC 평점</h3>
        <p class="rating-summary rating-summary--panel">
          현재 평균 {{ averageRating }} / 5
          <span>({{ ratings.length }}명 평가)</span>
        </p>
        <div class="rating-buttons" role="radiogroup" aria-label="NPC 평점">
          <button
            v-for="score in 5"
            :key="score"
            type="button"
            role="radio"
            :aria-checked="myRating === score"
            :disabled="isPlayerPreview"
            :class="{
              selected: myRating === score,
              'preview-disabled': isPlayerPreview,
            }"
            @click="saveRating(score)"
          >
            {{ score }}<span aria-hidden="true">★</span>
          </button>
        </div>
        <p v-if="ratingError" class="field-error" role="alert">
          {{ ratingError }}
        </p>
      </section>

      <section
        class="comment-panel card"
        :class="{ 'preview-disabled-panel': isPlayerPreview }"
      >
        <h3>감상 댓글</h3>
        <form class="comment-form" @submit.prevent="submitComment">
          <label class="sr-only" for="npc-comment">댓글 내용</label>
          <textarea
            id="npc-comment"
            v-model="commentDraft"
            class="form-textarea"
            rows="3"
            maxlength="3000"
            placeholder="이 NPC에 대한 감상을 남겨주세요."
            :disabled="posting || isPlayerPreview"
          />
          <button
            class="primary-button"
            type="submit"
            :disabled="posting || !commentDraft.trim() || isPlayerPreview"
          >
            {{ posting ? "등록 중…" : "댓글 등록" }}
          </button>
        </form>
        <p v-if="commentError" class="field-error" role="alert">
          {{ commentError }}
        </p>
        <p v-if="!comments.length" class="empty-comments">
          첫 감상을 남겨주세요.
        </p>
        <article
          v-for="comment in comments"
          :key="comment.id"
          class="npc-comment"
        >
          <header>
            <div class="npc-comment-author">
              <img
                class="npc-comment-avatar"
                :src="commentAvatar(comment)"
                :alt="`${
                  comment.author_character_name ||
                  commentAuthor(comment.nickname)
                } 인장`"
                @error="useDefaultAvatar"
              />
              <div class="npc-comment-author-names">
                <strong>{{
                  comment.author_character_name ||
                  commentAuthor(comment.nickname)
                }}</strong>
                <span>{{ comment.author_player_name || "플레이어" }}</span>
              </div>
            </div>
            <time :datetime="comment.created_at">{{
              formatDate(comment.created_at)
            }}</time>
          </header>
          <p>{{ comment.content }}</p>
        </article>
      </section>
    </template>
  </section>
</template>

<script>
import { supabase } from "@/supabase";

const DEFAULT_AVATAR = `${process.env.BASE_URL}image/default.webp`;

export default {
  name: "NpcFeedbackView",
  data() {
    return {
      npc: null,
      ratings: [],
      comments: [],
      myRating: null,
      commentDraft: "",
      loading: true,
      posting: false,
      ratingError: "",
      commentError: "",
      error: "",
    };
  },
  computed: {
    isPlayerPreview() {
      return this.$store.getters.isPlayerPreview;
    },
    averageRating() {
      if (!this.ratings.length) return "—";
      return (
        this.ratings.reduce((sum, row) => sum + row.rating, 0) /
        this.ratings.length
      ).toFixed(1);
    },
    scenarioLabel() {
      const step = Number(this.npc?.scenario_step);
      const stage = (this.$store.state.progressStages || []).find(
        (row) => Number(row.step_number) === step
      );
      return stage?.title || stage?.name || `시나리오 ${step}`;
    },
  },
  watch: {
    "$store.state.gmPlayerPreviewMode"() {
      this.loadNpc();
    },
    "$store.state.gmPreviewTeamId"() {
      if (this.isPlayerPreview) this.loadNpc();
    },
    "$route.params.npcId"() {
      this.loadNpc();
    },
  },
  mounted() {
    this.loadNpc();
  },
  methods: {
    async loadNpc() {
      this.loading = true;
      this.error = "";
      const { data: npc, error } = await supabase
        .from("scenario_npcs")
        .select("id, campaign_id, scenario_step, name, age, gender, token_url")
        .eq("id", this.$route.params.npcId)
        .maybeSingle();
      if (error || !npc) {
        this.error = error
          ? `NPC 정보를 불러오지 못했습니다: ${error.message}`
          : "NPC를 찾을 수 없습니다.";
        this.loading = false;
        return;
      }
      if (this.isPlayerPreview) {
        const team = this.$store.getters.teamById(
          this.$store.getters.activePlayerTeamId
        );
        if (
          !team ||
          Number(npc.scenario_step) >= (Number(team.progress_step) || 1)
        ) {
          this.error = "NPC 정보를 찾을 수 없습니다.";
          this.loading = false;
          return;
        }
      }
      this.npc = npc;
      const [ratingsResult, commentsResult] = await Promise.all([
        supabase
          .from("scenario_npc_ratings")
          .select("user_id, rating")
          .eq("npc_id", npc.id),
        supabase
          .from("scenario_npc_comments")
          .select(
            "id, nickname, author_player_name, author_character_name, author_token_url, content, created_at"
          )
          .eq("npc_id", npc.id)
          .order("created_at", { ascending: false }),
      ]);
      if (ratingsResult.error || commentsResult.error) {
        this.error = `평점과 댓글을 불러오지 못했습니다: ${
          (ratingsResult.error || commentsResult.error).message
        }`;
      } else {
        this.ratings = ratingsResult.data || [];
        this.comments = commentsResult.data || [];
        const { data: auth } = await supabase.auth.getUser();
        this.myRating =
          this.ratings.find((row) => row.user_id === auth.user?.id)?.rating ||
          null;
      }
      this.loading = false;
    },
    async saveRating(rating) {
      if (this.isPlayerPreview) return;
      this.ratingError = "";
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user || !this.npc) return;
      const previous = this.myRating;
      this.myRating = rating;
      const { error } = await supabase.from("scenario_npc_ratings").upsert(
        {
          npc_id: this.npc.id,
          user_id: auth.user.id,
          rating,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "npc_id,user_id" }
      );
      if (error) {
        this.myRating = previous;
        this.ratingError = `평점을 저장하지 못했습니다: ${error.message}`;
      } else {
        const index = this.ratings.findIndex(
          (row) => row.user_id === auth.user.id
        );
        if (index < 0) this.ratings.push({ user_id: auth.user.id, rating });
        else this.ratings[index].rating = rating;
      }
    },
    async submitComment() {
      if (
        this.isPlayerPreview ||
        this.posting ||
        !this.commentDraft.trim() ||
        !this.npc
      )
        return;
      this.posting = true;
      this.commentError = "";
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("scenario_npc_comments").insert({
        npc_id: this.npc.id,
        user_id: auth.user?.id,
        content: this.commentDraft.trim(),
        nickname:
          auth.user?.user_metadata?.nickname ||
          auth.user?.email?.split("@")[0] ||
          "사용자",
      });
      if (error)
        this.commentError = `댓글을 등록하지 못했습니다: ${error.message}`;
      else {
        this.commentDraft = "";
        await this.loadNpc();
      }
      this.posting = false;
    },
    formatDate(value) {
      return new Date(value).toLocaleString("ko-KR", {
        dateStyle: "medium",
        timeStyle: "short",
      });
    },
    commentAuthor(nickname) {
      // Older rows may contain the synthetic Auth email local-part.
      return /^player-[0-9a-f-]{36}$/i.test(nickname || "")
        ? "플레이어"
        : nickname || "사용자";
    },
    commentAvatar(comment) {
      return comment.author_token_url || DEFAULT_AVATAR;
    },
    useDefaultAvatar(event) {
      event.target.onerror = null;
      event.target.src = DEFAULT_AVATAR;
    },
  },
};
</script>

<style scoped>
.npc-feedback-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
  max-width: 900px;
  margin: 0 auto;
}
.back-link {
  align-self: flex-start;
  text-decoration: none;
}
.npc-summary {
  display: grid;
  grid-template-columns: minmax(160px, 260px) 1fr;
  align-items: center;
  gap: 22px;
}
.npc-summary > img,
.npc-placeholder {
  width: 100%;
  height: 260px;
  object-fit: contain;
  border-radius: 5px;
  background: var(--paper);
}
.npc-placeholder {
  display: grid;
  place-items: center;
  color: var(--muted);
  font: 700 20px "DM Mono", monospace;
}
.npc-summary h2 {
  margin: 6px 0;
  color: var(--ink);
}
.rating-summary {
  color: var(--accent);
  font-weight: 700;
}
.rating-summary--panel {
  margin: 0 0 12px;
}
.rating-summary span {
  color: var(--muted);
  font-size: 12px;
  font-weight: 400;
}
.rating-buttons {
  display: flex;
  gap: 8px;
}
.rating-buttons button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: 5px;
  background: var(--panel);
  color: var(--muted);
  cursor: pointer;
}
.rating-buttons button.selected {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft);
}
.comment-form {
  display: flex;
  align-items: flex-end;
  gap: 10px;
}
.comment-form textarea {
  flex: 1;
  resize: vertical;
}
.empty-comments {
  color: var(--muted);
  text-align: center;
  padding: 16px;
}
.npc-comment {
  margin-top: 12px;
  padding: 16px 18px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: color-mix(in srgb, var(--panel) 92%, var(--paper));
}
.npc-comment header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  font-size: 12px;
}
.npc-comment-author {
  display: flex;
  align-items: center;
  gap: 11px;
  min-width: 0;
}
.npc-comment-avatar {
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  object-fit: cover;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: var(--paper);
}
.npc-comment-author-names {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.npc-comment strong {
  min-width: 0;
  color: var(--text);
  font-size: 14px;
  overflow-wrap: anywhere;
}
.npc-comment-author-names span {
  color: var(--muted);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.npc-comment time {
  flex: 0 0 auto;
  color: var(--muted);
  font-size: 12px;
  text-align: right;
}
.npc-comment p {
  margin: 14px 0 0 55px;
  color: var(--text);
  font-size: 14px;
  line-height: 1.65;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
@media (max-width: 560px) {
  .npc-comment {
    padding: 13px;
  }
  .npc-comment header {
    align-items: flex-start;
    gap: 8px;
  }
  .npc-comment-avatar {
    width: 38px;
    height: 38px;
    flex-basis: 38px;
  }
  .npc-comment p {
    margin: 12px 0 0;
  }
  .npc-comment time {
    text-align: left;
  }
}
.field-error {
  color: var(--error);
}
@media (max-width: 600px) {
  .npc-summary {
    grid-template-columns: 1fr;
  }
  .npc-summary > img,
  .npc-placeholder {
    height: min(65vw, 280px);
  }
  .comment-form {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
