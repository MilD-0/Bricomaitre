import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { cn } from '../../lib/utils';

const markdownComponents: Components = {
  a: ({ className, ...props }) => (
    <a
      {...props}
      className={cn('text-primary underline underline-offset-2', className)}
      target="_blank"
      rel="noreferrer"
    />
  ),
  p: ({ className, ...props }) => (
    <p
      {...props}
      className={cn(
        'my-0 leading-[var(--type-leading-copy)] [overflow-wrap:anywhere] [&+*]:mt-3',
        className,
      )}
    />
  ),
  ul: ({ className, ...props }) => (
    <ul {...props} className={cn('my-3 list-disc space-y-1.5 ps-5', className)} />
  ),
  ol: ({ className, ...props }) => (
    <ol {...props} className={cn('my-3 list-decimal space-y-1.5 ps-5', className)} />
  ),
  li: ({ className, ...props }) => (
    <li
      {...props}
      className={cn(
        'leading-[var(--type-leading-copy)] [overflow-wrap:anywhere] marker:text-muted-foreground',
        className,
      )}
    />
  ),
  blockquote: ({ className, ...props }) => (
    <blockquote
      {...props}
      className={cn(
        'my-3 border-s-2 border-border/80 ps-3 italic text-muted-foreground',
        className,
      )}
    />
  ),
  hr: ({ className, ...props }) => (
    <hr {...props} className={cn('my-4 border-border/70', className)} />
  ),
  h1: ({ className, ...props }) => (
    <h1
      {...props}
      className={cn('mt-0 text-lg font-semibold tracking-tight [&+*]:mt-3', className)}
    />
  ),
  h2: ({ className, ...props }) => (
    <h2
      {...props}
      className={cn('mt-0 text-base font-semibold tracking-tight [&+*]:mt-3', className)}
    />
  ),
  h3: ({ className, ...props }) => (
    <h3
      {...props}
      className={cn('mt-0 text-sm font-semibold tracking-tight [&+*]:mt-2', className)}
    />
  ),
  pre: ({ className, ...props }) => (
    <pre
      {...props}
      className={cn(
        'my-4 max-w-full overflow-x-auto rounded-xl border border-border/70 bg-muted/50 p-3 text-sm',
        className,
      )}
    />
  ),
  table: ({ className, ...props }) => (
    <div className="my-3 max-w-full overflow-x-auto rounded-lg border border-border/55">
      <table
        {...props}
        className={cn(
          'w-full min-w-[28rem] border-collapse text-start text-xs leading-5',
          className,
        )}
      />
    </div>
  ),
  th: ({ className, ...props }) => (
    <th
      {...props}
      className={cn(
        'border-0 px-2 py-1.5 text-start align-top font-semibold [overflow-wrap:anywhere]',
        className,
      )}
    />
  ),
  td: ({ className, ...props }) => (
    <td
      {...props}
      className={cn(
        'border-0 px-2 py-1.5 text-start align-top [overflow-wrap:anywhere]',
        className,
      )}
    />
  ),
  code: ({ className, children, ...props }) => {
    const isBlock = typeof className === 'string' && className.includes('language-');

    if (isBlock) {
      return (
        <code {...props} className={className}>
          {children}
        </code>
      );
    }

    return (
      <code
        {...props}
        className={cn(
          'rounded-md bg-muted/60 px-1.5 py-0.5 font-mono text-[length:var(--type-size-relative-compact)]',
          className,
        )}
      >
        {children}
      </code>
    );
  },
};

export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div
      className={cn(
        'min-w-0 w-full max-w-[75ch] overflow-hidden text-sm text-foreground [overflow-wrap:anywhere] [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
