'use client';
import { FileText, MessageCircle, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  type BulletinPostRecord,
  type BulletinReactionRecord,
  type BulletinReplyRecord,
} from '../../lib/bulletin';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { CompactMenu, CompactMenuItem } from '../ui/compact-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Markdown } from '../ui/markdown';
import { Textarea } from '../ui/textarea';
import { formatAttachmentSize } from './state';

function ReactionRow({
  currentUserId,
  reactions,
  options,
  busy,
  onReact,
  addReactionLabel,
  byLabel,
  byYouLabel,
}: {
  currentUserId: string | null;
  reactions: BulletinReactionRecord[];
  options: string[];
  busy: boolean;
  onReact: (emoji: string) => void;
  addReactionLabel: string;
  byLabel: string;
  byYouLabel: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-[var(--type-tracking-p160)] text-muted-foreground">
          {addReactionLabel}
        </span>
        {options.map((emoji) => {
          const existing = reactions.find((reaction) => reaction.emoji === emoji);
          return (
            <Button
              key={emoji}
              type="button"
              variant={existing?.reacted ? 'default' : 'outline'}
              size="sm"
              className="rounded-full"
              disabled={busy}
              onClick={() => onReact(emoji)}
            >
              <span>{emoji}</span>
              {existing ? <span>{existing.count}</span> : null}
            </Button>
          );
        })}
      </div>

      {reactions.length > 0 ? (
        <div className="flex flex-col gap-1">
          {reactions.map((reaction) => (
            <p key={reaction.emoji} className="text-xs text-muted-foreground">
              {reaction.emoji} {byLabel}:{' '}
              {reaction.users
                .map((user) =>
                  currentUserId !== null && user.id === currentUserId ? byYouLabel : user.name,
                )
                .join(', ')}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function BulletinPostCard({
  post,
  currentUserId,
  busy,
  reactionOptions,
  labels,
  onEdit,
  onDelete,
  onTogglePin,
  onReact,
  onReply,
  onDeleteReply,
  onReplyReact,
}: {
  post: BulletinPostRecord;
  currentUserId: string | null;
  busy: boolean;
  reactionOptions: string[];
  labels: {
    actions: string;
    delete: string;
    edit: string;
    pin: string;
    unpin: string;
    pinned: string;
    byYou: string;
    updated: string;
    refreshReply: string;
    sendReply: string;
    cancel: string;
    addReaction: string;
    deleteReply: string;
    replyPlaceholder: string;
    reactionsBy: string;
    replies: string;
  };
  onEdit: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onReact: (emoji: string) => void;
  onReply: (body: string) => Promise<unknown>;
  onDeleteReply: (reply: BulletinReplyRecord) => void;
  onReplyReact: (reply: BulletinReplyRecord, emoji: string) => void;
}) {
  const isAuthor = currentUserId !== null && post.author.id === currentUserId;
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [deleteReply, setDeleteReply] = useState<BulletinReplyRecord | null>(null);

  return (
    <article
      className={`mx-auto w-full max-w-5xl px-3 py-5 sm:px-4 lg:px-5 ${post.pinned ? 'bg-amber-500/[0.035]' : ''}`}
      data-bulletin-post={post.id}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-foreground">{post.title}</h3>
            {post.pinned ? <Badge variant="outline">{labels.pinned}</Badge> : null}
            {isAuthor ? <Badge>{labels.byYou}</Badge> : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {post.author.name} · {labels.updated}: {new Date(post.updatedAt).toLocaleString()}
          </p>
        </div>

        {post.permissions.canPin || post.permissions.canEdit || post.permissions.canDelete ? (
          <CompactMenu label={`${labels.actions} · ${post.title}`}>
            {post.permissions.canPin ? (
              <CompactMenuItem disabled={busy} onClick={onTogglePin}>
                {post.pinned ? labels.unpin : labels.pin}
              </CompactMenuItem>
            ) : null}
            {post.permissions.canEdit ? (
              <CompactMenuItem disabled={busy} onClick={onEdit}>
                {labels.edit}
              </CompactMenuItem>
            ) : null}
            {post.permissions.canDelete ? (
              <CompactMenuItem destructive disabled={busy} onClick={onDelete}>
                {labels.delete}
              </CompactMenuItem>
            ) : null}
          </CompactMenu>
        ) : null}
      </div>

      <Markdown className="mt-4">{post.body}</Markdown>

      {post.attachments.length > 0 ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {post.attachments.map((attachment) => (
            <a
              key={`${post.id}-${attachment.fileUrl}`}
              href={attachment.fileUrl}
              target="_blank"
              rel="noreferrer"
              className="border-y border-border/60 px-1 py-3 transition-colors hover:bg-accent/50"
            >
              <div className="flex items-center gap-3">
                {attachment.contentType.startsWith('image/') ? (
                  // eslint-disable-next-line @next/next/no-img-element -- Admin previews display uploaded or remote images directly.
                  <img
                    src={attachment.fileUrl}
                    alt={attachment.fileName}
                    className="size-14 rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex size-14 items-center justify-center rounded-lg border border-border/70 bg-muted/30 text-muted-foreground">
                    <FileText className="size-5" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{attachment.fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatAttachmentSize(attachment.size)}
                  </p>
                </div>
              </div>
            </a>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {post.tags.map((tag) => (
          <Badge key={`${post.id}-${tag}`} variant="secondary">
            {tag}
          </Badge>
        ))}
      </div>

      <div className="mt-4">
        <ReactionRow
          currentUserId={currentUserId}
          reactions={post.reactions}
          options={reactionOptions}
          busy={busy}
          onReact={onReact}
          addReactionLabel={labels.addReaction}
          byLabel={labels.reactionsBy}
          byYouLabel={labels.byYou}
        />
      </div>

      <div className="mt-5 border-t border-border/60 pt-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <MessageCircle className="size-4 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">{labels.replies}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => setReplyOpen((value) => !value)}
          >
            {labels.refreshReply}
          </Button>
        </div>

        {replyOpen ? (
          <div className="mt-3 flex flex-col gap-3 border-y border-border/60 py-3">
            <Textarea
              value={replyBody}
              onChange={(event) => setReplyBody(event.target.value)}
              placeholder={labels.replyPlaceholder}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={busy || replyBody.trim().length === 0}
                onClick={async () => {
                  try {
                    await onReply(replyBody.trim());
                    setReplyBody('');
                    setReplyOpen(false);
                  } catch {
                    // The mutation reports the error; retain the reply for retry.
                  }
                }}
              >
                {labels.sendReply}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setReplyOpen(false)}>
                {labels.cancel}
              </Button>
            </div>
          </div>
        ) : null}

        {post.replies.length > 0 ? (
          <div className="mt-3 divide-y divide-border/60 border-t border-border/60">
            {post.replies.map((reply) => (
              <div key={reply.id} className="py-3" data-bulletin-reply={reply.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {currentUserId !== null && reply.author.id === currentUserId
                        ? labels.byYou
                        : reply.author.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(reply.updatedAt).toLocaleString()}
                    </p>
                  </div>
                  {reply.permissions.canDelete ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => setDeleteReply(reply)}
                    >
                      <Trash2 data-icon="inline-start" />
                      {labels.deleteReply}
                    </Button>
                  ) : null}
                </div>
                <Markdown className="mt-3">{reply.body}</Markdown>
                <div className="mt-3">
                  <ReactionRow
                    currentUserId={currentUserId}
                    reactions={reply.reactions}
                    options={reactionOptions}
                    busy={busy}
                    onReact={(emoji) => onReplyReact(reply, emoji)}
                    addReactionLabel={labels.addReaction}
                    byLabel={labels.reactionsBy}
                    byYouLabel={labels.byYou}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <Dialog
        open={deleteReply !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteReply(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{labels.deleteReply}</DialogTitle>
            <DialogDescription>{deleteReply?.body ?? ''}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteReply(null)}>
              {labels.cancel}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => {
                if (deleteReply) {
                  onDeleteReply(deleteReply);
                  setDeleteReply(null);
                }
              }}
            >
              {labels.deleteReply}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}
