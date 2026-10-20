import React from 'react';
import { fmtDay } from '../dates';
import { imageUrl, linkLabel } from '../news';

// One news item: banner/photo on top (shown whole at most its own size, never cropped), then
// title, date, text with line breaks kept, and an optional link that names where it goes. Body text is
// plain text from the admin page, never HTML.
// Every card is the full width of its column (Damian, 2026-10-20: same width as the news bar
// and the HQ tiles, so everything lines up); an image narrower than that sits centred.
function NewsCard({ item }) {
    const src = imageUrl(item);
    return (
        <article className="w-full bg-white rounded-lg shadow-md overflow-hidden">
            {/* Never upscaled (a 300×250 banner was stretched to the column width), height capped
                so a large photo can't push the text out of view; aspect ratio always kept. */}
            {src && (
                <div className="flex justify-center bg-gray-50">
                    <img src={src} alt="" className="block max-w-full max-h-64 w-auto h-auto" />
                </div>
            )}
            <div className="p-4">
                <h2 className="text-lg font-semibold text-gray-800">{item.title}</h2>
                <time dateTime={item.published_at} className="block text-sm text-gray-500 mb-2">{fmtDay(item.published_at)}</time>
                {item.body && <p className="text-gray-700 whitespace-pre-line">{item.body}</p>}
                {item.link_url && (
                    <a href={item.link_url} target="_blank" rel="noopener noreferrer" title={item.link_url} className="inline-block mt-3 text-[#004EA2] font-semibold hover:underline">
                        {linkLabel(item.link_url)}
                    </a>
                )}
            </div>
        </article>
    );
}

// The list of news cards. The caller bounds its height; the list scrolls inside.
function NewsFeed({ items, className = '' }) {
    if (!items || items.length === 0) return null;
    return (
        <section aria-label="News" className={className}>
            <div className="flex flex-col gap-4">
                {items.map((n) => <NewsCard key={n.id} item={n} />)}
            </div>
        </section>
    );
}

export default NewsFeed;
