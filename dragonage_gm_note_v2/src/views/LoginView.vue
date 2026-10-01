<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-brand">
        <span class="brand-mark">DA</span>
        <div>
          <strong>DragonAge</strong>
          <small>GM COMMAND CENTER</small>
        </div>
      </div>
      <h1>캠페인에<br /><em>로그인하세요.</em></h1>
      <form @submit.prevent="handleLogin">
        <label>
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
        <button type="submit" :disabled="loading" class="login-button">
          {{ loading ? "로그인 중..." : "로그인" }}
        </button>
      </form>
    </div>
  </div>
</template>

<script>
import { signIn } from "@/services/auth";

export default {
  name: "LoginView",
  data() {
    return {
      email: "",
      password: "",
      loading: false,
      errorMessage: "",
    };
  },
  methods: {
    async handleLogin() {
      this.loading = true;
      this.errorMessage = "";
      try {
        await signIn(this.email, this.password);
        // onAuthStateChange가 router guard를 통해 자동 리디렉션
        this.$router.push({ name: "master" });
      } catch (error) {
        if (error.message?.includes("Invalid login credentials")) {
          this.errorMessage = "이메일 또는 비밀번호가 올바르지 않습니다.";
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
label input {
  background: #181c28;
  border: 1px solid #2e3448;
  color: #f4f2ed;
  padding: 12px 14px;
  font-size: 14px;
  border-radius: 2px;
  outline: none;
  transition: border-color 0.15s;
}
label input:focus {
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
</style>
