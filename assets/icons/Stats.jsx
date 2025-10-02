import Svg, { Rect } from "react-native-svg";

const Stats = (props) => (
    <Svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width={props.width || 24}
        height={props.height || 24}
        color={props.color || "#000000"}
        fill="none"
        {...props}
    >
        {/* Biểu đồ cột thống kê */}
        <Rect
            x="3"
            y="12"
            width="3"
            height="9"
            stroke="currentColor"
            strokeWidth={props.strokeWidth || 2}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <Rect
            x="10"
            y="8"
            width="3"
            height="13"
            stroke="currentColor"
            strokeWidth={props.strokeWidth || 2}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <Rect
            x="17"
            y="4"
            width="3"
            height="17"
            stroke="currentColor"
            strokeWidth={props.strokeWidth || 2}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </Svg>
);

export default Stats;
