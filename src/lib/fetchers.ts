/**
 * fetchers — the two ways MnemoHealth reaches a source.
 *
 *  - A source that answers with CORS (`*` or the origin echoed back: Orphanet,
 *    WHO, MeSH, NCBI E-utilities) is read with `fetch`, straight from the
 *    cartridge, under a deadline (rule 9).
 *  - A source WITHOUT CORS (NIMH, the PMC files on S3) goes through the host
 *    action `social.fetch` (permission `vault:read`): https only, 4 MB cap,
 *    12 s per try on the host side. Its answer is
 *    `{ status, body, encoding, truncated, contentType }`, and a non-2xx is
 *    thrown by the host as `HTTP_<status>`.
 *
 * 🚨 `truncated: true` means the body is a PREFIX of the file. Treating it as
 * the whole text would quote half an article as if it were complete, so it is
 * refused here, before any parser sees it. A base64 body is refused too: every
 * source read this way is text, and a parser handed base64 returns silence.
 */

/** Deadline of one direct request (rule 9). The Orphanet list is 1.3 MB, so it gets more. */
export const REQUEST_TIMEOUT_MS = 15_000;
export const LARGE_REQUEST_TIMEOUT_MS = 60_000;
/**
 * Deadline of one `social.fetch`: the host gives each try 12 s and retries
 * once after 2 s on a 429/503, so 30 s covers its worst honest case.
 */
export const HOST_FETCH_TIMEOUT_MS = 30_000;

export type FetchJson = (url: string, signal?: AbortSignal, timeoutMs?: number) => Promise<unknown>;
export type FetchText = (url: string, signal?: AbortSignal, timeoutMs?: number) => Promise<string>;

function withDeadline(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const deadline = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, deadline]) : deadline;
}

/** JSON from a CORS endpoint. A non-2xx is an error, never an empty list. */
export const fetchJson: FetchJson = async (url, signal, timeoutMs = REQUEST_TIMEOUT_MS) => {
  const res = await fetch(url, { signal: withDeadline(signal, timeoutMs) });
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  return res.json();
};

/** Text from a CORS endpoint, same deadline and same refusal of a non-2xx. */
export const fetchText: FetchText = async (url, signal, timeoutMs = REQUEST_TIMEOUT_MS) => {
  const res = await fetch(url, { signal: withDeadline(signal, timeoutMs) });
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  return res.text();
};

/** What `social.fetch` answers (host `socialHandlers.ts`, `hostFetch.ts`). */
export interface HostFetchData {
  status: number;
  body: string;
  encoding: 'utf8' | 'base64';
  truncated: boolean;
  contentType: string;
}

/** The bridge call, injected so the rule below is testable without a host. */
export type HostInvoke = (url: string) => Promise<unknown>;

/**
 * Text of an https URL read by the host. Refuses a truncated body, a non-text
 * body and an answer that is not the expected shape, each with its own code.
 */
export function hostTextReader(invoke: HostInvoke): (url: string, signal?: AbortSignal) => Promise<string> {
  return async (url, signal) => {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const data = await invoke(url) as Partial<HostFetchData> | null | undefined;
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (!data || typeof data.body !== 'string') throw new Error('HOST_FETCH_NO_BODY');
    if (data.truncated === true) throw new Error('HOST_FETCH_TRUNCATED');
    if (data.encoding !== 'utf8') throw new Error('HOST_FETCH_NOT_TEXT');
    return data.body;
  };
}

/** Waits, or rejects at once when the signal fires. Used for the pause between two requests. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
