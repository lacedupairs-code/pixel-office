// Project HQ's shared read model. This view never creates or approves work.
export function blockedWorkers(items, hq) {
  if (!Array.isArray(items)) return [];
  return items.filter(i => i && ['plan', 'crew', 'failed'].includes(i.kind) && i.conversationId)
    .map(i => ({
      key: i.kind === 'crew' ? i.id : `task:${i.conversationId}`,
      appName: i.appName,
      status: i.kind === 'failed' ? 'error' : 'waiting',
      doing: `${i.kind === 'failed' ? 'Build failed' : i.kind === 'crew' ? 'Approve crew' : 'Review plan'}: ${i.title || i.appName}`,
      link: hq && /^#\/app\/[^/]+\/build\/[^/]+$/.test(i.href || '') ? `${hq.replace(/\/$/, '')}/${i.href}` : null,
    }));
}
