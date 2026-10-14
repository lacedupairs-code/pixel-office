// Project HQ's shared read model. This view never creates or approves work.
import { conversationLink } from './conversations.mjs';
export function blockedWorkers(items, hq) {
  if (!Array.isArray(items)) return [];
  return items.filter(i => i && ['plan', 'crew', 'failed'].includes(i.kind) && i.conversationId)
    .map(i => ({
      key: i.kind === 'crew' ? i.id : `task:${i.conversationId}`,
      appName: i.appName,
      name: i.agentName || null,
      status: i.kind === 'failed' ? 'error' : 'waiting',
      doing: `${i.kind === 'failed' ? 'Build failed' : i.kind === 'crew' ? 'Approve crew' : 'Review plan'}: ${i.title || i.appName}`,
      link: conversationLink(hq, i.appId || /^#\/app\/([^/]+)\/build\/[^/]+$/.exec(i.href || '')?.[1], i.conversationId),
    }));
}
