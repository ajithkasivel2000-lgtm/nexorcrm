import React from 'react';
import { ArrowUpDown } from 'lucide-react';

const TableHeader = ({ columns, onSort, allSelected, onSelectAll, enableSelection = true }) => {
    return (
        <thead>
            <tr>
                {enableSelection && (
                    <th>
                        #
                        <input
                            type="checkbox"
                            style={{ marginLeft: 5 }}
                            checked={allSelected}
                            onChange={onSelectAll}
                        />
                    </th>
                )}
                {columns.map((col) => (
                    <th
                        key={col.key}
                        onClick={() => col.sortable && onSort ? onSort(col.key) : null}
                        style={{ cursor: col.sortable ? 'pointer' : 'default' }}
                    >
                        {col.header}
                        {col.sortable && <ArrowUpDown size={12} className="table-arrows" />}
                    </th>
                ))}
            </tr>
        </thead>
    );
};

export default TableHeader;
