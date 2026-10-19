// Landing-page news helpers shared by the public feed and the admin editor. The image limits
// mirror server/news.js (the server check is the real boundary; these make the form say
// "too large" before the upload instead of after).

const API_BASE = process.env.REACT_APP_API_BASE_URL || '';

export const IMAGE_MAX_MB = 4;
export const IMAGE_MAX_BYTES = IMAGE_MAX_MB * 1024 * 1024;
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

// `image_v` is the image's version (its updated_at); it rides in the URL so the browser may
// cache the image forever and a re-upload still shows at once. null = no image.
export const imageUrl = (item) => (item.image_v ? `${API_BASE}/api/news/${item.id}/image?v=${item.image_v}` : null);

// Client-side pre-check of a chosen file; returns an error message or null.
export const checkImageFile = (file) => {
    if (!IMAGE_TYPES.includes(file.type)) return `Use a ${IMAGE_TYPES.map((t) => t.split('/')[1]).join(', ')} image.`;
    if (file.size > IMAGE_MAX_BYTES) return `Image is too large (${(file.size / 1024 / 1024).toFixed(1)} MB; max ${IMAGE_MAX_MB} MB).`;
    return null;
};

// Hostname of a link without "www." — what the viewer is told before leaving the site.
export const hostOf = (url) => {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
};

// The link's button text names the destination: "Read more" suggested an article on this
// site, while the link leaves it (a YouTube video, the press release PDF on another host).
export const linkLabel = (url) => {
    const host = hostOf(url);
    if (!host) return 'Open link ↗';
    if (/(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(host)) return 'Watch on YouTube ↗';
    if (/(^|\.)vimeo\.com$/.test(host)) return 'Watch on Vimeo ↗';
    return `Visit ${host} ↗`;
};
