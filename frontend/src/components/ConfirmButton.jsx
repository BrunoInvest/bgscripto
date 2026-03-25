// frontend/src/components/ConfirmButton.jsx
import React, { useState } from 'react';

export const ConfirmButton = ({ 
    onConfirm, 
    children, 
    className = "", 
    confirmText = "Confirmar", 
    cancelText = "Cancelar", 
    confirmClass = "btn-danger", 
    disabled = false 
}) => {
    const [confirming, setConfirming] = useState(false);

    if (confirming) {
        return (
            <div style={{ display: 'inline-flex', gap: '8px', alignItems: 'center' }}>
                <button 
                    type="button" 
                    className={confirmClass} 
                    onClick={(e) => { 
                        e.preventDefault(); 
                        e.stopPropagation(); 
                        onConfirm(); 
                        setConfirming(false); 
                    }}
                >
                    {confirmText}
                </button>
                <button 
                    type="button" 
                    className="btn-secondary" 
                    onClick={(e) => { 
                        e.preventDefault(); 
                        e.stopPropagation(); 
                        setConfirming(false); 
                    }}
                >
                    {cancelText}
                </button>
            </div>
        );
    }

    return (
        <button 
            type="button" 
            className={className} 
            disabled={disabled} 
            onClick={(e) => { 
                e.preventDefault(); 
                e.stopPropagation(); 
                setConfirming(true); 
            }}
        >
            {children}
        </button>
    );
};
