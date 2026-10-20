import React, { useState } from 'react';
import { CATEGORIES, DOWNLOADS } from '../downloads';

// Fixed card size (Ad, 2026-10-19: "max. 9 cm high / 5 cm wide"): ~160 px wide ≈ 4.2 cm,
// ~290 px high with the text ≈ 7.7 cm. auto-fill fits as many as the width allows.
const GRID = 'grid grid-cols-[repeat(auto-fill,minmax(130px,160px))] gap-4';

const formatSize = mb => (mb < 1 ? `${Math.round(mb * 1000)} KB` : `${mb.toFixed(1)} MB`);

function DownloadCard({ item }) {
    const size = formatSize(item.sizeMb);
    const label = item.variant ? `${item.title} — ${item.variant}` : item.title;
    return (
        <a
            href={item.file}
            download={`${label.replace(/[^\w-]+/g, '-')}.pdf`}
            className="group flex flex-col rounded-lg border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow overflow-hidden"
            aria-label={`Download ${label} (PDF, ${size})`}
        >
            {/* Fixed A4-ish box so the odd square cover (Whiteboard) doesn't break the row */}
            <div className="aspect-[5/7] bg-gray-50 overflow-hidden">
                <img
                    src={item.thumb}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-105"
                />
            </div>
            <div className="flex flex-col flex-grow gap-0.5 px-2 py-1.5">
                <h3 className="text-xs font-semibold text-gray-800 line-clamp-2">{item.title}</h3>
                {item.variant && <p className="text-xs font-semibold text-[#004EA2]">{item.variant}</p>}
                <div className="mt-auto flex items-center justify-between gap-1 text-[11px]">
                    <span className="text-gray-500">PDF · {size}</span>
                    <span className="font-semibold text-[#004EA2] group-hover:underline">Download</span>
                </div>
            </div>
        </a>
    );
}

function CategorySection({ category, items, open, onToggle }) {
    const bodyId = `${category.id}-files`;
    return (
        <section id={category.id} className="scroll-mt-2 mb-6">
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={open}
                aria-controls={bodyId}
                className="group flex items-baseline gap-2 text-left"
            >
                <span
                    className={`inline-block text-sm text-[#004EA2] transition-transform ${open ? 'rotate-90' : ''}`}
                    aria-hidden="true"
                >
                    ▶
                </span>
                <h2 className="text-lg font-bold text-[#004EA2] group-hover:underline">
                    {category.title} <span className="font-normal text-gray-500">({items.length})</span>
                </h2>
            </button>
            <p className="text-sm text-gray-600 ml-6 mb-3">{category.description}</p>
            {open && (
                <div id={bodyId} className={`${GRID} ml-6`}>
                    {items.map(item => <DownloadCard key={item.file} item={item} />)}
                </div>
            )}
        </section>
    );
}

function DownloadPage() {
    const sections = CATEGORIES
        .map(category => ({ category, items: DOWNLOADS.filter(d => d.category === category.id) }))
        .filter(s => s.items.length > 0);

    // All categories start open; closing one is a per-visit convenience, not remembered.
    const [closed, setClosed] = useState(() => new Set());
    const setOpen = (id, open) => setClosed(prev => {
        const next = new Set(prev);
        if (open) next.delete(id); else next.add(id);
        return next;
    });

    const jumpTo = id => {
        setOpen(id, true);
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    return (
        <div className="p-4 lg:mr-brand-bar-lg xl:mr-brand-bar-xl">
            <h1 className="text-2xl font-bold text-[#004EA2] mb-3">Downloads</h1>

            {sections.length > 1 && (
                <nav aria-label="Categories" className="flex flex-wrap gap-2 mb-6">
                    {sections.map(({ category, items }) => (
                        <button
                            key={category.id}
                            type="button"
                            onClick={() => jumpTo(category.id)}
                            className="rounded-full border border-[#004EA2] px-3 py-1 text-sm text-[#004EA2] hover:bg-[#004EA2] hover:text-white transition-colors"
                        >
                            {category.title} ({items.length})
                        </button>
                    ))}
                </nav>
            )}

            {sections.map(({ category, items }) => (
                <CategorySection
                    key={category.id}
                    category={category}
                    items={items}
                    open={!closed.has(category.id)}
                    onToggle={() => setOpen(category.id, closed.has(category.id))}
                />
            ))}
        </div>
    );
}

export default DownloadPage;
