// HQ is the owner of names and status. The feed is newest first.
export function newestConversations(tasks) {
  const conversations = new Map();
  for (const task of tasks || []) if (task?.conversationId && !conversations.has(task.conversationId)) conversations.set(task.conversationId, task);
  return conversations;
}
export function conversationLink(hq, appId, conversationId) {
  if (![appId, conversationId].every(id => typeof id === 'string' && /^[a-z0-9-]{1,80}$/i.test(id))) return null;
  try {
    const base = new URL(hq);
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) return null;
    return `${base.origin}/#/app/${encodeURIComponent(appId)}/canvas/build/${encodeURIComponent(conversationId)}`;
  } catch { return null; }
}
export function conversationModel(model) {
  const value = String(model || '');
  if (/codex|^gpt-/i.test(value)) return 'Codex';
  if (/ollama/i.test(value)) return 'Ollama';
  if (/claude|opus|sonnet|haiku/i.test(value) || !value) return 'Claude Code';
  return value;
}
