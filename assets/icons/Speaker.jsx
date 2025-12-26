import React from 'react';
import Svg, { Path } from "react-native-svg";

const Speaker = (props) => (
    <Svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} color="#000000" fill="none" {...props}>
        <Path d="M12 2L7 7H3C2.44772 7 2 7.44772 2 8V16C2 16.5523 2.44772 17 3 17H7L12 22V2Z" stroke="currentColor" strokeWidth={props.strokeWidth} strokeLinejoin="round" />
        <Path d="M16 9C17.1046 9.55228 18 10.6569 18 12C18 13.3431 17.1046 14.4477 16 15" stroke="currentColor" strokeWidth={props.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M19 6C21.2091 7.10457 23 9.65685 23 12C23 14.3431 21.2091 16.8954 19 18" stroke="currentColor" strokeWidth={props.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
);


export default Speaker


