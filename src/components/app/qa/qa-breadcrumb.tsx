import { Link } from "@tanstack/react-router";
import { Fragment } from "react";

export type QaBreadcrumbItem = {
  label: string;
  to?: string;
  params?: Record<string, string>;
};

export function QaBreadcrumb({ items }: { items: QaBreadcrumbItem[] }) {
  return (
    <nav aria-label="경로" className="flex flex-wrap items-center gap-[7px] text-[12.5px]">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <Fragment key={`${item.label}-${index}`}>
            {index > 0 ? (
              <span aria-hidden className="text-[#cbd4de]">
                /
              </span>
            ) : null}
            {isLast || !item.to ? (
              <span
                aria-current={isLast ? "page" : undefined}
                className={isLast ? "font-semibold text-[#1c2431]" : "text-[#8b97a8]"}
              >
                {item.label}
              </span>
            ) : (
              <Link
                // `to`/`params` are intentionally typed as plain `string` / `Record<string, string>`
                // on QaBreadcrumbItem so this component stays generic across the round/session/item
                // routes that use it (none of which exist yet). TanStack Router's typed `Link`
                // expects `to` to be a literal from its known route union (and `params` to match
                // that route), not plain `string`/`Record`, so we cast at the call site rather
                // than narrowing the component's public API to a specific route union.
                to={item.to as never}
                params={item.params as never}
                className="text-[#8b97a8] hover:text-[#2b6a9c]"
              >
                {item.label}
              </Link>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
