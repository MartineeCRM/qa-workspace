import { createServerFn } from "@tanstack/react-start";

type FetchSnapshotInput = { projectId: string; brazeId: string };

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export type FetchSnapshotResult =
  { ok: true; attributes: Record<string, Json> } | { ok: false; error: string };

export const fetchBrazeAttributeSnapshot = createServerFn({ method: "POST" })
  .validator((data: FetchSnapshotInput) => data)
  .handler(async ({ data }): Promise<FetchSnapshotResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: settings, error } = await supabaseAdmin
      .from("project_attribute_api_settings")
      .select("base_url, auth_secret")
      .eq("project_id", data.projectId)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!settings?.base_url || !settings.auth_secret) {
      return { ok: false, error: "이 프로젝트엔 Attribute API 설정이 없어요. 먼저 저장해주세요." };
    }

    const url = `${settings.base_url.replace(/\/+$/, "")}/users/export/ids`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.auth_secret}`,
        },
        body: JSON.stringify({
          braze_id: data.brazeId,
          fields_to_export: ["custom_attributes"],
        }),
      });
    } catch {
      return { ok: false, error: "Braze API 서버에 연결할 수 없어요." };
    }

    if (!response.ok) {
      return { ok: false, error: `Braze API 오류 (HTTP ${response.status})` };
    }

    const body = (await response.json()) as {
      users?: { braze_id?: string; custom_attributes?: Record<string, Json> }[];
      invalid_user_ids?: string[];
    };

    if (body.invalid_user_ids?.includes(data.brazeId)) {
      return { ok: false, error: "Braze에 존재하지 않는 braze_id예요." };
    }
    const user = body.users?.[0];
    if (!user) {
      return { ok: false, error: "응답에서 유저 데이터를 찾을 수 없어요." };
    }
    return { ok: true, attributes: user.custom_attributes ?? {} };
  });
