import type { ReactNode } from 'react'

/**
 * The one page title in the app.
 *
 * There were five: text-[26px], text-4xl, text-3xl, text-4xl and
 * text-5xl, each with its own margins, so moving between tabs meant
 * watching the title jump size. Every screen now renders this, and the
 * scale lives in one place.
 *
 * `sub` is the quiet count line under the title; `action` is a control
 * that belongs on the title's own row (the schedule pages regenerate
 * from there).
 */

interface PageHeadingProps {
  title: string
  sub?: ReactNode
  action?: ReactNode
}

export default function PageHeading({ title, sub, action }: PageHeadingProps) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="font-headline text-[26px] md:text-5xl font-semibold text-on-surface">
          {title}
        </h2>
        {sub && <p className="text-sm text-outline mt-2">{sub}</p>}
      </div>
      {action && <div className="shrink-0 mt-1">{action}</div>}
    </div>
  )
}
