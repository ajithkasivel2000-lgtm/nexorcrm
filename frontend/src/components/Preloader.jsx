import React from 'react';
import './Preloader.css';

const Preloader = () => {
    return (
        <div className="global-preloader">
            <div className="spinner"></div>
            <div className="preloader-text">Loading...</div>
        </div>
    );
};

export default Preloader;
