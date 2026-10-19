// Landing-page news (Ad, 2026-10-07): banner + press releases, written on the admin page,
// read by everyone on the login page. Limits and validation live here so server.js stays
// thin; client/src/news.js mirrors the image limits for the upload form's pre-check.

const { todayISO } = require('./dates');

const TITLE_MAX = 200;
const BODY_MAX = 5000;
const LINK_MAX = 500;

// Images are stored as BLOBs in SQLite (so the nightly backup covers them) — hence a hard
// cap per image. Banners/press photos exported for the web fit comfortably; a 12 MP phone
// original does not, which is the point: it would weigh the DB and every backup down.
const IMAGE_MAX_MB = 4;
const IMAGE_MAX_BYTES = IMAGE_MAX_MB * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const str = (v) => (typeof v === 'string' ? v.trim() : '');

// Validate an admin's create/update payload. Returns { value } (normalised row fields) or
// { error } (message for a 400). Body is plain text — rendered with line breaks kept, never
// as HTML, so there is nothing to sanitise.
function validateNews(input) {
    const b = input || {};
    const title = str(b.title);
    if (!title) return { error: 'Title is required.' };
    if (title.length > TITLE_MAX) return { error: `Title is too long (max ${TITLE_MAX} characters).` };

    const body = str(b.body);
    if (body.length > BODY_MAX) return { error: `Text is too long (max ${BODY_MAX} characters).` };

    const link_url = str(b.link_url) || null;
    if (link_url && (link_url.length > LINK_MAX || !/^https?:\/\/\S+$/i.test(link_url))) {
        return { error: 'Link must be a full http(s):// address.' };
    }

    const published_at = str(b.published_at) || todayISO();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(published_at) || Number.isNaN(Date.parse(published_at))) {
        return { error: 'Date must be a valid date.' };
    }

    return {
        value: {
            title,
            body,
            link_url,
            published_at,
            visible: b.visible ? 1 : 0,
            pinned: b.pinned ? 1 : 0,
        },
    };
}

module.exports = { validateNews, IMAGE_MAX_MB, IMAGE_MAX_BYTES, IMAGE_TYPES, TITLE_MAX, BODY_MAX, LINK_MAX };
