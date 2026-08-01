export const sortData = (data, sortConfig) => {
    if (!sortConfig || !sortConfig.key) return data;

    return [...data].sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];

        // Attempt numeric comparison
        if (typeof aValue === 'string' && !isNaN(Number(aValue))) aValue = Number(aValue);
        if (typeof bValue === 'string' && !isNaN(Number(bValue))) bValue = Number(bValue);

        if (aValue < bValue) {
            return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
            return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
    });
};

export const filterData = (data, filters) => {
    if (!filters || Object.keys(filters).length === 0) return data;
    // Implementation of complex filtering can be added here
    return data;
};
