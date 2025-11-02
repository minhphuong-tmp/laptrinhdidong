import React from 'react';
import Svg, { Path } from 'react-native-svg';

const UserPlus = ({ size = 24, color = '#000', strokeWidth = 2 }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
            d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <Path
            d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <Path
            d="M19 8v6"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <Path
            d="M22 11h-6"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </Svg>
);

export default UserPlus;


