export function convertGoogleDriveUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;

  // Check if it's already a direct Google Drive URL
  if (url.includes('drive.google.com/uc?')) {
    return url;
  }

  // Extract file ID from various Google Drive URL formats
  // Format 1: https://drive.google.com/file/d/FILE_ID/view
  // Format 2: https://drive.google.com/open?id=FILE_ID
  let fileId: string | null = null;

  const fileIdMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (fileIdMatch && fileIdMatch[1]) {
    fileId = fileIdMatch[1];
  } else {
    const openIdMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (openIdMatch && openIdMatch[1]) {
      fileId = openIdMatch[1];
    }
  }

  if (fileId) {
    return `https://lh3.googleusercontent.com/d/${fileId}=w400`;
  }

  return url;
}
