
export function getSessionId(url) {
  try {
    const urlObject = new URL(url);
    const params = new URLSearchParams(urlObject.search);
    return params.get('session_id');
  } catch (error) {
    console.error('Invalid URL:', error);
    return null; // Return null or handle the error as needed
  }
}
