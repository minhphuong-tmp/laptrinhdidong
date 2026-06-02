import * as React from "react";
import Svg, { Circle, Path } from "react-native-svg";

const Bio = (props) => (
    <Svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width={24}
        height={24}
        color="#000000"
        fill="none"
        {...props}
    >
        <Circle
            cx="12"
            cy="8"
            r="3"
            stroke="currentColor"
            strokeWidth={props.strokeWidth}
        />
        <Path
            d="M12 11c-3.314 0-6 2.686-6 6v1c0 1.657 1.343 3 3 3h6c1.657 0 3-1.343 3-3v-1c0-3.314-2.686-6-6-6z"
            stroke="currentColor"
            strokeWidth={props.strokeWidth}
        />
        <Path
            d="M6 20c1.5-1.5 3.5-2.5 6-2.5s4.5 1 6 2.5"
            stroke="currentColor"
            strokeWidth={props.strokeWidth}
        />
    </Svg>
);

export default Bio;