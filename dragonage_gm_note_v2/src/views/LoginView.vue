<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-brand">
        <span class="brand-mark">DA</span>
        <div>
          <strong>DragonAge</strong>
          <small>{{
            playerMode ? "PLAYER ACCESS" : "GM COMMAND CENTER"
          }}</small>
        </div>
      </div>
      <h1>
        {{ playerMode ? "플레이어" : "GM" }} 계정으로<br /><em
          >로그인하세요.</em
        >
      </h1>
      <form @submit.prevent="handleLogin">
        <label v-if="playerMode">
          로그인 아이디 (username)
          <select
            v-model="username"
            required
            :disabled="playerEmailsLoading || !playerUsernames.length"
            @change="handleUsernameChange"
          >
            <option value="" disabled>
              {{
                playerEmailsLoading
                  ? "계정 목록을 불러오는 중…"
                  : "플레이어 아이디를 선택하세요"
              }}
            </option>
            <option
              v-for="playerUsername in playerUsernames"
              :key="playerUsername"
              :value="playerUsername"
            >
              {{ playerUsername }}
            </option>
          </select>
        </label>
        <label v-else>
          이메일
          <input
            v-model.trim="email"
            type="email"
            required
            autocomplete="email"
          />
        </label>
        <p v-if="playerMode && username && pinStatusLoading" class="login-hint">
          비밀번호 설정 여부를 확인하는 중…
        </p>
        <p v-else-if="playerMode && pinConfigured === false" class="login-hint">
          이 계정은 아직 PIN이 없습니다. 최초 PIN을 설정하고 로그인하세요.
        </p>
        <p v-else-if="playerMode && pinConfigured === true" class="login-hint">
          설정된 4자리 PIN을 입력하세요.
        </p>
        <label v-if="!playerMode || pinConfigured === true">
          {{ playerMode ? "4자리 PIN" : "비밀번호" }}
          <input
            v-model="password"
            type="password"
            required
            :maxlength="playerMode ? 4 : undefined"
            :inputmode="playerMode ? 'numeric' : undefined"
            :pattern="playerMode ? '[0-9]{4}' : undefined"
            :autocomplete="playerMode ? 'one-time-code' : 'current-password'"
          />
        </label>
        <template v-if="playerMode && pinConfigured === false">
          <label>
            최초 설정 코드
            <input
              v-model.trim="setupCode"
              type="text"
              required
              autocomplete="off"
              maxlength="32"
              placeholder="Dragonage"
            />
          </label>
          <label>
            새 4자리 PIN
            <input
              v-model="newPin"
              type="password"
              required
              inputmode="numeric"
              maxlength="4"
              pattern="[0-9]{4}"
              autocomplete="new-password"
            />
          </label>
          <label>
            새 PIN 확인
            <input
              v-model="confirmPin"
              type="password"
              required
              inputmode="numeric"
              maxlength="4"
              pattern="[0-9]{4}"
              autocomplete="new-password"
            />
          </label>
        </template>
        <p v-if="errorMessage" class="login-error">{{ errorMessage }}</p>
        <p
          v-if="
            playerMode &&
            !playerEmailsLoading &&
            !playerUsernames.length &&
            !errorMessage
          "
          class="login-error"
        >
          팀에 소속된 플레이어 username이 없습니다.
        </p>
        <button
          type="submit"
          :disabled="
            loading ||
            playerEmailsLoading ||
            pinStatusLoading ||
            (playerMode && (!username || pinConfigured === null)) ||
            (playerMode && !playerUsernames.length)
          "
          class="login-button"
        >
          {{
            loading
              ? pinConfigured === false
                ? "PIN 설정 및 로그인 중…"
                : "로그인 중..."
              : pinConfigured === false
              ? "PIN 설정하고 입장하기"
              : "로그인"
          }}
        </button>
      </form>
      <router-link
        v-if="playerMode"
        class="login-switch"
        :to="{ name: 'gm-login' }"
        >GM 로그인으로</router-link
      >
      <router-link v-else class="login-switch" :to="{ name: 'login' }"
        >플레이어 로그인으로</router-link
      >
    </div>
  </div>
</template>

<script>
import { signIn, signOut } from "@/services/auth";
import {
  getPlayerLoginUsernames,
  getPlayerPinStatus,
  setupPlayerPin,
  signInPlayer,
} from "@/services/playerAccounts";
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
      pinConfigured: null,
      pinStatusLoading: false,
      setupCode: "",
      newPin: "",
      confirmPin: "",
      pinStatusRequestId: 0,
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
        this.pinConfigured = null;
        this.setupCode = "";
        this.newPin = "";
        this.confirmPin = "";
      }
    },
  },
  methods: {
    async loadPlayerUsernames() {
      this.playerEmailsLoading = true;
      try {
        this.playerUsernames = await getPlayerLoginUsernames();
        if (!this.username && this.playerUsernames.length) {
          this.username = this.playerUsernames[0];
          await this.handleUsernameChange();
        }
      } catch (error) {
        this.errorMessage =
          "플레이어 계정 목록을 불러오지 못했습니다: " +
          (error.message || error);
      } finally {
        this.playerEmailsLoading = false;
      }
    },
    async handleUsernameChange() {
      const requestId = ++this.pinStatusRequestId;
      this.pinConfigured = null;
      this.password = "";
      this.setupCode = "";
      this.newPin = "";
      this.confirmPin = "";
      this.errorMessage = "";
      if (!this.username) return;

      this.pinStatusLoading = true;
      try {
        const status = await getPlayerPinStatus(this.username);
        if (requestId === this.pinStatusRequestId)
          this.pinConfigured = status.configured;
      } catch (error) {
        if (requestId === this.pinStatusRequestId) {
          this.errorMessage =
            error.message || "PIN 상태를 확인하지 못했습니다.";
        }
      } finally {
        if (requestId === this.pinStatusRequestId)
          this.pinStatusLoading = false;
      }
    },
    async handleLogin() {
      this.loading = true;
      this.errorMessage = "";
      try {
        if (this.playerMode && this.pinConfigured === false) {
          if (!/^\d{4}$/.test(this.newPin)) {
            throw new Error("PIN은 숫자 4자리로 입력해 주세요.");
          }
          if (this.newPin !== this.confirmPin) {
            throw new Error("PIN 확인 값이 일치하지 않습니다.");
          }
          await setupPlayerPin(this.username, this.setupCode, this.newPin);
          this.newPin = "";
          this.confirmPin = "";
          this.setupCode = "";
        } else if (this.playerMode)
          await signInPlayer(this.username, this.password);
        else await signIn(this.email, this.password);
        const { data: context, error: contextError } = await supabase.rpc(
          "player_team_context"
        );
        if (contextError) throw contextError;
        const isPlayerAccount = Array.isArray(context) && context.length > 0;
        if (isPlayerAccount !== this.playerMode) {
          await signOut();
          throw new Error(
            this.playerMode
              ? "이 계정은 플레이어 팀에 연결되어 있지 않습니다. GM에게 팀 연결을 요청하세요."
              : "플레이어 계정입니다. 플레이어 로그인 화면을 이용하세요."
          );
        }
        // onAuthStateChange가 router guard를 통해 자동 리디렉션
        this.$router.push({ name: this.playerMode ? "home" : "master" });
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
  background: #111;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.login-card {
  background: #1d1d1d;
  border: 1px solid #383838;
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
  background: #a94b55;
  color: #fff;
  font: 600 13px "DM Mono", monospace;
  border-radius: 2px;
  flex-shrink: 0;
}
.login-brand strong {
  display: block;
  color: #f0f0f0;
  font-size: 15px;
  letter-spacing: -0.02em;
}
.login-brand small {
  display: block;
  color: #b0b0b0;
  font-size: 9px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  margin-top: 2px;
}
h1 {
  color: #f0f0f0;
  font-size: 28px;
  font-weight: 800;
  letter-spacing: -0.03em;
  margin: 0 0 32px;
  line-height: 1.2;
}
h1 em {
  color: #d47b83;
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
  color: #b0b0b0;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
label input,
label select {
  background: #111;
  border: 1px solid #383838;
  color: #f0f0f0;
  padding: 12px 14px;
  font-size: 14px;
  border-radius: 2px;
  outline: none;
  transition: border-color 0.15s;
}
label input:focus,
label select:focus {
  border-color: #d47b83;
}
.login-error {
  color: #d47b83;
  font-size: 13px;
  margin: 0;
  padding: 10px 12px;
  background: rgba(169, 75, 85, 0.12);
  border: 1px solid rgba(169, 75, 85, 0.35);
  border-radius: 2px;
}
.login-hint {
  color: #e8e8e8;
  font-size: 13px;
  line-height: 1.5;
  margin: 0;
}
.login-button {
  background: #a94b55;
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
  background: #8f3d47;
}
.login-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.login-switch {
  display: block;
  margin-top: 20px;
  color: #d47b83;
  text-align: center;
  font-size: 12px;
  font-weight: 700;
}
@media (max-width: 600px) {
  .login-page {
    min-height: 100dvh;
    align-items: flex-start;
    padding: max(16px, env(safe-area-inset-top)) 14px
      max(16px, env(safe-area-inset-bottom));
  }
  .login-card {
    padding: 32px 22px;
  }
  .login-brand {
    margin-bottom: 26px;
  }
  h1 {
    margin-bottom: 26px;
    font-size: 25px;
  }
  label input,
  label select {
    min-height: 46px;
    font-size: 16px;
  }
  .login-button {
    min-height: 48px;
  }
}
</style>
