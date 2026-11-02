import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ref, onValue, set, serverTimestamp, type Database } from 'firebase/database';
import { onIdTokenChanged, type Auth, type User } from 'firebase/auth';
import { MessageSquare, Send, X, Check, Clock } from 'lucide-react';
import { OutingNative, isNativeApp } from './native';
import { useAlarm } from './alerts';

/**
 * Coordinator "call back" messages with read receipts.
 *
 * Faculty write a message into each chosen student's inbox: inbox/{studentUid}/{messageId}.
 * The student's phone shows it full screen (native service when the app is closed, the overlay
 * below when the app is open). "Got it" writes seenAt, which faculty see as a read receipt.
 */

export interface InboxMessage {
  id: string;
  text: string;
  fromName: string;
  createdAt: number;
  batch: string;
  seenAt: number | null;
}

type RawMessage = { text?: string; fromName?: string; createdAt?: number; batch?: string; seenAt?: number | null };
export type InboxTree = Record<string, Record<string, RawMessage>>;

/** Messages older than this are ignored. */
export const MSG_TTL_MS = 24 * 60 * 60 * 1000;
/** A message not seen after this long is flagged to faculty. */
export const UNSEEN_FLAG_MS = 2 * 60 * 1000;
export const MAX_MESSAGE_LENGTH = 200;

export const QUICK_MESSAGES = [
  'Return to the hostel now.',
  'Call your coordinator now.',
  'The outing ends in 30 minutes. Start returning.',
  'Share your exact location and stay where you are.',
];

/** Messages this student has not seen yet, oldest first. */
export function unseenFor(tree: InboxTree | null, uid: string, now: number): InboxMessage[] {
  const mine = tree?.[uid];
  if (!mine) return [];
  const out: InboxMessage[] = [];
  for (const [id, m] of Object.entries(mine)) {
    if (!m || typeof m.text !== 'string') continue;
    if (m.seenAt) continue;
    const created = Number(m.createdAt) || 0;
    if (created <= 0 || Math.abs(now - created) > MSG_TTL_MS) continue;
    out.push({ id, text: m.text, fromName: m.fromName || 'Your coordinator', createdAt: created, batch: m.batch || id, seenAt: null });
  }
  return out.sort((a, b) => a.createdAt - b.createdAt);
}

export interface Batch {
  id: string;
  text: string;
  fromName: string;
  createdAt: number;
  recipients: Array<{ uid: string; seenAt: number | null }>;
}

/** Groups the inbox of every student into one entry per message sent, newest first. */
export function buildBatches(tree: InboxTree | null, now: number, limit = 8): Batch[] {
  const map = new Map<string, Batch>();
  for (const [uid, msgs] of Object.entries(tree || {})) {
    for (const [id, m] of Object.entries(msgs || {})) {
      if (!m || typeof m.text !== 'string') continue;
      const created = Number(m.createdAt) || 0;
      if (created <= 0 || Math.abs(now - created) > MSG_TTL_MS) continue;
      const key = m.batch || id;
      let b = map.get(key);
      if (!b) {
        b = { id: key, text: m.text, fromName: m.fromName || 'Coordinator', createdAt: created, recipients: [] };
        map.set(key, b);
      }
      b.recipients.push({ uid, seenAt: m.seenAt ? Number(m.seenAt) : null });
    }
  }
  return [...map.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
}

/** Students who have not seen a message that is older than UNSEEN_FLAG_MS. */
export function countOverdue(tree: InboxTree | null, now: number): number {
  let n = 0;
  for (const b of buildBatches(tree, now, 50)) {
    if (now - b.createdAt < UNSEEN_FLAG_MS) continue;
    n += b.recipients.filter((r) => !r.seenAt).length;
  }
  return n;
}

/* ----------------------------------------------------------- student side */

interface InboxOptions {
  db: Database;
  user: User;
  auth: Auth;
  firebaseConfig: { apiKey: string; databaseURL: string };
}

export function useStudentInbox(o: InboxOptions) {
  const [tree, setTree] = useState<InboxTree | null>(null);
  const cb = useRef(o);
  cb.current = o;
  const uid = o.user.uid;

  useEffect(() => {
    return onValue(ref(o.db, `inbox/${uid}`), (s) => setTree({ [uid]: s.val() || {} }), () => setTree(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // Native service: lets messages arrive on the lock screen while the app is closed.
  useEffect(() => {
    if (!isNativeApp) return;
    let off: (() => void) | null = null;
    let cancelled = false;
    const push = async (u: User) => {
      const res = await u.getIdTokenResult();
      await OutingNative.setAuth({
        uid: u.uid,
        apiKey: cb.current.firebaseConfig.apiKey,
        databaseUrl: cb.current.firebaseConfig.databaseURL,
        idToken: res.token,
        refreshToken: u.refreshToken,
        expiresAt: Date.parse(res.expirationTime) || Date.now() + 50 * 60 * 1000,
      });
    };
    (async () => {
      try {
        await push(cb.current.user);
        if (cancelled) return;
        await OutingNative.startInbox();
        off = onIdTokenChanged(cb.current.auth, (u) => { if (u) push(u).catch(() => {}); });
      } catch { /* messages still arrive while the app is open */ }
    })();
    return () => {
      cancelled = true;
      if (off) off();
      OutingNative.stopInbox().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  const unseen = useMemo(() => unseenFor(tree, uid, Date.now()), [tree, uid]);

  const markSeen = useCallback(async (ids: string[]) => {
    try {
      await Promise.all(ids.map((id) => set(ref(cb.current.db, `inbox/${uid}/${id}/seenAt`), serverTimestamp())));
    } catch { /* retried when the student taps again */ }
  }, [uid]);

  return { unseen, markSeen };
}

export const StudentMessageOverlay: React.FC<{ messages: InboxMessage[]; onSeen: (ids: string[]) => void }> = ({ messages, onSeen }) => {
  useAlarm(messages.length > 0);
  if (messages.length === 0) return null;
  return (
    <div role="alertdialog" aria-modal="true" aria-label="Message from your coordinator"
      className="anim-fade fixed inset-0 z-[80] overflow-y-auto bg-blue-900 text-white">
      <div className="max-w-xl mx-auto px-4 py-8">
        <div className="text-center mb-5">
          <div className="w-14 h-14 mx-auto rounded-full bg-white/15 flex items-center justify-center mb-3">
            <MessageSquare className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-black tracking-wide">MESSAGE FROM YOUR COORDINATOR</h1>
        </div>
        <div className="space-y-3 stagger">
          {messages.map((m) => (
            <div key={m.id} className="rounded-2xl bg-white text-slate-900 p-4 shadow-xl">
              <p className="text-xl font-extrabold leading-snug">{m.text}</p>
              <p className="text-xs text-slate-500 mt-2">{m.fromName} · {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
            </div>
          ))}
        </div>
        <button onClick={() => onSeen(messages.map((m) => m.id))}
          className="mt-5 w-full py-3.5 rounded-xl bg-white text-slate-900 text-base font-extrabold flex items-center justify-center gap-2">
          <Check className="w-5 h-5" /> Got it
        </button>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------ faculty side */

/** All inboxes. Only faculty may read this path. */
export function useInboxAll(db: Database): InboxTree | null {
  const [tree, setTree] = useState<InboxTree | null>(null);
  useEffect(() => onValue(ref(db, 'inbox'), (s) => setTree(s.val() || {}), () => setTree(null)), [db]);
  return tree;
}

export interface MessageTarget {
  uid: string;
  name: string;
  roll: string;
  /** Still away from the hostel. */
  out: boolean;
}

interface MessagesModalProps {
  students: MessageTarget[];
  names: Record<string, { name: string; rollNumber: string }>;
  tree: InboxTree | null;
  now: number;
  onClose: () => void;
  onSend: (uids: string[], text: string) => Promise<void>;
}

type Audience = 'OUT' | 'ALL' | 'PICK';

export const MessagesModal: React.FC<MessagesModalProps> = ({ students, names, tree, now, onClose, onSend }) => {
  const [audience, setAudience] = useState<Audience>(students.some((s) => s.out) ? 'OUT' : 'ALL');
  const [picked, setPicked] = useState<Record<string, true>>({});
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const targets = audience === 'OUT' ? students.filter((s) => s.out) : audience === 'ALL' ? students : students.filter((s) => picked[s.uid]);
  const batches = useMemo(() => buildBatches(tree, now), [tree, now]);
  const nameOf = (uid: string) => names[uid]?.name || 'Student';

  const send = async () => {
    const t = text.trim();
    if (!t) return setErr('Type a message or tap one of the quick messages.');
    if (targets.length === 0) return setErr('Choose at least one student.');
    setBusy(true);
    setErr(null);
    try {
      await onSend(targets.map((s) => s.uid), t);
      setText('');
    } catch {
      setErr('Could not send. Check your internet and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Messages" className="anim-fade fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
      <div className="anim-pop bg-white rounded-xl w-full max-w-lg shadow-xl max-h-[92vh] overflow-y-auto">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 sticky top-0">
          <h2 className="text-sm font-bold flex items-center gap-2"><MessageSquare className="w-4 h-4" /> Message students</h2>
          <button type="button" aria-label="Close" onClick={onClose}><X className="w-5 h-5 text-slate-500" /></button>
        </div>

        <div className="p-4 space-y-3">
          {err && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{err}</p>}

          <div>
            <span className="text-[11px] font-semibold text-slate-600 block mb-1">Send to</span>
            <div className="grid grid-cols-3 gap-1.5">
              {([['OUT', `Still out (${students.filter((s) => s.out).length})`], ['ALL', `Everyone (${students.length})`], ['PICK', 'Pick students']] as Array<[Audience, string]>).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setAudience(k)}
                  className={`py-1.5 rounded-lg border text-xs font-semibold ${audience === k ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'}`}>
                  {l}
                </button>
              ))}
            </div>
            {audience === 'PICK' && (
              <div className="mt-2 max-h-40 overflow-y-auto space-y-1 border border-slate-200 rounded-lg p-2">
                {students.length === 0 && <p className="text-xs text-slate-500">No active students.</p>}
                {students.map((s) => (
                  <label key={s.uid} className="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" checked={Boolean(picked[s.uid])}
                      onChange={() => setPicked((p) => { const n = { ...p }; if (n[s.uid]) delete n[s.uid]; else n[s.uid] = true; return n; })} />
                    <span className="font-semibold text-slate-900">{s.name}</span>
                    <span className="font-mono text-slate-500">{s.roll}</span>
                    {s.out && <span className="ml-auto text-[10px] text-amber-700">out</span>}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div>
            <span className="text-[11px] font-semibold text-slate-600 block mb-1">Message</span>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {QUICK_MESSAGES.map((q) => (
                <button key={q} type="button" onClick={() => setText(q)}
                  className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-300 text-[11px] font-semibold text-slate-800 text-left">
                  {q}
                </button>
              ))}
            </div>
            <textarea value={text} maxLength={MAX_MESSAGE_LENGTH} rows={3} onChange={(e) => setText(e.target.value)}
              placeholder="Type your message"
              className="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:outline-none focus:border-blue-700" />
            <p className="text-[11px] text-slate-500 text-right">{text.length}/{MAX_MESSAGE_LENGTH}</p>
          </div>

          <button type="button" onClick={send} disabled={busy || targets.length === 0}
            className="w-full py-2.5 rounded-lg bg-blue-900 hover:bg-blue-800 disabled:opacity-50 text-white text-sm font-bold flex items-center justify-center gap-2">
            <Send className="w-4 h-4" /> {busy ? 'Sending…' : `Send to ${targets.length} student${targets.length === 1 ? '' : 's'}`}
          </button>
        </div>

        <div className="p-4 border-t border-slate-200">
          <h3 className="text-xs font-bold text-slate-900 mb-2">Recent messages</h3>
          {batches.length === 0 && <p className="text-xs text-slate-500">Nothing sent in the last 24 hours.</p>}
          <div className="space-y-2">
            {batches.map((b) => {
              const seen = b.recipients.filter((r) => r.seenAt).length;
              const unseen = b.recipients.filter((r) => !r.seenAt);
              const overdue = unseen.length > 0 && now - b.createdAt >= UNSEEN_FLAG_MS;
              return (
                <div key={b.id} className={`rounded-lg border p-3 text-xs ${overdue ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'}`}>
                  <p className="font-semibold text-slate-900">{b.text}</p>
                  <p className="text-slate-500 mt-0.5 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {new Date(b.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    <span className={`ml-auto font-bold ${unseen.length === 0 ? 'text-emerald-700' : overdue ? 'text-red-700' : 'text-slate-600'}`}>
                      {unseen.length === 0 ? '✔ ' : ''}seen {seen}/{b.recipients.length}
                    </span>
                  </p>
                  {unseen.length > 0 && (
                    <p className={`mt-1 ${overdue ? 'text-red-800 font-semibold' : 'text-slate-600'}`}>
                      {overdue ? 'Not seen, call them: ' : 'Waiting: '}{unseen.map((r) => nameOf(r.uid)).join(', ')}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
