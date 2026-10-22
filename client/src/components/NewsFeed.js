import React, { useEffect, useRef } from 'react';
import { fmtDay } from '../dates';
import { imageUrl, linkLabel } from '../news';

// "Seen" = on screen for SEEN_MS: half the card in view, or a solid 200 px of a tall one (a
// long card can never be half visible in a short panel). Opening the panel and closing it
// straight away therefore doesn't count. Reported once per card per mount.
const SEEN_MS = 2000;
const SEEN_PX = 200;

function useSeen(ref, onSeen) {
    // Latest callback in a ref: a parent re-render hands us a new function, which must not
    // restart the observer and its 2 s timer.
    const cb = useRef(onSeen);
    cb.current = onSeen;
    const enabled = !!onSeen;
    useEffect(() => {
        const el = ref.current;
        if (!enabled || !el || typeof IntersectionObserver === 'undefined') return undefined;
        let timer = null;
        const observer = new IntersectionObserver(([entry]) => {
            const inView = entry.isIntersecting
                && (entry.intersectionRatio >= 0.5 || entry.intersectionRect.height >= SEEN_PX);
            if (inView && !timer) {
                timer = setTimeout(() => { observer.disconnect(); cb.current?.(); }, SEEN_MS);
            } else if (!inView && timer) {
                clearTimeout(timer);
                timer = null;
            }
        }, { threshold: [0, 0.25, 0.5, 0.75, 1] });
        observer.observe(el);
        return () => { observer.disconnect(); clearTimeout(timer); };
    }, [ref, enabled]);
}

// One news item: banner/photo on top (shown whole at most its own size, never cropped), then
// title, date, text with line breaks kept, and an optional link that names where it goes. Body text is
// plain text from the admin page, never HTML.
// Every card is the full width of its column (Damian, 2026-10-20: same width as the news bar
// and the HQ tiles, so everything lines up); an image narrower than that sits centred.
// onSeen / onLinkClick are optional (reach tracking, see HomePage).
function NewsCard({ item, onSeen, onLinkClick }) {
    const src = imageUrl(item);
    const ref = useRef(null);
    useSeen(ref, onSeen);
    return (
        <article ref={ref} className="w-full bg-white rounded-lg shadow-md overflow-hidden">
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
                    <a href={item.link_url} target="_blank" rel="noopener noreferrer" title={item.link_url} onClick={onLinkClick} className="inline-block mt-3 text-[#004EA2] font-semibold hover:underline">
                        {linkLabel(item.link_url)}
                    </a>
                )}
            </div>
        </article>
    );
}

// The list of news cards. The caller bounds its height; the list scrolls inside.
// onSeen(id) / onLinkClick(id): optional reach callbacks.
function NewsFeed({ items, className = '', onSeen, onLinkClick }) {
    if (!items || items.length === 0) return null;
    return (
        <section aria-label="News" className={className}>
            <div className="flex flex-col gap-4">
                {items.map((n) => (
                    <NewsCard
                        key={n.id}
                        item={n}
                        onSeen={onSeen && (() => onSeen(n.id))}
                        onLinkClick={onLinkClick && (() => onLinkClick(n.id))}
                    />
                ))}
            </div>
        </section>
    );
}

export default NewsFeed;
