import { useRef, useState } from 'react';
import { Sparkles, Send, Wrench } from 'lucide-react';
import type { AiChatTurn } from '@cleopatra/shared';
import { sendAiChatMessage } from '@/lib/ai/aiClient';
import { Button } from '@/components/ui/button';

interface ChatEntry {
  role: 'user' | 'assistant';
  text: string;
  toolsUsed?: string[];
  isError?: boolean;
}

const MAX_HISTORY_TURNS = 20;

/**
 * Cleopatra AI — Phase 1 chat panel (CLEOPATRA_AI_IMPLEMENTATION_PLAN.md).
 * Read-only Q&A only: no confirmation UI, no write actions — that's
 * deliberately out of scope until a separately-approved later phase.
 * Conversation lives only in this component's own state (no persistence,
 * per the Phase 1 architecture decision) — the full recent history is
 * resent to the backend on every message.
 */
export function AiChatPanel() {
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }));
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;

    const nextEntries: ChatEntry[] = [...entries, { role: 'user', text }];
    setEntries(nextEntries);
    setDraft('');
    setSending(true);
    scrollToBottom();

    try {
      const turns: AiChatTurn[] = nextEntries.slice(-MAX_HISTORY_TURNS).map((e) => ({ role: e.role, text: e.text }));
      const result = await sendAiChatMessage({ messages: turns });
      setEntries((prev) => [...prev, { role: 'assistant', text: result.reply, toolsUsed: result.toolsUsed }]);
    } catch (err) {
      // `err.message` is always one of our own safe Arabic strings
      // (controller/aiAgentService never let a raw provider error or
      // stack trace reach the client) — safe to show directly.
      const message = err instanceof Error ? err.message : 'حصل خطأ غير متوقع، جرّب تاني.';
      setEntries((prev) => [...prev, { role: 'assistant', text: message, isError: true }]);
    } finally {
      setSending(false);
      scrollToBottom();
    }
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-3xl flex-col gap-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Sparkles className="text-primary h-6 w-6" />
          مساعد Cleopatra الذكي
        </h1>
        <p className="text-muted-foreground text-sm">
          اسأل عن أي بيانات حقيقية في النظام (عملاء، طلبات، إنتاج، خزينة، مخزون...) — المساعد ده بيقرأ من النظام
          فعليًا ومش بيقدر ينفّذ أو يعدّل أي حاجة لسه.
        </p>
      </div>

      <div className="border-border bg-card flex-1 space-y-3 overflow-y-auto rounded-2xl border p-4">
        {entries.length === 0 && (
          <div className="text-muted-foreground flex h-full items-center justify-center text-center text-sm">
            ابدأ بسؤال زي "فاتورة العميل فلان لسه عليها كام؟" أو "الإنتاج دلوقتي فيه تأخير في أي قسم؟"
          </div>
        )}
        {entries.map((entry, i) => (
          <div key={i} className={`flex ${entry.role === 'user' ? 'justify-start' : 'justify-end'}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${
                entry.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : entry.isError
                    ? 'bg-destructive/10 text-destructive'
                    : 'bg-muted text-foreground'
              }`}
            >
              {entry.text}
              {entry.toolsUsed && entry.toolsUsed.length > 0 && (
                <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-1.5 border-t border-current/10 pt-2 text-xs">
                  <Wrench className="h-3 w-3" />
                  {entry.toolsUsed.map((tool) => (
                    <span key={tool} className="bg-background/60 rounded-full px-2 py-0.5">
                      {tool}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {sending && <div className="text-muted-foreground text-sm">جارٍ التفكير…</div>}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="اكتب سؤالك هنا..."
          disabled={sending}
          className="border-input bg-background flex-1 rounded-full border px-4 py-2 text-sm"
        />
        <Button type="button" onClick={() => void send()} disabled={sending || !draft.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
