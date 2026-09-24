import React from 'react';
import './Preloader.css';

const Preloader = () => {
    return (
        <div className="advanced-preloader-overlay">
            <div className="loader-container">
                <div className="loader-ring ring-1"></div>
                <div className="loader-ring ring-2"></div>
                <div className="loader-ring ring-3"></div>
                <div className="loader-core"></div>
            </div>
            <div className="loader-text">
                Initializing<span className="dots"></span>
            </div>
        </div>
    );
};

export default Preloader;
