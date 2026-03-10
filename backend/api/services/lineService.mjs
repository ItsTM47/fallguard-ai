import { relayConfig } from '../config/env.mjs';

export const sendLinePush = async (messages) => {
  return fetch(relayConfig.linePushUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${relayConfig.channelAccessToken}`
    },
    body: JSON.stringify({
      to: relayConfig.targetUserId,
      messages
    })
  });
};
