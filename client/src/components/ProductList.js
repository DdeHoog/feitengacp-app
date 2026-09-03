import React, { useEffect, useState, useRef } from 'react';
import useProducts from '../hooks/useProducts';
import { useAuth } from '../authContext';
import { useCart } from '../cartContext';

// Per-row order control: quantity + add-to-cart. Local qty state per row so
// typing in one row doesn't re-render the whole (large) table.
function OrderCell({ product, onAdd }) {
    const [qty, setQty] = useState(1);
    return (
        <div className="flex items-center gap-1">
            <input
                type="number"
                min="1"
                value={qty}
                onChange={(e) => setQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-16 border border-gray-300 rounded px-1 py-0.5 text-sm"
                aria-label={`Quantity for ${product['Item Code']}`}
            />
            <button
                onClick={() => onAdd(qty)}
                className="px-2 py-1 rounded bg-[#003F84] text-white text-xs font-semibold hover:bg-[#00457F] transition-colors"
            >
                Add
            </button>
        </div>
    );
}

function ProductList() {
    const { products, loading, error } = useProducts();
    const { canExport } = useAuth();
    const { addItem } = useCart();
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
        { label: 'Article Nr.', key: 'Item Code' },
        { label: 'Description', key: 'Item Description' },
        { label: 'Type of SKIN / CORE', key: 'Type of Skin' },
        { label: 'Thickness', key: 'Thickness' },
        { label: 'Length', key: 'Length' },
        { label: 'Width', key: 'Width' },
        { label: 'Color', key: 'Color' },
        { label: 'Free Stock Now', key: 'Free Stock' },
        { label: 'Planned In', key: 'Planned In' },
        { label: 'Expected Free Stock', key: 'Expected Stock' },
        { label: 'Pallet QTY', key: 'Pallet QTY' },
    ];

    const stockKeys = ['Free Stock', 'Planned In', 'Expected Stock'];

    const downloadCsv = () => {
        // RFC 4180 quoting: wrap in quotes only when the value contains a comma,
        // quote, or newline, and double any embedded quotes.
        const escape = (value) => {
            const s = value == null ? '' : String(value);
            return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };

        const formatCell = (product, key) => {
            if (stockKeys.includes(key)) return formatStock(product[key]);
            if (key === 'Pallet QTY') {
                return product[key] == null ? '' : Number(product[key]);
            }
            return product[key];
        };

        const lines = [
            headers.map((h) => escape(h.label)).join(','),
            ...filteredProducts.map((p) =>
                headers.map((h) => escape(formatCell(p, h.key))).join(',')
            ),
        ];
        // Leading BOM so Excel opens UTF-8 (accented color names) correctly.
        const csv = '﻿' + lines.join('\r\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const today = new Date().toISOString().slice(0, 10);
        const a = document.createElement('a');
        a.href = url;
        a.download = `feitengacp-products-${today}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="container p-4">
            {canExport && (
                <div className="flex justify-start mb-3">
                    <button
                        onClick={downloadCsv}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#003F84] text-white text-sm font-semibold shadow hover:bg-[#00457F] transition-colors"
                    >
                        <span className="text-base leading-none">&#x2B07;</span>
                        Download CSV
                    </button>
                </div>
            )}
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
                                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Order</th>
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
                                    <td className="px-5 py-3 whitespace-nowrap">
                                        <OrderCell
                                            product={product}
                                            onAdd={(qty) => addItem({ article_code: product["Item Code"], description: product["Item Description"] }, qty)}
                                        />
                                    </td>
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