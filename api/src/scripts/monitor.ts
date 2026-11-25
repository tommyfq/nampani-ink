/**
 * Uptime monitor: checks the website, the POS, the API + database + Redis, HTTPS certificates
 * and free disk space, and emails MONITOR_ALERT_TO when something breaks and when it recovers.
 * Runs as its own container (see compose.prod.yml).
 *
 *   node dist/scripts/monitor.js           run forever
 *   node dist/scripts/monitor.js --once    one round, print the results (no email)
 *   node dist/scripts/monitor.js --test    send a test alert email and exit
 *
 * Environment:
 *   MONITOR_ALERT_TO       who gets alerts (comma-separated)
 *   MONITOR_SITE_URL       default https://nampani.ink/
 *   MONITOR_POS_URL        default https://pos.nampani.ink
 *   MONITOR_INTERVAL_SEC   default 60
 *   MONITOR_FAILS          failed checks in a row before an alert, default 2
 *   MONITOR_REMIND_HOURS   repeat the alert while still down, default 6
 *   MONITOR_DISK_PCT       alert when the disk is fuller than this, default 90
 *   MONITOR_CERT_DAYS      alert when an HTTPS certificate expires sooner, default 14
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM   same as the API
 * Note: this runs on the same server, so it cannot report the whole server going down.
 */
import '../load-env';
import { statfsSync } from 'fs';
import nodemailer from 'nodemailer';
import { connect } from 'tls';

const env = (k: string, d: string) => process.env[k] || d;
const SITE = env('MONITOR_SITE_URL', 'https://nampani.ink/');
const POS = env('MONITOR_POS_URL', 'https://pos.nampani.ink').replace(/\/$/, '');
const INTERVAL = Number(env('MONITOR_INTERVAL_SEC', '60')) * 1000;
const FAILS = Number(env('MONITOR_FAILS', '2'));
const REMIND = Number(env('MONITOR_REMIND_HOURS', '6')) * 3600_000;
const DISK_PCT = Number(env('MONITOR_DISK_PCT', '90'));
const CERT_DAYS = Number(env('MONITOR_CERT_DAYS', '14'));
const TO = process.env.MONITOR_ALERT_TO ?? '';

interface Check {
  name: string;
  /** Slow checks (certificates) run once an hour. */
  every?: number;
  run: () => Promise<string>; // resolves with a short "ok" detail, rejects with the problem
}

async function http(url: string, expect: (body: string) => boolean = () => true) {
  const started = Date.now();
  const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10_000), headers: { 'User-Agent': 'NampaniInk-Monitor/1' } });
  const body = await res.text();
  const ms = Date.now() - started;
  if (res.status !== 200) throw new Error(`HTTP ${res.status}${body ? `: ${body.slice(0, 160).replace(/\s+/g, ' ')}` : ''}`);
  if (!expect(body)) throw new Error('page loaded but looks wrong');
  return `HTTP 200 in ${ms} ms`;
}

function certDaysLeft(host: string) {
  return new Promise<number>((resolve, reject) => {
    const s = connect({ host, port: 443, servername: host, timeout: 10_000 }, () => {
      const cert = s.getPeerCertificate();
      s.end();
      if (!s.authorized) return reject(new Error(`certificate not valid: ${s.authorizationError}`));
      resolve(Math.floor((+new Date(cert.valid_to) - Date.now()) / 864e5));
    });
    s.on('timeout', () => s.destroy(new Error('timeout')));
    s.on('error', reject);
  });
}

/** A readable reason, e.g. "connection refused" instead of "fetch failed". */
function reason(err: unknown): string {
  const e = err as { message?: string; code?: string; cause?: unknown; errors?: unknown[]; name?: string };
  if (e?.name === 'TimeoutError') return 'no answer within 10 seconds';
  const code = e?.code ?? (e?.cause as { code?: string })?.code ?? (e?.errors?.[0] as { code?: string })?.code;
  const known: Record<string, string> = {
    ECONNREFUSED: 'connection refused (service not running?)',
    ENOTFOUND: 'domain not found (DNS problem?)',
    ETIMEDOUT: 'connection timed out',
    ECONNRESET: 'connection reset',
    EAI_AGAIN: 'DNS lookup failed',
  };
  if (code && known[code]) return known[code];
  if (e?.cause) return reason(e.cause);
  return e?.message || code || String(err);
}

const hostOf = (u: string) => new URL(u).hostname;

const CHECKS: Check[] = [
  { name: 'Website', run: () => http(SITE, (b) => /<html/i.test(b)) },
  { name: 'POS / Admin', run: () => http(`${POS}/login`, (b) => /<html/i.test(b)) },
  { name: 'API, database and Redis', run: () => http(`${POS}/api/health/full`, (b) => b.includes('"status":"ok"')) },
  ...[hostOf(SITE), hostOf(POS)].map<Check>((host) => ({
    name: `HTTPS certificate ${host}`,
    every: 3600_000,
    run: async () => {
      const days = await certDaysLeft(host);
      if (days < CERT_DAYS) throw new Error(`expires in ${days} days (Caddy should renew it automatically)`);
      return `valid for ${days} more days`;
    },
  })),
  {
    name: 'Disk space',
    every: 10 * 60_000,
    run: async () => {
      const s = statfsSync('/');
      const used = Math.round((1 - s.bavail / s.blocks) * 100);
      const freeGb = ((s.bavail * s.bsize) / 1e9).toFixed(1);
      if (used > DISK_PCT) throw new Error(`${used}% full, ${freeGb} GB free`);
      return `${used}% used, ${freeGb} GB free`;
    },
  },
];

interface State {
  fails: number;
  down: boolean;
  since?: Date;
  lastAlert?: number;
  error?: string;
  lastRun?: number;
}
const state = new Map<string, State>(CHECKS.map((c) => [c.name, { fails: 0, down: false }]));

const transport = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 465),
      secure: Number(process.env.SMTP_PORT || 465) === 465,
      auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
    })
  : null;
const FROM = env('MAIL_FROM', 'Nampani Ink <booking@nampani.ink>').replace(/^[^<]*</, 'Nampani Ink Monitor <');

const wita = (d: Date) =>
  `${d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Makassar' })} WITA`;
const lasted = (from: Date) => {
  const m = Math.round((Date.now() - +from) / 60000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};

/** Emails that could not be sent wait here and go out on the next round. */
const queue: { subject: string; text: string }[] = [];

async function send(subject: string, text: string) {
  if (!transport || !TO) {
    console.log(`[monitor] (no SMTP or MONITOR_ALERT_TO) ${subject}\n${text}`);
    return;
  }
  queue.push({ subject, text });
  await flush();
}

async function flush() {
  if (!transport || !TO) return;
  while (queue.length) {
    const m = queue[0];
    try {
      await transport.sendMail({ from: FROM, to: TO, subject: m.subject, text: m.text });
      console.log(`[monitor] emailed: ${m.subject}`);
      queue.shift();
    } catch (err) {
      console.error(`[monitor] could not send email (will retry): ${(err as Error).message}`);
      if (queue.length > 20) queue.splice(0, queue.length - 20);
      return;
    }
  }
}

function overview() {
  return CHECKS.map((c) => {
    const s = state.get(c.name)!;
    return `${s.down ? '✗' : '✓'} ${c.name}${s.down ? ` — ${s.error}` : ''}`;
  }).join('\n');
}

async function round(print = false) {
  const now = Date.now();
  const due = CHECKS.filter((c) => !c.every || !state.get(c.name)!.lastRun || now - state.get(c.name)!.lastRun! >= c.every);
  const results = await Promise.all(
    due.map(async (c) => {
      try {
        return { c, ok: true, detail: await c.run() };
      } catch (err) {
        return { c, ok: false, detail: reason(err) };
      }
    }),
  );

  const wentDown: string[] = [];
  const cameBack: string[] = [];
  const stillDown: string[] = [];
  for (const { c, ok, detail } of results) {
    const s = state.get(c.name)!;
    s.lastRun = now;
    if (print) console.log(`${ok ? 'OK  ' : 'FAIL'} ${c.name}: ${detail}`);
    if (ok) {
      if (s.down) cameBack.push(`${c.name} (was down for ${lasted(s.since!)})`);
      Object.assign(s, { fails: 0, down: false, since: undefined, error: undefined, lastAlert: undefined });
      continue;
    }
    s.fails += 1;
    s.error = detail;
    // Slow checks (certificate, disk) alert at once; page checks wait for FAILS in a row.
    if (!s.down && (s.fails >= FAILS || c.every)) {
      s.down = true;
      s.since = new Date(now);
      s.lastAlert = now;
      wentDown.push(`${c.name}: ${detail}`);
    } else if (s.down && now - (s.lastAlert ?? 0) >= REMIND) {
      s.lastAlert = now;
      stillDown.push(`${c.name}: ${detail} (since ${wita(s.since!)}, ${lasted(s.since!)})`);
    }
  }
  if (print) return;

  const footer = `\n\nAll checks now:\n${overview()}\n\nChecked from the server at ${wita(new Date())}.\nSite: ${SITE}\nPOS:  ${POS}`;
  if (wentDown.length) {
    await send(`🔴 Nampani Ink: ${wentDown.length === 1 ? wentDown[0].split(':')[0] : `${wentDown.length} problems`}`, `Something is not working:\n\n${wentDown.map((l) => `• ${l}`).join('\n')}${footer}`);
  }
  if (stillDown.length) {
    await send(`🟠 Still down: Nampani Ink`, `Still not working:\n\n${stillDown.map((l) => `• ${l}`).join('\n')}${footer}`);
  }
  if (cameBack.length) {
    await send(`🟢 Nampani Ink: back to normal`, `Working again:\n\n${cameBack.map((l) => `• ${l}`).join('\n')}${footer}`);
  }
  await flush(); // anything that could not be sent earlier
}

async function main() {
  if (process.argv.includes('--once')) {
    await round(true);
    return;
  }
  if (process.argv.includes('--test')) {
    await round(true);
    await send('✅ Nampani Ink monitor: test alert', `This is a test. Alerts like this go to ${TO} when the website, POS, API, database, HTTPS certificates or disk space have a problem, and again when they are back to normal.\n\nCurrent status:\n${overview()}\n\nChecked from the server at ${wita(new Date())}.`);
    return;
  }
  console.log(`[monitor] started: every ${INTERVAL / 1000}s, alerts to ${TO || '(nobody: MONITOR_ALERT_TO is empty)'}`);
  for (;;) {
    await round().catch((err) => console.error(`[monitor] round failed: ${(err as Error).message}`));
    await new Promise((r) => setTimeout(r, INTERVAL));
  }
}

main().then(
  () => process.argv.some((a) => a === '--once' || a === '--test') && process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
