export function responseLooksLikeAsset(response) {
  if (!response?.ok) return false;
  const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
  return !contentType.includes('text/html') && !contentType.includes('application/xhtml+xml');
}
