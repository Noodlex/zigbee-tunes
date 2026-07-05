import type { ZigbeeTunesMqttClient } from '../mqtt/client.js';
import type { Logger } from '../logger.js';
import { retargetTopic } from '../mqtt/topics.js';

/**
 * When a device (or group) disappears, we have to publish an empty
 * retained payload on EVERY target discovery topic it owned so HA forgets
 * each entity cleanly (a device usually has several discovery topics).
 *
 * Z2M already does this naturally before removal (publishes "" retained on
 * its own discovery topics), but since we intercept and retransform, we
 * need to make sure the cleanup also lands on the target topics.
 *
 * Returns the cleared target topics so the caller can drop them from its
 * anti-loop cache.
 */
export function cleanupRemovedDevice(
  sourceTopics: string[],
  sourcePrefix: string,
  targetPrefix: string,
  mqtt: ZigbeeTunesMqttClient,
  logger: Logger,
): string[] {
  const cleared: string[] = [];
  for (const sourceTopic of sourceTopics) {
    if (!sourceTopic || sourceTopic.length === 0) continue;
    const targetTopic = retargetTopic(sourceTopic, sourcePrefix, targetPrefix);
    mqtt.publish(targetTopic, '', { retain: true, qos: 1 });
    cleared.push(targetTopic);
    logger.info('cleanup retained published', { topic: targetTopic });
  }
  return cleared;
}
