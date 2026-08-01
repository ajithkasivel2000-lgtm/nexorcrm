import React from 'react';

const Pagination = ({
    currentPage,
    itemsPerPage,
    totalItems,
    onPageChange,
    dataLength = 0
}) => {
    return (
        <div className="advanced-pagination-footer">
            <div className="showing-entries" style={{ fontSize: '13px', color: '#64748b' }}>
                Showing {dataLength === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, totalItems)} of {totalItems} entries
            </div>
            <div className="pagination pagination-controls">
                <button
                    className={`page-btn ${currentPage === 1 ? 'disabled' : ''}`}
                    disabled={currentPage === 1}
                    onClick={() => onPageChange(currentPage - 1)}
                >
                    Previous
                </button>
                <button className="page-btn active" style={{ backgroundColor: '#8c6cf5', color: '#fff', border: '1px solid #8c6cf5' }}>
                    {currentPage}
                </button>
                <button
                    className={`page-btn ${currentPage * itemsPerPage >= totalItems ? 'disabled' : ''}`}
                    disabled={currentPage * itemsPerPage >= totalItems}
                    onClick={() => onPageChange(currentPage + 1)}
                >
                    Next
                </button>
            </div>
        </div>
    );
};

export default Pagination;
