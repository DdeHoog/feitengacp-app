// Downloads page content. Adding a file = put the PDF + a *-thumb.jpg (≈640 px, see
// DESIGN-CONTEXT § Downloads page) in public/ and add one entry here; a category without
// entries is not shown, so a new category can be declared before its files arrive.

export const CATEGORIES = [
    { id: 'sales-catalogues', title: 'Sales catalogues', description: 'One catalogue per product series.' },
    { id: 'technical-manual', title: 'Technical manual', description: 'Processing and installation of Feiteng metal composite panels.' },
    { id: 'data-sheets', title: 'Data sheets', description: 'Technical data per product.' },
    { id: 'sustainability', title: 'Sustainability', description: 'Our approach to sustainable development.' },
];

const catalogue = (title, name, sizeMb) => ({
    category: 'sales-catalogues',
    title,
    file: `/${name}-Catalogue.pdf`,
    thumb: `/${name}-Cover-thumb.jpg`,
    sizeMb,
});

export const DOWNLOADS = [
    catalogue('Anodized Look Series', 'Anodized', 4.8),
    catalogue('Brushed Mirror Series', 'Brushed', 1.8),
    catalogue('Copper Stainless Steel Series', 'Copper', 6.5),
    catalogue('Diffuse Reflection Series', 'Diffuse', 2.4),
    catalogue('Spectra Series', 'Spectra', 6.8),
    catalogue('Standard Series', 'Standard', 2.4),
    catalogue('Titanium Zinc Series', 'Titanium', 1.3),
    catalogue('Texture Velvet Series', 'Velvet', 4.2),
    catalogue('Wooden Stone Series', 'Wooden', 2.4),
    catalogue('Bathroom Panel Series', 'Bathroom', 5.3),
    catalogue('Kitchen Splashback Series', 'Kitchen', 8.0),
    catalogue('Lyra Series', 'Lyra', 8.6),
    catalogue('Dipper Series', 'Dipper', 12.3),
    catalogue('Whiteboard Magnetic Panel', 'Whiteboard', 0.9),
    {
        category: 'technical-manual',
        title: 'Technical Manual',
        file: '/Technical-Manual.pdf',
        thumb: '/Technical-Cover-thumb.jpg',
        sizeMb: 19.7,
    },
    {
        category: 'sustainability',
        title: 'Sustainable Development Manual',
        file: '/Sustainable-Catalogue.pdf',
        thumb: '/Sustainable-Cover-thumb.jpg',
        sizeMb: 18.3,
    },
];
