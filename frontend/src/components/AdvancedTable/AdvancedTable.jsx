import React from 'react';
import TableHeader from './TableHeader';
import Pagination from './Pagination';
import './AdvancedTable.css';

const AdvancedTable = ({
    columns,
    data,
    sortConfig,
    onSort,
    selectedIds,
    onSelectAll,
    onSelectRow,
    currentPage,
    itemsPerPage,
    totalItems,
    onPageChange,
    renderRowActions,
    rowHighlightRule,
    enableSelection = true
}) => {
    const allSelected = data.length > 0 && selectedIds && selectedIds.length === data.length;

    return (
        <div className="advanced-table-wrapper">
            <table className="advanced-table">
                <TableHeader
                    columns={columns}
                    onSort={onSort}
                    allSelected={allSelected}
                    onSelectAll={onSelectAll}
                    enableSelection={enableSelection}
                />
                <tbody>
                    {data.length > 0 ? (
                        data.map((row, index) => (
                            <tr
                                key={row.id || index}
                                style={rowHighlightRule && rowHighlightRule(row, index) ? { backgroundColor: '#e8fae8' } : {}}
                            >
                                {enableSelection && (
                                    <td className="id-cell" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ minWidth: '24px' }}>
                                            {(currentPage - 1) * itemsPerPage + index + 1}
                                        </span>
                                        {onSelectRow && (
                                            <input
                                                type="checkbox"
                                                checked={selectedIds?.includes(row.id)}
                                                onChange={() => onSelectRow(row.id)}
                                            />
                                        )}
                                        {renderRowActions && renderRowActions(row)}
                                    </td>
                                )}
                                {columns.map(col => (
                                    <td key={col.key} style={col.cellStyle || {}}>
                                        {col.renderCell ? col.renderCell(row) : row[col.key]}
                                    </td>
                                ))}
                            </tr>
                        ))
                    ) : (
                        <tr>
                            <td colSpan={columns.length + (enableSelection ? 1 : 0)} style={{ textAlign: 'center', padding: '20px' }}>
                                No records found.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>

            {onPageChange && (
                <Pagination
                    currentPage={currentPage}
                    itemsPerPage={itemsPerPage}
                    totalItems={totalItems}
                    onPageChange={onPageChange}
                    dataLength={data.length}
                />
            )}
        </div>
    );
};

export default AdvancedTable;
