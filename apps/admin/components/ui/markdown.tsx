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
        'my-0 whitespace-pre-wrap leading-6 [overflow-wrap:anywhere] [&+*]:mt-4',
        className,
      )}
    />
  ),
  ul: ({ className, ...props }) => (
    <ul {...props} className={cn('my-4 list-disc space-y-1 pl-6', className)} />
  ),
  ol: ({ className, ...props }) => (
    <ol {...props} className={cn('my-4 list-decimal space-y-1 pl-6', className)} />
  ),
  li: ({ className, ...props }) => (
    <li
      {...props}
      className={cn(
        'whitespace-pre-wrap leading-6 [overflow-wrap:anywhere] marker:text-muted-foreground',
        className,
      )}
    />
  ),
  blockquote: ({ className, ...props }) => (
    <blockquote
      {...props}
      className={cn(
        'my-4 border-l-2 border-border/80 pl-4 italic text-muted-foreground',
        className,
      )}
    />
  ),
  hr: ({ className, ...props }) => (
    <hr {...props} className={cn('my-6 border-border/70', className)} />
  ),
  h1: ({ className, ...props }) => (
    <h1
      {...props}
      className={cn('mt-0 text-xl font-semibold tracking-tight [&+*]:mt-4', className)}
    />
  ),
  h2: ({ className, ...props }) => (
    <h2
      {...props}
      className={cn('mt-0 text-lg font-semibold tracking-tight [&+*]:mt-4', className)}
    />
  ),
  h3: ({ className, ...props }) => (
    <h3
      {...props}
      className={cn('mt-0 text-base font-semibold tracking-tight [&+*]:mt-3', className)}
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
    <table
      {...props}
      className={cn(
        'my-4 w-full max-w-full table-fixed border-collapse text-start text-xs leading-5',
        className,
      )}
    />
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
        className={cn('rounded-md bg-muted/60 px-1.5 py-0.5 font-mono text-[0.925em]', className)}
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
        'min-w-0 max-w-full overflow-hidden text-sm text-foreground [overflow-wrap:anywhere] [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
