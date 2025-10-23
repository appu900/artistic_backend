export function getSessionId(url: string) {
  try {
    const urlObject = new URL(url);
    const params = new URLSearchParams(urlObject.search);
    return (
      params.get('session_id') ||
      params.get('payment_id') ||
      params.get('sessionId') ||
      params.get('paymentId')
    );
  } catch (error) {
    console.error('Invalid URL:', error);
    return null; 
  }
}
