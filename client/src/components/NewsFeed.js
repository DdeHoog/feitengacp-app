import React from 'react';
import { fmtDay } from '../dates';
import { imageUrl, linkLabel } from '../news';

// One news item: banner/photo on top (shown whole, never cropped — banners are wide), then
// title, date, text with line breaks kept, and an optional link that names where it goes. Body text is
// plain text from the admin page, never HTML.
function NewsCard({ item }) {
    const src = imageUrl(item);
    return (
        <article className="bg-white rounded-lg shadow-md overflow-hidden">
            {src && <img src={src} alt="" className="w-full h-auto block" />}
            <div className="p-4 lg:p-5">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
                    <h2 className="text-lg lg:text-xl font-semibold text-gray-800">{item.title}</h2>
                    <time dateTime={item.published_at} className="text-sm text-gray-500">{fmtDay(item.published_at)}</time>
                </div>
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

// The landing page's news column. The caller bounds its height; the list scrolls inside.
function NewsFeed({ items, className = '' }) {
    if (!items || items.length === 0) return null;
    return (
        <section aria-label="News" className={className}>
            <div className="space-y-4 pr-2">
                {items.map((n) => <NewsCard key={n.id} item={n} />)}
            </div>
        </section>
    );
}

export default NewsFeed;
