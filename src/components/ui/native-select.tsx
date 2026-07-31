import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * 네이티브 <select> 래퍼. Radix Select(select.tsx)와 높이/보더/라운드/폰트를 맞추되,
 * 리스트 카드 헤더처럼 짧은 옵션의 필터·정렬 드롭다운에 가벼운 네이티브 컨트롤이 필요할 때 씀.
 */
const NativeSelect = React.forwardRef<HTMLSelectElement, React.ComponentPropsWithoutRef<"select">>(
  ({ className, children, ...props }, ref) => (
    <div className="relative inline-flex">
      <select
        ref={ref}
        className={cn(
          "h-[34px] cursor-pointer appearance-none rounded-md border border-input bg-transparent py-2 pl-3 pr-8 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
    </div>
  ),
);
NativeSelect.displayName = "NativeSelect";

export { NativeSelect };
