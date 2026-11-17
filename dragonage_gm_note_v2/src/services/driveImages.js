import { supabase } from "../supabase";
import {
  driveFileId,
  functionFailure,
  MAX_IMAGE_BYTES,
} from "./driveImageProtocol.mjs";

const operations = new WeakMap();

async function invokeDrive(body) {
  const { data: auth, error: authError } = await supabase.auth.getSession();
  if (authError || !auth.session) throw new Error("로그인이 필요합니다.");
  const { data, error } = await supabase.functions.invoke(
    "drive-image-upload",
    {
      headers: { Authorization: `Bearer ${auth.session.access_token}` },
      body,
    }
  );
  if (error || !data?.ok) throw await functionFailure(error, data);
  return data;
}

export async function uploadImageToDrive(file, context = {}) {
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];

  if (!allowed.includes(file.type)) {
    throw new Error("JPG, PNG, WebP, GIF만 업로드 가능합니다.");
  }

  if (!file.size || file.size > MAX_IMAGE_BYTES) {
    throw new Error("0바이트를 초과하는 10MB 이하 이미지만 업로드 가능합니다.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const chunkSize = 8192;
  let binary = "";

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  if (!operations.has(file)) operations.set(file, crypto.randomUUID());
  const data = await invokeDrive({
    ...context,
    action: "upload",
    operationId: operations.get(file),
    name: `gmcat_${context.kind || "other"}__${file.name}`,
    mimeType: file.type,
    base64: btoa(binary),
  });
  if (!driveFileId(data.url) || driveFileId(data.url) !== data.id) {
    throw new Error("이미지 서버가 올바른 Drive 주소를 반환하지 않았습니다.");
  }

  return {
    id: data.id,
    url: data.url,
    fileUrl: data.fileUrl,
  };
}

export async function deleteDriveImage(url) {
  const id = driveFileId(url);
  if (!id) return { skipped: true };
  const result = await invokeDrive({ action: "delete", id });
  return result;
}

export async function diagnoseDriveImages() {
  return invokeDrive({ action: "diagnose" });
}
