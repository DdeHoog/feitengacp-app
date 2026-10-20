import React from 'react';

// The six product categories of the HQ site (feitengacp.com), styled after its product menu
// (#leftmenu.proMenu: 3 columns, hairline #dedede grid, icon above the label). Ad (2026-10-19)
// asked for them on the landing page, turning blue on hover. Our own line icons instead of
// HQ's icon font; links open HQ in a new tab so the portal session stays put.
const HQ = 'https://feitengacp.com';

const icon = (paths) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10" aria-hidden="true">
        {paths}
    </svg>
);

const TILES = [
    {
        label: 'Bathroom Waterproof / Fireproof Panel',
        href: `${HQ}/?about_103.html`,
        icon: icon(<>
            <path d="M3 12h18v1.5a5.5 5.5 0 0 1-5.5 5.5h-7A5.5 5.5 0 0 1 3 13.5z" />
            <path d="M7 19l-1 2M17 19l1 2" />
            <path d="M6 12V6.5a2.5 2.5 0 0 1 4.6-1.4" />
            <path d="M9.5 6.5l3-1.5M11 8.5v.01M13 8v.01M12.5 10v.01" />
        </>),
    },
    {
        label: 'Kitchen Splashback',
        href: `${HQ}/?about_104.html`,
        icon: icon(<>
            <rect x="3" y="11" width="18" height="9" rx="1" />
            <path d="M12 11v9M15 15.5h3M6 15.5h3" />
            <path d="M7 11V7.5a2.5 2.5 0 0 1 5 0" />
        </>),
    },
    {
        label: 'Building grade ACP',
        href: `${HQ}/?list_55.html`,
        icon: icon(<>
            <path d="M3 21h18M5 21V4l8-1.5V21M13 21V9l6 1.5V21" />
            <path d="M8 7.5h2M8 11h2M8 14.5h2M15.5 13.5h1.5M15.5 17h1.5" />
        </>),
    },
    {
        label: 'Digital printing grade ACP',
        href: `${HQ}/?list_56.html`,
        icon: icon(<>
            <path d="M6.5 9V3.5h11V9" />
            <path d="M6.5 17H4.5a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 4.5 9h15a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5h-2" />
            <rect x="6.5" y="13.5" width="11" height="7" />
            <path d="M17.5 11.5h.01" />
        </>),
    },
    {
        label: 'Signage grade ACP',
        href: `${HQ}/?list_57.html`,
        icon: icon(<>
            <path d="M12 3v18M8.5 21h7" />
            <path d="M5 5.5h11.5L19 8l-2.5 2.5H5z" />
            <path d="M19 12.5H7.5L5 15l2.5 2.5H19z" />
        </>),
    },
    {
        label: 'Vehicle and ship grade ACP',
        href: `${HQ}/?list_58.html`,
        icon: icon(<>
            <path d="M2.5 6h11v10h-11zM13.5 9.5h4l3.5 3.5v3h-7.5" />
            <circle cx="6.5" cy="17.5" r="1.75" />
            <circle cx="17" cy="17.5" r="1.75" />
        </>),
    },
];

function HqTiles() {
    return (
        <nav aria-label="Feiteng products on feitengacp.com">
            {/* gap-px over a grey background draws HQ's hairline grid between the tiles */}
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-[#dedede] border border-[#dedede] rounded-lg overflow-hidden shadow-md">
                {TILES.map((t) => (
                    <li key={t.href}>
                        <a
                            href={t.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group h-full flex flex-col items-center justify-center gap-3 px-3 py-6 text-center bg-white/90 text-gray-800 hover:bg-[#004EA2] hover:text-white focus-visible:bg-[#004EA2] focus-visible:text-white transition-colors"
                        >
                            <span className="text-[#004EA2] group-hover:text-white group-focus-visible:text-white transition-colors">{t.icon}</span>
                            <span className="text-sm font-semibold leading-snug">{t.label}</span>
                            <span className="sr-only"> (opens feitengacp.com in a new tab)</span>
                        </a>
                    </li>
                ))}
            </ul>
        </nav>
    );
}

export default HqTiles;
