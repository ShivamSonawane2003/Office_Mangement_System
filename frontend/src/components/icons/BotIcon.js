import React from 'react';

function BotIcon({ size = 24, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M9 10h30c4.418 0 8 3.582 8 8v14c0 4.418-3.582 8-8 8H22l-8 8v-8H9c-4.418 0-8-3.582-8-8V18c0-4.418 3.582-8 8-8Z"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="18" cy="25" r="3" fill="currentColor" />
      <circle cx="24" cy="25" r="3" fill="currentColor" />
      <circle cx="30" cy="25" r="3" fill="currentColor" />
    </svg>
  );
}

export default BotIcon;

