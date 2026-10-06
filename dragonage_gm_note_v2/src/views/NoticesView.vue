<template>
  <section class="notices-page">
    <header class="notice-heading">
      <div>
        <span class="eyebrow">ANNOUNCEMENTS</span>
        <h2>전체공지</h2>
        <p>모든 팀과 캐릭터가 함께 확인하는 공지입니다.</p>
      </div>
      <button
        v-if="mode === 'list' && isAdmin && !isPlayerPreview"
        class="primary-button"
        type="button"
        :disabled="isPlayerPreview"
        :class="{ 'preview-disabled': isPlayerPreview }"
        @click="$router.push({ name: 'notice-create' })"
      >
        공지 작성
      </button>
    </header>

    <div v-if="errorMessage" class="notice-alert" role="alert">
      <span>{{ errorMessage }}</span>
      <button
        v-if="mode === 'list'"
        class="text-button"
        type="button"
        @click="loadList"
      >
        다시 불러오기
      </button>
    </div>

    <template v-if="mode === 'list'">
      <div v-if="loading" class="notice-state">공지를 불러오는 중입니다…</div>
      <div v-else-if="!notices.length && !errorMessage" class="notice-state">
        등록된 공지가 없습니다.
      </div>
      <div v-else class="notice-list">
        <button
          v-for="notice in notices"
          :key="notice.id"
          class="notice-card card"
          type="button"
          @click="
            $router.push({
              name: 'notice-detail',
              params: { noticeId: notice.id },
            })
          "
        >
          <span class="notice-card-copy">
            <strong>{{ notice.title }}</strong>
            <span class="notice-excerpt">{{ excerpt(notice.content) }}</span>
          </span>
          <span class="notice-card-meta">
            <span class="notice-author"
              ><img
                :src="notice.author_avatar_url || defaultAvatar"
                alt=""
                @error="useDefaultAvatar"
              />{{ notice.author_name || "관리자" }}</span
            >
            <time :datetime="notice.created_at">{{
              formatDate(notice.created_at)
            }}</time>
          </span>
        </button>
      </div>
    </template>

    <template v-else-if="mode === 'create' || mode === 'edit'">
      <div v-if="isPlayerPreview" class="notice-state">
        플레이어 화면에서는 공지 관리 화면을 표시하지 않습니다.
        <button
          class="text-button"
          type="button"
          @click="$router.push({ name: 'notices' })"
        >
          전체공지로 돌아가기
        </button>
      </div>
      <div v-else-if="loading" class="notice-state">
        공지를 불러오는 중입니다…
      </div>
      <form v-else class="notice-form card" @submit.prevent="saveNotice">
        <label class="form-label" for="notice-title"
          >제목
          <input
            id="notice-title"
            v-model="form.title"
            class="form-input"
            maxlength="200"
            required
            :disabled="saving"
          />
        </label>
        <label class="form-label" for="notice-content"
          >본문
          <textarea
            id="notice-content"
            v-model="form.content"
            class="form-textarea notice-textarea"
            maxlength="30000"
            rows="14"
            required
            :disabled="saving"
          />
        </label>
        <p v-if="formError" class="field-error" role="alert">{{ formError }}</p>
        <div class="form-actions">
          <button
            class="secondary-button"
            type="button"
            :disabled="saving"
            @click="cancelForm"
          >
            취소
          </button>
          <button
            class="primary-button"
            type="submit"
            :disabled="saving || !canSave"
          >
            {{
              saving ? "저장 중…" : mode === "edit" ? "수정 저장" : "공지 등록"
            }}
          </button>
        </div>
      </form>
    </template>

    <template v-else-if="mode === 'detail'">
      <div v-if="loading" class="notice-state">공지를 불러오는 중입니다…</div>
      <article v-else-if="notice" class="notice-detail card">
        <header class="detail-heading">
          <h3>{{ notice.title }}</h3>
          <div class="detail-meta">
            <img
              :src="notice.author_avatar_url || defaultAvatar"
              :alt="`${notice.author_name || '관리자'} 프로필`"
              @error="useDefaultAvatar"
            />
            <strong>{{ notice.author_name || "관리자" }}</strong>
            <time :datetime="notice.created_at">{{
              formatDate(notice.created_at)
            }}</time>
            <time
              v-if="
                notice.updated_at && notice.updated_at !== notice.created_at
              "
              :datetime="notice.updated_at"
              >수정 {{ formatDate(notice.updated_at) }}</time
            >
          </div>
        </header>
        <div class="notice-content">{{ notice.content }}</div>
        <div class="detail-actions">
          <button
            class="secondary-button"
            type="button"
            @click="$router.push({ name: 'notices' })"
          >
            목록으로
          </button>
          <span v-if="isAdmin && !isPlayerPreview" class="admin-actions">
            <button
              class="outline-button"
              type="button"
              @click="
                $router.push({
                  name: 'notice-edit',
                  params: { noticeId: notice.id },
                })
              "
            >
              수정
            </button>
            <button
              class="danger-button"
              type="button"
              :disabled="deleting"
              @click="deleteNotice"
            >
              {{ deleting ? "삭제 중…" : "삭제" }}
            </button>
          </span>
        </div>
      </article>
      <div v-else-if="!errorMessage" class="notice-state">
        공지를 찾을 수 없습니다.<button
          class="text-button"
          type="button"
          @click="$router.push({ name: 'notices' })"
        >
          공지 목록으로
        </button>
      </div>
      <div v-else class="notice-state">
        <button class="text-button" type="button" @click="loadNotice">
          다시 불러오기</button
        ><button
          class="text-button"
          type="button"
          @click="$router.push({ name: 'notices' })"
        >
          공지 목록으로
        </button>
      </div>
    </template>
  </section>
</template>

<script>
import { supabase } from "@/supabase";

const DEFAULT_AVATAR =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="32" fill="#e6e6e6"/><circle cx="32" cy="24" r="12" fill="#999"/><path d="M10 60c2-14 10-21 22-21s20 7 22 21" fill="#999"/></svg>'
  );

export default {
  name: "NoticesView",
  props: { noticeId: { type: String, default: "" } },
  data() {
    return {
      user: null,
      isAdmin: false,
      notices: [],
      notice: null,
      form: { title: "", content: "" },
      loading: true,
      saving: false,
      deleting: false,
      errorMessage: "",
      formError: "",
      channel: null,
      refreshTimer: null,
      loadVersion: 0,
      defaultAvatar: DEFAULT_AVATAR,
    };
  },
  computed: {
    isPlayerPreview() {
      return this.$store.getters.isPlayerPreview;
    },
    mode() {
      if (this.$route.name === "notice-create") return "create";
      if (this.$route.name === "notice-edit") return "edit";
      if (this.$route.name === "notice-detail") return "detail";
      return "list";
    },
    canSave() {
      return Boolean(this.form.title.trim() && this.form.content.trim());
    },
  },
  async mounted() {
    await this.initialize();
    this.channel = supabase
      .channel("notices-list")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notices" },
        () => {
          if (this.mode !== "list") return;
          clearTimeout(this.refreshTimer);
          this.refreshTimer = setTimeout(() => this.loadList(), 120);
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn(
            "[Notices] Realtime unavailable; manual refresh remains available."
          );
        }
      });
  },
  beforeUnmount() {
    clearTimeout(this.refreshTimer);
    if (this.channel) supabase.removeChannel(this.channel);
  },
  watch: {
    "$route.fullPath": {
      async handler() {
        this.errorMessage = "";
        this.formError = "";
        this.notice = null;
        if (this.mode === "create") this.form = { title: "", content: "" };
        await this.loadForRoute();
      },
    },
  },
  methods: {
    async initialize() {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        this.errorMessage =
          "로그인 세션을 확인할 수 없습니다. 다시 로그인해 주세요.";
        this.loading = false;
        return;
      }
      this.user = data.user;
      const { data: admin, error: adminError } = await supabase.rpc(
        "current_user_is_gm"
      );
      if (adminError) {
        console.error("[Notices] admin role check", adminError);
        this.isAdmin = false;
      } else {
        this.isAdmin = admin === true;
      }
      if ((this.mode === "create" || this.mode === "edit") && !this.isAdmin) {
        await this.$router.replace({ name: "notices" });
        return;
      }
      await this.loadForRoute();
    },
    async loadForRoute() {
      if (!this.user) return;
      if (this.mode === "list") return this.loadList();
      if (this.mode === "create") {
        this.loading = false;
        return;
      }
      if (this.mode === "edit" && !this.isAdmin) {
        await this.$router.replace({ name: "notices" });
        return;
      }
      return this.loadNotice();
    },
    async loadList() {
      const version = ++this.loadVersion;
      this.loading = true;
      this.errorMessage = "";
      const { data, error } = await supabase
        .from("notices")
        .select("id, user_id, title, content, created_at")
        .order("created_at", { ascending: false });
      if (version !== this.loadVersion) return;
      if (error) {
        console.error("[Notices] load list", error);
        this.errorMessage = `전체공지를 불러오지 못했습니다. notices 테이블 권한과 migration_notices_access.sql 적용 여부를 확인해 주세요. (${error.message})`;
      } else {
        const unique = new Map((data || []).map((item) => [item.id, item]));
        this.notices = [...unique.values()].sort(
          (a, b) => new Date(b.created_at) - new Date(a.created_at)
        );
      }
      this.loading = false;
    },
    async loadNotice() {
      const version = ++this.loadVersion;
      this.loading = true;
      this.errorMessage = "";
      const { data, error } = await supabase
        .from("notices")
        .select("id, user_id, title, content, created_at")
        .eq("id", this.noticeId)
        .maybeSingle();
      if (version !== this.loadVersion) return;
      if (error) {
        console.error("[Notices] load detail", error);
        this.errorMessage =
          "공지 조회 중 통신 오류가 발생했습니다. 다시 시도해 주세요.";
      } else if (!data) {
        this.notice = null;
        this.errorMessage = "";
      } else {
        this.notice = data;
        if (this.mode === "edit")
          this.form = { title: data.title || "", content: data.content || "" };
      }
      this.loading = false;
    },
    async saveNotice() {
      if (this.saving || this.isPlayerPreview) return;
      const title = this.form.title.trim();
      const content = this.form.content.trim();
      if (!title || !content) {
        this.formError = "제목과 본문을 모두 입력해 주세요.";
        return;
      }
      if (!this.isAdmin || !this.user) {
        this.formError = "관리자 로그인 정보를 확인할 수 없습니다.";
        return;
      }
      this.saving = true;
      this.formError = "";
      try {
        if (this.mode === "edit") {
          const { data, error } = await supabase
            .from("notices")
            .update({ title, content })
            .eq("id", this.noticeId)
            .select("id")
            .single();
          if (error) throw error;
          await this.$router.push({
            name: "notice-detail",
            params: { noticeId: data.id },
          });
        } else {
          const { data, error } = await supabase
            .from("notices")
            .insert({ user_id: this.user.id, title, content })
            .select("id")
            .single();
          if (error) throw error;
          await this.$router.push({
            name: "notice-detail",
            params: { noticeId: data.id },
          });
        }
      } catch (error) {
        console.error("[Notices] save", error);
        this.formError =
          "공지를 저장하지 못했습니다. 입력한 내용은 그대로 유지됩니다.";
      } finally {
        this.saving = false;
      }
    },
    cancelForm() {
      if (this.mode === "edit")
        this.$router.push({
          name: "notice-detail",
          params: { noticeId: this.noticeId },
        });
      else this.$router.push({ name: "notices" });
    },
    async deleteNotice() {
      if (
        !this.isAdmin ||
        this.isPlayerPreview ||
        this.deleting ||
        !this.notice
      )
        return;
      if (!window.confirm("이 공지를 삭제할까요?")) return;
      this.deleting = true;
      try {
        const { data, error } = await supabase
          .from("notices")
          .delete()
          .eq("id", this.notice.id)
          .select("id")
          .single();
        if (error) throw error;
        if (!data) throw new Error("Notice was not deleted");
        this.notices = this.notices.filter(
          (item) => item.id !== this.notice.id
        );
        await this.$router.push({ name: "notices" });
      } catch (error) {
        console.error("[Notices] delete", error);
        this.errorMessage = "공지를 삭제하지 못했습니다.";
      } finally {
        this.deleting = false;
      }
    },
    excerpt(value) {
      const text = String(value || "")
        .replace(/\s+/g, " ")
        .trim();
      return text.length > 180 ? `${text.slice(0, 180)}…` : text;
    },
    formatDate(value) {
      if (!value) return "";
      return new Intl.DateTimeFormat("ko-KR", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value));
    },
    useDefaultAvatar(event) {
      event.target.src = DEFAULT_AVATAR;
    },
  },
};
</script>

<style scoped>
.notices-page {
  width: min(900px, 100%);
  margin: 0 auto;
}
.notice-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 22px;
}
.notice-heading h2 {
  margin: 5px 0;
  color: var(--ink);
}
.notice-heading p {
  margin: 0;
  color: var(--muted);
  font-size: 14px;
}
.notice-list {
  display: grid;
  gap: 10px;
}
.notice-card {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  text-align: left;
  color: var(--ink);
  cursor: pointer;
}
.notice-card:hover {
  border-color: var(--accent);
}
.notice-card-copy {
  min-width: 0;
  display: grid;
  gap: 7px;
}
.notice-card-copy strong {
  overflow-wrap: anywhere;
  font-size: 16px;
}
.notice-excerpt {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.55;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.notice-card-meta {
  display: grid;
  justify-items: end;
  gap: 7px;
  flex: 0 0 auto;
  color: var(--muted);
  font-size: 11px;
}
.notice-author {
  display: flex;
  align-items: center;
  gap: 6px;
}
.notice-author img,
.detail-meta img {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--line);
}
.notice-state,
.notice-alert {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 120px;
  padding: 20px;
  border: 1px solid var(--line);
  border-radius: 5px;
  background: var(--panel);
  color: var(--muted);
  text-align: center;
}
.notice-alert {
  justify-content: space-between;
  min-height: 0;
  margin-bottom: 16px;
  color: var(--error);
}
.notice-form {
  display: grid;
  gap: 18px;
}
.notice-textarea {
  min-height: 260px;
  resize: vertical;
  line-height: 1.65;
}
.field-error {
  margin: 0;
  color: var(--error);
  font-size: 13px;
}
.form-actions,
.detail-actions,
.admin-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.form-actions,
.detail-actions {
  justify-content: space-between;
}
.notice-detail {
  padding: 0;
  overflow: hidden;
}
.detail-heading {
  padding: 22px 24px;
  border-bottom: 1px solid var(--line);
}
.detail-heading h3 {
  margin: 0 0 14px;
  color: var(--ink);
  font-size: 23px;
  overflow-wrap: anywhere;
}
.detail-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 9px;
  color: var(--muted);
  font-size: 12px;
}
.detail-meta strong {
  color: var(--ink);
}
.notice-content {
  min-height: 140px;
  padding: 24px;
  color: var(--ink);
  line-height: 1.8;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.detail-actions {
  padding: 14px 24px;
  border-top: 1px solid var(--line);
}
.danger-button {
  border: 1px solid var(--error);
  border-radius: 4px;
  background: transparent;
  color: var(--error);
  padding: 9px 14px;
  cursor: pointer;
}
.danger-button:disabled {
  opacity: 0.55;
  cursor: wait;
}
@media (max-width: 600px) {
  .notice-heading {
    align-items: flex-start;
  }
  .notice-heading .primary-button {
    flex: 0 0 auto;
  }
  .notice-card {
    align-items: flex-start;
    flex-direction: column;
    gap: 10px;
    padding: 15px;
  }
  .notice-card-meta {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .detail-heading {
    padding: 18px;
  }
  .detail-heading h3 {
    font-size: 19px;
  }
  .notice-content {
    padding: 18px;
  }
  .detail-actions {
    padding: 12px 18px;
  }
  .notice-form {
    padding: 16px;
  }
}
</style>
