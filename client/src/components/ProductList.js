import React, { useEffect, useState, useRef } from 'react';
import useProducts from '../hooks/useProducts';

function ProductList() {
    const { products, loading, error } = useProducts();
    const [filters, setFilters] = useState({});
    const [activeDropdown, setActiveDropdown] = useState(null);
    const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
    const headerRefs = useRef([]);
    const dropdownRef = useRef(null);

    const formatStock = (stockValue) => {
        const numericStock = parseInt(stockValue);
        return isNaN(numericStock) ? 0 : numericStock;
    };

    const filterableColumns = [
        "Type of Skin",
        "Thickness",
        "Length",
        "Width",
        "Color"
    ];

    const sortedProducts = React.useMemo(() => {
        if (!products) return [];
        return [...products].sort((a, b) => {
            const hasStockA = formatStock(a['Free Stock']) > 0;
            const hasStockB = formatStock(b['Free Stock']) > 0;
            if (hasStockA !== hasStockB) {
                return hasStockB ? 1 : -1;
            }
            return a['Item Code'].localeCompare(b['Item Code']);
        });
    }, [products]);

    const getUniqueValues = (columnName) => {
        if (!products || products.length === 0) return [];
        const values = products.map(product => {
            const value = product[columnName];
            if (filterableColumns.includes(columnName) && typeof value === 'string' && !isNaN(parseInt(value))) {
                return parseInt(value);
            }
            return value;
        });
        const unique = [...new Set(values)];
        unique.sort((a, b) => {
            if (typeof a === 'number' && typeof b === 'number') {
                if (columnName.includes('Stock') || columnName.includes('Planned In')) {
                    if (a === 0) return -1;
                    if (b === 0) return 1;
                }
                return a - b;
            }
            if (typeof a === 'string' && typeof b === 'string') {
                return a.localeCompare(b);
            }
            return 0;
        });
        return unique;
    };

    const toggleDropdown = (columnName, index) => {
        if (activeDropdown === columnName) {
            setActiveDropdown(null);
        } else {
            setActiveDropdown(columnName);
            const headerElement = headerRefs.current[index];
            if (headerElement) {
                const rect = headerElement.getBoundingClientRect();
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
            [columnName]: value
        }));
        setActiveDropdown(null);
    };

    const clearFilter = (columnName) => {
        setFilters(prevFilters => {
            const newFilters = { ...prevFilters };
            delete newFilters[columnName];
            return newFilters;
        });
        setActiveDropdown(null);
    };

    const filteredProducts = sortedProducts.filter(product => {
        for (const column in filters) {
            const filterValue = filters[column];
            const productValue = product[column];
            if (typeof filterValue === 'number' && typeof productValue === 'string' && !isNaN(parseInt(productValue))) {
                if (parseInt(productValue) !== filterValue) {
                    return false;
                }
            } else if (productValue !== filterValue) {
                return false;
            }
        }
        return true;
    });

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target) && !headerRefs.current.some(ref => ref && ref.contains(event.target))) {
                setActiveDropdown(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    if (loading) {
        return <div className="text-center py-8 text-lg text-gray-700">Loading products...</div>;
    }
    if (error) {
        return <div className="text-center py-8 text-lg text-red-600">Error: {error}</div>;
    }
    if (!products || products.length === 0) {
        return <div className="text-center py-8 text-lg text-gray-700">No products found.</div>;
    }

    const headers = [
        { label: 'Article nr.', key: 'Item Code' },
        { label: 'Description', key: 'Item Description' },
        { label: 'Type of skin', key: 'Type of Skin' },
        { label: 'Thickness', key: 'Thickness' },
        { label: 'Length', key: 'Length' },
        { label: 'Width', key: 'Width' },
        { label: 'Color', key: 'Color' },
        { label: 'Free stock', key: 'Free Stock' },
        { label: 'Planned in', key: 'Planned In' },
        { label: 'Expected stock', key: 'Expected Stock' },
        { label: 'Pallet QTY', key: 'Pallet QTY' },
    ];

    return (
        <div className="container p-4">
            <div className="rounded-lg shadow-lg flex flex-col">
                <div className="overflow-y-auto h-[77vh]">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-[#003F84] sticky top-0 z-10">
                            <tr>
                                {headers.map((header, index) => {
                                    const isFilterable = filterableColumns.includes(header.key);
                                    return (
                                        <th
                                            ref={el => headerRefs.current[index] = el}
                                            key={header.key}
                                            scope="col"
                                            className={`px-4 py-3 text-left text-xs font-medium text-white uppercase tracking-wider relative select-none ${isFilterable ? 'cursor-pointer hover:bg-[#00457F]' : ''}`}
                                            onClick={() => isFilterable && toggleDropdown(header.key, index)}
                                        >
                                            <div className="flex items-center">
                                                <span>{header.label}</span>
                                                {isFilterable && (
                                                    <span className="ml-2 text-white/70">&#x25BC;</span>
                                                )}
                                            </div>
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {filteredProducts.map((product, index) => (
                                <tr key={product.id} className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                                    <td className="px-5 py-3 whitespace-nowrap text-sm text-gray-900">{product["Item Code"]}</td>
                                    <td className="px-5 py-3 whitespace-normal text-sm text-gray-700">{product["Item Description"]}</td>
                                    <td className="px-5 py-3 whitespace-nowrap text-sm text-gray-700">{product["Type of Skin"]}</td>
                                    <td className="px-5 py-3 whitespace-nowrap text-sm text-gray-700">{product["Thickness"]}</td>
                                    <td className="px-5 py-3 whitespace-nowrap text-sm text-gray-700">{product["Length"]}</td>
                                    <td className="px-5 py-3 whitespace-nowrap text-sm text-gray-700">{product["Width"]}</td>
                                    <td className="px-5 py-3 whitespace-nowrap text-sm text-gray-700">{product["Color"]}</td>
                                    <td className="px-5 py-3 whitespace-nowrap text-sm text-blue-700 font-semibold">{formatStock(product["Free Stock"])}</td>
                                    <td className="px-5 py-3 whitespace-nowrap text-sm text-orange-700 font-semibold">{formatStock(product["Planned In"])}</td>
                                    <td className="px-5 py-3 whitespace-nowrap text-sm text-green-700 font-semibold">{formatStock(product["Expected Stock"])}</td>
                                    <td className="px-5 py-3 whitespace-nowrap text-sm text-gray-700">{product["Pallet QTY"] == null ? "—" : Number(product["Pallet QTY"])}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
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