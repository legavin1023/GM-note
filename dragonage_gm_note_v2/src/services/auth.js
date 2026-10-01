/**
 * auth.js — GM 인증 관련 Supabase 함수
 * Supabase Auth (auth.users) = 실제 GM 로그인 계정
 * users 테이블 = TRPG 캐릭터 데이터 (별개)
 */
import { supabase } from "@/supabase";

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export function onAuthStateChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
  return data.subscription;
}
