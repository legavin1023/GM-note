#!/usr/bin/env node
'use strict';

// Polls the authenticated team-art board through Supabase's official API.
// RLS remains enabled; this script must use a dedicated, authorized Auth user.
const fs = require('node:fs/promises');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');

const TABLE = process.env.BOARD_TABLE || 'team_art_posts';
const POLL_MS = Math.max(5000, Number.parseInt(process.env.BOARD_POLL_INTERVAL_MS || '60000', 10) || 60000);
const STATE_PATH = path.resolve(process.env.BOARD_STATE_FILE || 'data/discord-board-watcher-state.json');
const SITE_URL = (process.env.SITE_URL || '').replace(/\/$/, '');
const BOARD_PATH = process.env.BOARD_PATH || '/GM-note/#/board/free';
const PAGE_SIZE = 500;
const MAX_RETRIES = 8;

async function loadLocalEnv() {
  try {
    const contents = await fs.readFile(path.resolve('.env'), 'utf8');
    for (const rawLine of contents.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!match || process.env[match[1]] !== undefined) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      } else {
        value = value.replace(/\s+#.*$/, '').trim();
      }
      process.env[match[1]] = value;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function log(level, message, details) {
  const suffix = details ? ` ${JSON.stringify(details)}` : '';
  console[level](`[${new Date().toISOString()}] ${message}${suffix}`);
}

function requireConfig() {
  const missing = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'BOARD_BOT_EMAIL', 'BOARD_BOT_PASSWORD', 'DISCORD_WEBHOOK_URL', 'SITE_URL']
    .filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

async function readState() {
  try {
    const parsed = JSON.parse(await fs.readFile(STATE_PATH, 'utf8'));
    return {
      initialized: parsed.initialized === true,
      baselineAt: parsed.baselineAt || null,
      processedIds: Array.isArray(parsed.processedIds) ? parsed.processedIds.map(String) : [],
    };
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error(`Cannot read state file: ${error.message}`);
    return { initialized: false, baselineAt: null, processedIds: [] };
  }
}

async function writeState(state) {
  await fs.mkdir(path.dirname(STATE_PATH), { recursive: true });
  const temporary = `${STATE_PATH}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temporary, STATE_PATH);
}

async function withRetry(label, operation, attempts = MAX_RETRIES) {
  let delay = 1000;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === attempts) throw error;
      const retryAfterMs = Number(error.retryAfterMs) || 0;
      const waitMs = Math.max(retryAfterMs, delay + Math.floor(Math.random() * 300));
      log('warn', `${label} failed; retry ${attempt}/${attempts - 1}`, { error: error.message, waitMs });
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      delay = Math.min(delay * 2, 60000);
    }
  }
}

function postTitle(content, imagePaths) {
  const firstLine = String(content || '').split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  if (firstLine) return firstLine.length > 240 ? `${firstLine.slice(0, 237)}…` : firstLine;
  return imagePaths?.length ? '이미지 작품 게시글' : '새 작품 게시글';
}

function postLink(postId) {
  const separator = BOARD_PATH.includes('?') ? '&' : '?';
  return `${SITE_URL}${BOARD_PATH}${separator}postId=${encodeURIComponent(postId)}`;
}

async function sendDiscord(post) {
  const createdAt = new Date(post.created_at);
  const imagePaths = Array.isArray(post.image_paths) ? post.image_paths : [];
  const body = {
    embeds: [{
      title: postTitle(post.content, imagePaths),
      url: postLink(post.id),
      author: { name: post.nickname || '알 수 없는 작성자' },
      timestamp: Number.isNaN(createdAt.getTime()) ? new Date().toISOString() : createdAt.toISOString(),
      description: String(post.content || '').trim().slice(0, 3500) || (imagePaths.length ? '이미지가 첨부된 작품입니다.' : '새 게시글이 등록되었습니다.'),
      color: 0x9f4a4a,
      footer: { text: '팀 작품 게시판' },
    }],
    allowed_mentions: { parse: [] },
  };

  const response = await fetch(process.env.DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (response.ok) return;

  const responseText = await response.text().catch(() => '');
  let retryAfterMs = 0;
  if (response.status === 429) {
    const headerDelay = Number(response.headers.get('retry-after'));
    let bodyDelay = 0;
    try { bodyDelay = Number(JSON.parse(responseText).retry_after); } catch (_) { /* empty/non-JSON body */ }
    retryAfterMs = Math.ceil(Math.max(headerDelay || 0, bodyDelay || 0) * 1000);
  }
  const error = new Error(`Discord returned HTTP ${response.status}${responseText ? `: ${responseText.slice(0, 240)}` : ''}`);
  error.retryAfterMs = retryAfterMs;
  throw error;
}

async function fetchPage(client, from, to, baselineAt) {
  return withRetry('Supabase query', async () => {
    let query = client.from(TABLE)
      .select('id,nickname,content,image_paths,created_at')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to);
    if (baselineAt) query = query.gt('created_at', baselineAt);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data || [];
  });
}

async function establishBaseline(client, state) {
  const data = await withRetry('Supabase baseline query', async () => {
    const result = await client.from(TABLE)
      .select('created_at')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (result.error) throw new Error(result.error.message);
    return result.data;
  });
  state.baselineAt = data?.created_at || new Date().toISOString();
  state.initialized = true;
  await writeState(state);
  log('info', 'First-run baseline recorded; existing posts will not be announced.', { baselineAt: state.baselineAt });
}

async function poll(client, state) {
  if (!state.initialized) {
    await establishBaseline(client, state);
    return;
  }

  const seen = new Set(state.processedIds);
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const posts = await fetchPage(client, offset, offset + PAGE_SIZE - 1, state.baselineAt);
    for (const post of posts) {
      const id = String(post.id);
      if (seen.has(id)) continue;
      await withRetry(`Discord delivery for post ${id}`, () => sendDiscord(post));
      seen.add(id);
      state.processedIds.push(id);
      await writeState(state);
      log('info', 'New post announced.', { postId: id, createdAt: post.created_at });
    }
    if (posts.length < PAGE_SIZE) break;
  }
}

async function main() {
  await loadLocalEnv();
  requireConfig();
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false },
  });
  const { error: authError } = await client.auth.signInWithPassword({
    email: process.env.BOARD_BOT_EMAIL,
    password: process.env.BOARD_BOT_PASSWORD,
  });
  if (authError) throw new Error(`Supabase bot sign-in failed: ${authError.message}`);

  const state = await readState();
  log('info', `Watcher started for ${TABLE}.`, { intervalMs: POLL_MS });
  let stopping = false;
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => { stopping = true; log('info', `Received ${signal}; stopping after current poll.`); });
  }
  while (!stopping) {
    try {
      await poll(client, state);
    } catch (error) {
      log('error', 'Polling cycle failed; successful post IDs remain saved.', { error: error.message });
    }
    if (!stopping) await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  await client.auth.signOut();
}

main().catch((error) => {
  log('error', 'Watcher could not start.', { error: error.message });
  process.exitCode = 1;
});
