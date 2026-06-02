import React from 'react';
import Svg, { Line, Path } from "react-native-svg";

const SpeakerOff = (props) => (
    <Svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} color="#000000" fill="none" {...props}>
        <Path d="M12 2L7 7H3C2.44772 7 2 7.44772 2 8V16C2 16.5523 2.44772 17 3 17H7L12 22V2Z" stroke="currentColor" strokeWidth={props.strokeWidth} strokeLinejoin="round" />
        <Line x1="18" y1="6" x2="22" y2="10" stroke="currentColor" strokeWidth={props.strokeWidth} strokeLinecap="round" />
        <Line x1="18" y1="10" x2="22" y2="6" stroke="currentColor" strokeWidth={props.strokeWidth} strokeLinecap="round" />
        <Line x1="15" y1="9" x2="18" y2="12" stroke="currentColor" strokeWidth={props.strokeWidth} strokeLinecap="round" />
        <Line x1="15" y1="12" x2="18" y2="9" stroke="currentColor" strokeWidth={props.strokeWidth} strokeLinecap="round" />
    </Svg>
);


export default SpeakerOff


