import React, { useEffect, useState, useRef } from 'react';
import useProducts from '../hooks/useProducts';//custom hook to fetch product data

function ProductList() {
  const { products, loading, error } = useProducts();
  const [filters, setFilters] = useState({});
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const headerRefs = useRef([]); 
  const dropdownRef = useRef(null);

  // Helper function to safely display stock numbers.
  // It will return 0 if the value is not a valid number (e.g., null, undefined, or empty string).
  const formatStock = (stockValue) => {
      const numericStock = parseInt(stockValue);
      return isNaN(numericStock) ? 0 : numericStock; // Return 0 if not a number, otherwise the numeric value
  };

  // Columns that will have filter dropdowns - keys must match object keys in the data!
  // Adding or removeing columns here will automatically update the filter dropdowns in the UI.
  const filterableColumns = [
    "Type of Skin",
    "Thickness",
    "Length",
    "Width",
    "Color"
  ];


  //sort the data based on planned in, put empty products at the end and stock at the top
  const sortedProducts = React.useMemo(() => {
    if (!products) return [];
    return [...products].sort((a, b) => {
      const hasStockA = formatStock(a['Free Stock']) > 0;
      const hasStockB = formatStock(b['Free Stock']) > 0;

      // If one has stock and the other doesn't, the one with stock comes first.
      if (hasStockA !== hasStockB) {
        return hasStockB ? 1 : -1; 
      }

      // 2ndly, sort by itemCode ascending
      return a['Item Code'].localeCompare(b['Item Code']);
    });
  }, [products]);


  const getUniqueValues = (columnName) => {
    if (!products || products.length === 0) return [];
    // Ensure we handle potential non-string values for numbers for filtering
    const values = products.map(product => {
      const value = product[columnName];
      if (filterableColumns.includes(columnName) && typeof value === 'string' && !isNaN(parseInt(value))){
        return parseInt(value); // Convert to number if it's a string representation of a number
      }
      return value; 
    });
    const unique = [...new Set(values)]; // Get unique values
    // Sort the unique values for better user experience - numbers numerically, strings alphabetically - 0 at the stat for stock value
    unique.sort((a, b) => {
      if (typeof a === 'number' && typeof b === 'number'){
        if (columnName.includes('Stock') || columnName.includes('Planned In')) {
          if (a === 0) return -1; 
          if (b === 0) return 1; 
        }
        return a - b; // Sort numerically
      }
      if (typeof a === 'string' && typeof b === 'string') {
        return a.localeCompare(b); // Strings alphabetically
      }
      return 0;
    });
    return unique
  };

  const toggleDropdown = (columnName, index) => {
    if (activeDropdown === columnName) {
      setActiveDropdown(null); 
    } else {
      setActiveDropdown(columnName);

      // Calculate the position of the dropdown based on the header element
      const headerElement = headerRefs.current[index];
      if (headerElement) {
        const rect = headerElement.getBoundingClientRect(); // Get the position of the header element
        setDropdownPosition({ 
          top: rect.bottom + window.scrollY,
          left: rect.left + window.scrollX 
        });
      }
    }
  };

 
  const applyFilter = (columnName, value) => {
    setFilters(prevFilters => ({
      ...prevFilters,
      [columnName]: value // Update the filter for the specific column
    }));
    setActiveDropdown(null); 
  }


  const clearFilter = (columnName) => {
    setFilters(prevFilters => {
      const newFilters = { ...prevFilters };
      delete newFilters[columnName]; // Remove the filter for the specific column
      return newFilters;
    });
    setActiveDropdown(null); 
  }

  const filteredProducts = sortedProducts.filter(product => {
    for (const column in filters) {
      const filterValue = filters[column];
      const productValue = product[column];

      //Handle type mismatches e.g. '3' vs 3 for numberic comparisons
      if (typeof filterValue === 'number' && typeof productValue === 'string' && !isNaN(parseInt(productValue))) {
        // Convert product value to number if it's a string representation of a number
        if (parseInt(productValue) !== filterValue) {
          return false; // Filter out products that don't match the filter
        }
      } else if (productValue !== filterValue) {
        return false; // Filter out products that don't match the filter
      }
    }
    return true; // Include product if it passes all filters
  });

  // Close dropdown if clicked outside the dropdown menu
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target) && !headerRefs.current.some(ref => ref 
        && ref.contains(event.target))) {
        setActiveDropdown(null); 
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);


  // Display a loading message while data is being fetched
  if (loading) {
    return (
      <div className="text-center py-8 text-lg text-gray-700">
        Loading products...
      </div>
    );
  }

  // Display an error message if data fetching fails
  if (error) {
    return (
      <div className="text-center py-8 text-lg text-red-600">
        Error: {error}
      </div>
    );
  }

  // Display a message if no products are found after loading
  if (!products || products.length === 0) {
    return (
      <div className="text-center py-8 text-lg text-gray-700">
        No products found.
      </div>
    );
  }
  const headers = [
        { label: 'Article nr.', key: 'Item Code', width: 'w-[12%]' }, 
        { label: 'Description', key: 'Item Description', width: 'w-[19%]' },
        { label: 'Type of skin', key: 'Type of Skin', width: 'w-[10%]' },
        { label: 'Thickness', key: 'Thickness', width: 'w-[8%]' },
        { label: 'Length', key: 'Length', width: 'w-[8%]' },
        { label: 'Width', key: 'Width', width: 'w-[8%]' },
        { label: 'Color', key: 'Color', width: 'w-[10%]' },
        { label: 'Pallet QTY', key: 'Pallet QTY', width: 'w-[7%]' },
        { label: 'Free stock', key: 'Free Stock', width: 'w-[8%]' },
        { label: 'Planned in', key: 'Planned In', width: 'w-[8%]' },
        { label: 'Expected stock', key: 'Expected Stock', width: 'w-[10%]' },
    ];

  // Render the list of products
  return (
    <div className="container p-4">
      <div className="rounded-lg shadow-lg">
        <table className="min-w-full divide-y divide-gray-200 table-fixed">
          <thead className="bg-indigo-700">
            <tr>
              {headers.map((header, index) => {
                const isFilterable = filterableColumns.includes(header.key);
                return (
                  <th
                    ref={el => headerRefs.current[index] = el}
                    key={header.key}
                    scope="col"
                    className={`px-4 py-3 text-left text-xs font-medium text-white uppercase tracking-wider relative select-none ${isFilterable ? 'cursor-pointer hover:bg-indigo-600' : ''}${header.width}`}
                    onClick={() => isFilterable && toggleDropdown(header.key, index)}
                  >
                    <div className="flex items-center">
                      <span>{header.label}</span>
                        {isFilterable && (
                          <span className="ml-2 text-indigo-200">&#x25BC;</span>
                        )}
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
        </table>
        {/* Div wrapped table body to make it scrollable */}
        <div className="overflow-y-auto h-[77vh]">
          <table className="min-w-full divide-y divide-gray-200 table-fixed">
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredProducts.map((product, index) => (
                <tr key={product.id} className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                  <td className="px-5 py-3 whitespace-nowrap text-sm text-gray-900 w-[9%]">{product["Item Code"]}</td>
                  <td className="px-5 py-3 whitespace-normal text-sm text-gray-700 w-[19%]">{product["Item Description"]}</td>
                  <td className="px-5 py-3 whitespace-nowrap text-sm text-gray-700 w-[10%]">{product["Type of Skin"]}</td>
                  <td className="px-5 py-3 whitespace-nowrap text-sm text-gray-700 w-[9%]">{product["Thickness"]}</td>
                  <td className="px-5 py-3 whitespace-nowrap text-sm text-gray-700 w-[7%]">{product["Length"]}</td>
                  <td className="px-5 py-3 whitespace-nowrap text-sm text-gray-700 w-[6.5%]">{product["Width"]}</td>
                  <td className="px-5 py-3 whitespace-nowrap text-sm text-gray-700 w-[7%]">{product["Color"]}</td>
                  <td className="px-5 py-3 whitespace-nowrap text-sm text-gray-700 w-[7%]">{product["Pallet QTY"]}</td>
                  <td className="px-5 py-3 whitespace-nowrap text-sm text-blue-700 font-semibold w-[8%]">{formatStock(product["Free Stock"])}</td>
                  <td className="px-5 py-3 whitespace-nowrap text-sm text-orange-700 font-semibold w-[8%]">{formatStock(product["Planned In"])}</td>
                  <td className="px-5 py-3 whitespace-nowrap text-sm text-green-700 font-semibold w-[10%]">{formatStock(product["Expected Stock"])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {/* Dropdown Menu is rendered outside the table to avoid clipping when too little rows are filtered for */}
      {activeDropdown && (
        <div
          ref={dropdownRef}
          className="absolute z-20 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 focus:outline-none max-h-60 overflow-y-auto"
          style={{ top: `${dropdownPosition.top}px`, left: `${dropdownPosition.left}px` }}
        >
          <div className="py-1">
            <button
              onClick={(e) => { e.stopPropagation(); clearFilter(activeDropdown); }}
             className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              Clear Filter
            </button>
            {getUniqueValues(activeDropdown).map((value, idx) => (
              <button
                key={idx}
                onClick={(e) => { e.stopPropagation(); applyFilter(activeDropdown, value); }}
                className={`block w-full text-left px-4 py-2 text-sm ${filters[activeDropdown] === value ? 'bg-indigo-100 text-indigo-900' : 'text-gray-700'} hover:bg-gray-100`}
              >
                {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value === null || value === '' ? 'N/A' : value.toString()}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default ProductList;
