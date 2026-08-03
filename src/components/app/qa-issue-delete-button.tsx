import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function QaIssueDeleteButton({
  targetLabel,
  pending,
  onDelete,
  compact = false,
}: {
  targetLabel: string;
  pending: boolean;
  onDelete: () => void;
  compact?: boolean;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className={
            compact
              ? "h-7 text-[#dc2626] hover:text-[#dc2626]"
              : "text-[#dc2626] hover:text-[#dc2626]"
          }
          disabled={pending}
        >
          <Trash2 className={compact ? "size-3.5" : "size-4"} />
          {compact ? "삭제" : "이슈 삭제"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>이슈를 삭제할까요?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-mono font-medium text-foreground">{targetLabel}</span> 이슈와
            여기에 남긴 댓글이 모두 삭제됩니다. 이 작업은 되돌릴 수 없어요.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>취소</AlertDialogCancel>
          <AlertDialogAction onClick={onDelete} className="bg-[#dc2626] hover:bg-[#b91c1c]">
            삭제
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
