// Helpers to parse/build MQTT Discovery topics.
//
// Z2M / HA format:
//   <prefix>/<component>/<id>/<object_id>/config
// Example:
//   homeassistant/light/0x18fc260000b3e0e2/light/config

export interface ParsedDiscoveryTopic {
  prefix: string;
  component: string;
  id: string; // typically the IEEE address or an encoded group id
  object_id: string;
}

export function parseDiscoveryTopic(topic: string): ParsedDiscoveryTopic | null {
  const parts = topic.split('/');
  if (parts.length !== 5 || parts[4] !== 'config') return null;
  // Cast after the length check: TS knows indices 0..4 exist
  return {
    prefix: parts[0]!,
    component: parts[1]!,
    id: parts[2]!,
    object_id: parts[3]!,
  };
}

export function buildDiscoveryTopic(p: ParsedDiscoveryTopic): string {
  return `${p.prefix}/${p.component}/${p.id}/${p.object_id}/config`;
}

export function retargetTopic(topic: string, fromPrefix: string, toPrefix: string): string {
  const parsed = parseDiscoveryTopic(topic);
  if (!parsed || parsed.prefix !== fromPrefix) return topic;
  return buildDiscoveryTopic({ ...parsed, prefix: toPrefix });
}
