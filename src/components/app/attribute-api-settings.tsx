import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { db } from "@/lib/queries";
import { errorMessage } from "@/lib/domain";

type ApiSettings = {
  project_id: string;
  base_url: string;
  updated_at: string;
};

export function AttributeApiSettings({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["attribute-api-settings", projectId],
    queryFn: async () => {
      const { data, error } = await db
        .from("project_attribute_api_settings")
        .select("project_id, base_url, updated_at")
        .eq("project_id", projectId)
        .maybeSingle();
      if (error) throw error;
      return data as ApiSettings | null;
    },
    enabled: open,
  });
  const [baseUrl, setBaseUrl] = useState("");
  const [secretInput, setSecretInput] = useState("");

  useEffect(() => {
    if (data) {
      setBaseUrl(data.base_url);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        project_id: projectId,
        base_url: baseUrl,
        updated_at: new Date().toISOString(),
      };
      if (secretInput) payload.auth_secret = secretInput;
      const { error } = await db
        .from("project_attribute_api_settings")
        .upsert(payload, { onConflict: "project_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Attribute API 설정을 저장했어요");
      setSecretInput("");
      qc.invalidateQueries({ queryKey: ["attribute-api-settings", projectId] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Attribute API 설정</DialogTitle>
          <DialogDescription>
            QA 라운드에서 attribute 스냅샷을 캡처할 때 호출할 이 프로젝트 전용 API 서버예요.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="api-base-url">Braze REST API 엔드포인트</Label>
            <Input
              id="api-base-url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://rest.iad-01.braze.com"
            />
            <p className="text-xs text-muted-foreground">
              Braze 대시보드 → Settings → APIs and Identifiers → REST API Key 페이지에서 확인할 수
              있어요. 경로(/users/export/ids)는 자동으로 붙어요.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="api-secret">API Key</Label>
            <Input
              id="api-secret"
              type="password"
              value={secretInput}
              onChange={(e) => setSecretInput(e.target.value)}
              placeholder="재입력 시에만 교체돼요 — 현재 값은 표시되지 않아요"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !baseUrl.trim()}>
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
