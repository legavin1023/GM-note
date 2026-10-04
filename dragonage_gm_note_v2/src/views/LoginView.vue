<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-brand">
        <span class="brand-mark">DA</span>
        <div>
          <strong>DragonAge</strong>
          <small>{{ playerMode ? "PLAYER ACCESS" : "GM COMMAND CENTER" }}</small>
        </div>
      </div>
      <h1>{{ playerMode ? "플레이어" : "GM" }} 계정으로<br /><em>로그인하세요.</em></h1>
      <form @submit.prevent="handleLogin">
        <label v-if="playerMode">
          로그인 아이디 (username)
          <select v-model="username" required :disabled="playerEmailsLoading || !playerUsernames.length">
            <option value="" disabled>{{ playerEmailsLoading ? "계정 목록을 불러오는 중…" : "플레이어 아이디를 선택하세요" }}</option>
            <option v-for="playerUsername in playerUsernames" :key="playerUsername" :value="playerUsername">
              {{ playerUsername }}
            </option>
          </select>
        </label>
        <label v-else>
          이메일
          <input v-model.trim="email" type="email" required autocomplete="email" />
        </label>
        <label>
          비밀번호
          <input
            v-model="password"
            type="password"
            required
            autocomplete="current-password"
          />
        </label>
        <p v-if="errorMessage" class="login-error">{{ errorMessage }}</p>
        <p v-if="playerMode && !playerEmailsLoading && !playerUsernames.length && !errorMessage" class="login-error">팀에 소속된 플레이어 username이 없습니다.</p>
        <button type="submit" :disabled="loading || playerEmailsLoading || (playerMode && !playerUsernames.length)" class="login-button">
          {{ loading ? "로그인 중..." : "로그인" }}
        </button>
      </form>
      <router-link v-if="playerMode" class="login-switch" :to="{ name: 'login' }">GM 로그인으로</router-link>
      <router-link v-else class="login-switch" :to="{ name: 'player-login' }">플레이어 로그인으로</router-link>
    </div>
  </div>
</template>

<script>
import { signIn, signOut } from "@/services/auth";
import { getPlayerLoginUsernames, signInPlayer } from "@/services/playerAccounts";
import { supabase } from "@/supabase";

export default {
  name: "LoginView",
  props: {
    playerMode: { type: Boolean, default: false },
  },
  data() {
    return {
      email: "",
      username: "",
      password: "",
      loading: false,
      errorMessage: "",
      playerUsernames: [],
      playerEmailsLoading: false,
    };
  },
  mounted() {
    if (this.playerMode) this.loadPlayerUsernames();
  },
  watch: {
    playerMode(enabled) {
      if (enabled && !this.playerUsernames.length) this.loadPlayerUsernames();
      if (!enabled) {
        this.email = "";
        this.playerUsernames = [];
        this.errorMessage = "";
      }
    },
  },
  methods: {
    async loadPlayerUsernames() {
      this.playerEmailsLoading = true;
      try {
        this.playerUsernames = await getPlayerLoginUsernames();
      } catch (error) {
        this.errorMessage = "플레이어 계정 목록을 불러오지 못했습니다: " + (error.message || error);
      } finally {
        this.playerEmailsLoading = false;
      }
    },
    async handleLogin() {
      this.loading = true;
      this.errorMessage = "";
      try {
        if (this.playerMode) await signInPlayer(this.username, this.password);
        else await signIn(this.email, this.password);
        const { data: context, error: contextError } = await supabase.rpc("player_team_context");
        if (contextError) throw contextError;
        const isPlayerAccount = Array.isArray(context) && context.length > 0;
        if (isPlayerAccount !== this.playerMode) {
          await signOut();
          throw new Error(this.playerMode
            ? "이 계정은 플레이어 팀에 연결되어 있지 않습니다. GM에게 팀 연결을 요청하세요."
            : "플레이어 계정입니다. 플레이어 로그인 화면을 이용하세요.");
        }
        // onAuthStateChange가 router guard를 통해 자동 리디렉션
        this.$router.push({ name: this.playerMode ? "scenarios" : "master" });
      } catch (error) {
        if (error.message?.includes("Invalid login credentials")) {
          this.errorMessage = this.playerMode
            ? "아이디 또는 비밀번호가 올바르지 않습니다."
            : "이메일 또는 비밀번호가 올바르지 않습니다.";
        } else {
          this.errorMessage = error.message || "로그인에 실패했습니다.";
        }
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style scoped>
/* 로그인 화면의 배경, 로그인 카드 및 입력 폼에 적용됩니다. */
.login-page {
  min-height: 100vh;
  background: #181c28;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.login-card {
  background: #20253a;
  border: 1px solid #2e3448;
  padding: 48px 40px;
  width: 100%;
  max-width: 400px;
  border-radius: 2px;
}
.login-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 32px;
}
.brand-mark {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  background: #c97954;
  color: #fff;
  font: 600 13px "DM Mono", monospace;
  border-radius: 2px;
  flex-shrink: 0;
}
.login-brand strong {
  display: block;
  color: #f4f2ed;
  font-size: 15px;
  letter-spacing: -0.02em;
}
.login-brand small {
  display: block;
  color: #969baa;
  font-size: 9px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  margin-top: 2px;
}
h1 {
  color: #f4f2ed;
  font-size: 28px;
  font-weight: 800;
  letter-spacing: -0.03em;
  margin: 0 0 32px;
  line-height: 1.2;
}
h1 em {
  color: #c97954;
  font-style: normal;
}
form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: #969baa;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
label input,
label select {
  background: #181c28;
  border: 1px solid #2e3448;
  color: #f4f2ed;
  padding: 12px 14px;
  font-size: 14px;
  border-radius: 2px;
  outline: none;
  transition: border-color 0.15s;
}
label input:focus,
label select:focus {
  border-color: #c97954;
}
.login-error {
  color: #e06060;
  font-size: 13px;
  margin: 0;
  padding: 10px 12px;
  background: rgba(224, 96, 96, 0.1);
  border: 1px solid rgba(224, 96, 96, 0.3);
  border-radius: 2px;
}
.login-button {
  background: #c97954;
  color: #fff;
  border: none;
  padding: 14px;
  font-size: 14px;
  font-weight: 700;
  border-radius: 2px;
  cursor: pointer;
  transition: background 0.15s;
  margin-top: 8px;
}
.login-button:hover:not(:disabled) {
  background: #b86a44;
}
.login-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.login-switch {
  display: block;
  margin-top: 20px;
  color: #c97954;
  text-align: center;
  font-size: 12px;
  font-weight: 700;
}
</style>
