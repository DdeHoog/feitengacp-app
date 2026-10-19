import React, { useState } from 'react';
import { CATEGORIES, DOWNLOADS } from '../downloads';

// Folded, a category shows exactly one grid row (2 / 3 / 4 columns), so the cut follows
// the breakpoints in CSS rather than a resize listener. The class strings stay literal
// for Tailwind's scanner.
const GRID = 'grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4';
const foldedDisplay = index => ['flex', 'flex', 'hidden sm:flex', 'hidden xl:flex'][index] ?? 'hidden';
// "Show all" only where the fold actually hides something at that width.
const toggleDisplay = count => ({ 3: 'sm:hidden', 4: 'xl:hidden' })[count] ?? '';

function DownloadCard({ item, display }) {
    return (
        <a
            href={item.file}
            download={`${item.title.replace(/\s/g, '-')}.pdf`}
            className={`group ${display} flex-col rounded-lg border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow overflow-hidden`}
            aria-label={`Download ${item.title} (PDF, ${item.sizeMb.toFixed(1)} MB)`}
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
            <div className="flex flex-col flex-grow gap-1 px-3 py-2">
                <h3 className="text-sm font-semibold text-gray-800 line-clamp-2">{item.title}</h3>
                <div className="mt-auto flex items-center justify-between gap-2 text-xs">
                    <span className="text-gray-500">PDF · {item.sizeMb.toFixed(1)} MB</span>
                    <span className="font-semibold text-[#004EA2] group-hover:underline">Download</span>
                </div>
            </div>
        </a>
    );
}

function CategorySection({ category, items }) {
    const [expanded, setExpanded] = useState(false);
    const foldable = items.length > 2;
    const folded = foldable && !expanded;

    return (
        <section id={category.id} className="scroll-mt-2 mb-8">
            <div className="mb-3">
                <h2 className="text-lg font-bold text-[#004EA2]">
                    {category.title} <span className="font-normal text-gray-500">({items.length})</span>
                </h2>
                <p className="text-sm text-gray-600">{category.description}</p>
            </div>
            <div className={GRID}>
                {items.map((item, i) => (
                    <DownloadCard key={item.file} item={item} display={folded ? foldedDisplay(i) : 'flex'} />
                ))}
            </div>
            {foldable && (
                <button
                    type="button"
                    onClick={() => setExpanded(e => !e)}
                    aria-expanded={expanded}
                    className={`mt-3 text-sm font-semibold text-[#004EA2] hover:underline ${toggleDisplay(items.length)}`}
                >
                    {expanded ? 'Show fewer ▴' : `Show all ${items.length} ▾`}
                </button>
            )}
        </section>
    );
}

function DownloadPage() {
    const sections = CATEGORIES
        .map(category => ({ category, items: DOWNLOADS.filter(d => d.category === category.id) }))
        .filter(s => s.items.length > 0);

    const jumpTo = id => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    return (
        <div className="p-4 lg:mr-300width xl:mr-company-name-bar-width">
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
                <CategorySection key={category.id} category={category} items={items} />
            ))}
        </div>
    );
}

export default DownloadPage;
