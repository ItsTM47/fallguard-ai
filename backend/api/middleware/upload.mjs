export const extractWebhookPayload = (body) => {
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const imageDataUrl = typeof body.image === 'string' && body.image.startsWith('data:image/')
    ? body.image
    : '';
  const metadata = body && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
    ? body.metadata
    : {};

  return { message, imageDataUrl, metadata };
};
