import { isDisabled } from '@testing-library/user-event/dist/utils';
import React from 'react';
import '../css/Header.css';

function Header() {
    return (
        <div className="Header">
            <img src="/Images/spinly-logo.webp" alt="logo" className='spinly-logo'/>
            <h1>Spinly</h1>
            <button className='spinly-theme'>
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="currentColor" aria-hidden="true" viewBox="0 0 24 24"><path d="M12 19a1 1 0 0 1 .993.883L13 20v1a1 1 0 0 1-1.993.117L11 21v-1a1 1 0 0 1 1-1m6.313-2.09.094.083.7.7a1 1 0 0 1-1.32 1.497l-.094-.083-.7-.7a1 1 0 0 1 1.218-1.567zm-11.306.083a1 1 0 0 1 .083 1.32l-.083.094-.7.7a1 1 0 0 1-1.497-1.32l.083-.094.7-.7a1 1 0 0 1 1.414 0M4 11a1 1 0 0 1 .117 1.993L4 13H3a1 1 0 0 1-.117-1.993L3 11zm17 0a1 1 0 0 1 .117 1.993L21 13h-1a1 1 0 0 1-.117-1.993L20 11zM6.213 4.81l.094.083.7.7a1 1 0 0 1-1.32 1.497l-.094-.083-.7-.7A1 1 0 0 1 6.11 4.74zm12.894.083a1 1 0 0 1 .083 1.32l-.083.094-.7.7a1 1 0 0 1-1.497-1.32l.083-.094.7-.7a1 1 0 0 1 1.414 0M12 2a1 1 0 0 1 .993.883L13 3v1a1 1 0 0 1-1.993.117L11 4V3a1 1 0 0 1 1-1m0 5a5 5 0 1 1-4.995 5.217L7 12l.005-.217A5 5 0 0 1 12 7"/></svg>
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="currentColor" viewBox="0 0 24 24"><path d="M12 1.992a10 10 0 1 0 9.236 13.838c.341-.82-.476-1.644-1.298-1.31a6.5 6.5 0 0 1-6.864-10.787l.077-.08c.551-.63.113-1.653-.758-1.653h-.266l-.068-.006z"/></svg>
            </button>

            <button className='spinly-profile-picture'>
                <svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" fill="currentColor" stroke="currentColor" viewBox="-2.4 -2.4 28.8 28.8"><g id="SVGRepo_iconCarrier" fill="#000"><path d="M12 22.01c5.523 0 10-4.477 10-10s-4.477-10-10-10-10 4.477-10 10 4.477 10 10 10Z" opacity=".4"/><path d="M12 6.94c-2.07 0-3.75 1.68-3.75 3.75 0 2.03 1.59 3.68 3.7 3.74h.18a3.743 3.743 0 0 0 3.62-3.74c0-2.07-1.68-3.75-3.75-3.75Zm6.78 12.42A9.98 9.98 0 0 1 12 22.01c-2.62 0-5-1.01-6.78-2.65.24-.91.89-1.74 1.84-2.38 2.73-1.82 7.17-1.82 9.88 0 .96.64 1.6 1.47 1.84 2.38Z"/></g></svg>
            </button>
        </div>
    );
}

export default Header;