import { supabase } from "@/supabase";

let registrationPromise;
export const defaultPushPreferences = () => ({
  receive_new_posts: true,
  receive_own_comments: false,
  receive_notices: false,
  receive_session_reminders: false,
  receive_activity: false,
  all_teams: true,
  team_ids: [],
  include_master_artwork: true,
});
function preferencesPayload(preferences) {
  return {
    receive_new_posts: Boolean(preferences.receive_new_posts),
    receive_own_comments: Boolean(preferences.receive_own_comments),
    receive_notices: Boolean(preferences.receive_notices),
    receive_session_reminders: Boolean(preferences.receive_session_reminders),
    receive_activity: Boolean(preferences.receive_activity),
    all_teams: Boolean(preferences.all_teams),
    team_ids: [...new Set(preferences.team_ids || [])],
    include_master_artwork: Boolean(preferences.include_master_artwork),
  };
}
export function pushEnvironmentMessage() {
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    navigator.standalone;
  if (ios && !standalone)
    return "iPhone/iPad: Safari 공유 버튼 → 홈 화면에 추가 → 홈 화면의 앱을 열어 알림을 신청하세요. iOS/iPadOS 16.4 이상이 필요합니다.";
  if (!window.isSecureContext)
    return "알림은 HTTPS 사이트 또는 localhost에서 사용할 수 있습니다.";
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  )
    return "이 환경은 Web Push를 지원하지 않습니다. Android Chrome 또는 최신 홈 화면 웹 앱을 이용하세요.";
  return "";
}

export function registerPushWorker() {
  if (!("serviceWorker" in navigator) || !window.isSecureContext)
    return Promise.resolve(null);
  if (!registrationPromise) {
    const base = new URL(process.env.BASE_URL, window.location.origin);
    registrationPromise = navigator.serviceWorker
      .register(new URL("sw.js", base).href, {
        scope: base.pathname,
        updateViaCache: "none",
      })
      .then(async (registration) => {
        if (!registration.active) {
          const worker = registration.installing || registration.waiting;
          if (worker)
            await new Promise((resolve, reject) => {
              const timer = setTimeout(
                () =>
                  reject(
                    new Error(
                      "알림 서비스 준비 시간이 초과되었습니다. 새로고침해 주세요."
                    )
                  ),
                15000
              );
              const check = () => {
                if (
                  worker.state === "activated" ||
                  worker.state === "redundant"
                ) {
                  clearTimeout(timer);
                  worker.removeEventListener("statechange", check);
                  worker.state === "activated"
                    ? resolve()
                    : reject(new Error("알림 서비스 설치에 실패했습니다."));
                }
              };
              worker.addEventListener("statechange", check);
              check();
            });
        }
        return registration;
      })
      .catch((error) => {
        registrationPromise = null;
        throw error;
      });
  }
  return registrationPromise;
}

export async function currentPushState() {
  const registration = await registerPushWorker();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return { subscribed: false, deviceSubscription: false };
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select(
      "id,receive_new_posts,receive_own_comments,receive_notices,receive_session_reminders,receive_activity,all_teams,team_ids,include_master_artwork"
    )
    .eq("endpoint", subscription.endpoint)
    .maybeSingle();
  if (error)
    throw new Error(
      "알림 설정을 확인하지 못했습니다. Supabase SQL 설정과 연결을 확인하세요."
    );
  return {
    subscribed: Boolean(data),
    deviceSubscription: true,
    preferences: data ? preferencesPayload(data) : null,
  };
}

function applicationKey(value) {
  const decoded = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

// Called directly by the click handler; requestPermission must retain user activation on iOS.
export async function subscribeToPosts(preferences = defaultPushPreferences()) {
  const publicKey = process.env.VUE_APP_VAPID_PUBLIC_KEY;
  if (!publicKey)
    throw new Error(
      "알림 공개 키가 아직 설정되지 않았습니다. 관리자에게 문의하세요."
    );
  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    throw new Error(
      permission === "denied"
        ? "알림이 차단되었습니다. 브라우저 또는 휴대폰 설정에서 알림을 허용해 주세요."
        : "알림 허용을 선택해야 신청할 수 있습니다."
    );
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("로그인 후 알림을 신청해 주세요.");
  const registration = await registerPushWorker();
  let subscription = await registration.pushManager.getSubscription();
  const key = applicationKey(publicKey);
  if (
    subscription &&
    subscription.options.applicationServerKey &&
    String(new Uint8Array(subscription.options.applicationServerKey)) !==
      String(key)
  ) {
    await unsubscribeFromPosts();
    subscription = null;
  }
  // If a different account used this device, retire that endpoint instead of taking it over.
  if (subscription) {
    const state = await currentPushState();
    if (!state.subscribed) {
      await subscription.unsubscribe();
      subscription = null;
    }
  }
  if (!subscription)
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key,
    });
  const json = subscription.toJSON();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      ...preferencesPayload(preferences),
    },
    { onConflict: "endpoint" }
  );
  if (error) {
    await subscription.unsubscribe();
    throw new Error(
      "알림 구독 저장에 실패했습니다. 연결과 Supabase 설정을 확인한 뒤 다시 신청하세요."
    );
  }
}

export async function savePushPreferences(preferences) {
  const registration = await registerPushWorker();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) throw new Error("먼저 이 기기의 알림을 신청해 주세요.");
  const { data, error } = await supabase
    .from("push_subscriptions")
    .update(preferencesPayload(preferences))
    .eq("endpoint", subscription.endpoint)
    .select("id")
    .maybeSingle();
  if (error || !data)
    throw new Error(
      "알림 설정을 저장하지 못했습니다. 로그인과 연결을 확인하세요."
    );
}

export async function unsubscribeFromPosts() {
  const registration = await registerPushWorker();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  // Delete first: on failure preserve the subscription so the user can retry.
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", subscription.endpoint);
  if (error)
    throw new Error(
      "알림 해제 정보를 저장하지 못했습니다. 다시 시도해 주세요."
    );
  if (!(await subscription.unsubscribe()))
    throw new Error(
      "기기의 알림 구독 해제에 실패했습니다. 다시 시도해 주세요."
    );
}
