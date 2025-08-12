import React from 'react';

function DownloadPage() {
  const catalogues = [
    {
      id: 1,
      title: "Anodized Look Series",
      image: "/Anodized-Cover.png", 
      file: "/Anodized-Catalogue.pdf",  
      alt: "Anodized Look Series Catalogue Cover",
    },
    {
      id: 2,
      title: "Brushed Mirror Series",
      image: "/Brushed-Cover.png", 
      file: "/Brushed-Catalogue.pdf", 
      alt: "Brushed Mirror Series Catalogue Cover",
    },
    {
      id: 3,
      title: "Copper Stainless Steel Series",
      image: "/Copper-Cover.png",
      file: "/Copper-Catalogue.pdf",
      alt: "Copper Stainless Steel Catalogue Cover",
    },
    {
      id: 4,
      title: "Diffuse Reflection Series",
      image: "/Diffuse-Cover.png",
      file: "/Diffuse-Catalogue.pdf",
      alt: "Diffuse Reflection Series Catalogue Cover",
    },
    {
      id: 5,
      title: "Spectra Series",
      image: "/Spectra-Cover.png", 
      file: "/Spectra-Catalogue.pdf", 
      alt: "Spectra Series Catalogue Cover",
    },
    {
      id: 6,
      title: "Standard Series",
      image: "/Standard-Cover.png", 
      file: "/Standard-Catalogue.pdf", 
      alt: "Standard Series Catalogue Cover",
    },
    {
      id: 7,
      title: "Titanium Zinc Series",
      image: "/Titanium-Cover.png",
      file: "/Titanium-Catalogue.pdf",
      alt: "Pure Titanium Titanium Zinc Series Catalogue Cover",
    },
    {
      id: 8,
      title: "Texture Velvet Series",
      image: "/Velvet-Cover.png",
      file: "/Velvet-Catalogue.pdf",
      alt: "Texture Velvet Series Catalogue Cover",
    },
        {
      id: 9,
      title: "Wooden Stone Series",
      image: "/Wooden-Cover.png",
      file: "/Wooden-Catalogue.pdf",
      alt: "Wooden Stone Series Catalogue Cover",
    },
  ];

  const sustainableManual = {
    id: 5,
    title: "Sustainable Development Manual",
    image: "/Sustainable-Cover.png", 
    file: "/Sustainable-Catalogue.pdf",     
    alt: "Sustainable Development Manual Cover",
  };

  return (
    <div className="container p-3 flex-col max-w-[72vw] max-h-[69vh] ">
      {/* Top Heading */}
      <h1 className="text-xl md:text-2xl font-bold text-indigo-800 mb-2 text-left ">
        Catalogues available for download
      </h1>
      {/* Catalogues Grid */}
      <div className="grid grid-cols-4 gap-6 mb-4 w-full overflow-y-auto">
        {catalogues.map((catalogue) => (
          <a
            key={catalogue.id}
            href={catalogue.file}
            download={`${catalogue.title.replace(/\s/g, '-')}.pdf`}
            className="block rounded-lg shadow-lg hover:shadow-xl transition-shadow duration-300 overflow-hidden group w-64"
            aria-label={`Download ${catalogue.title}`}
          >
            <div className="relative overflow-hidden">
              <img
                src={catalogue.image}
                alt={catalogue.alt}
                className=" h-auto object-cover transform transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-black bg-opacity-30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <span className="text-white text-base font-semibold">Download</span> 
              </div>
            </div>
            <div className="p-2 bg-white"> 
              <h2 className="text-base text-gray-800 text-center font-semibold">{catalogue.title}</h2> 
            </div>
          </a>
        ))}
      </div>

      {/* Sustainable Development Manual */}
      <h2 className="text-xl md:text-2xl font-bold text-indigo-800 mb-2 text-left "> 
        Sustainable Development Manual
      </h2>
      <div className="flex "> 
        <a
          href={sustainableManual.file}
          download={`${sustainableManual.title.replace(/\s/g, '-')}.pdf`}
          className="block rounded-lg shadow-lg hover:shadow-xl transition-shadow duration-300 overflow-hidden group w-full sm:w-1/2 lg:w-1/3 xl:w-1/4" // Adjust width for single item
          aria-label={`Download ${sustainableManual.title}`}
        >
          <div className="relative overflow-hidden">
            <img
              src={sustainableManual.image}
              alt={sustainableManual.alt}
              className="w-full h-auto object-cover transform transition-transform duration-300 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-black bg-opacity-30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <span className="text-white text-base font-semibold">Download</span>
            </div>
          </div>
          <div className="p-2 bg-white">
            <h2 className="text-base font-semibold text-gray-800 text-center">{sustainableManual.title}</h2>
          </div>
        </a>
      </div>
    </div>
  );
}

export default DownloadPage;