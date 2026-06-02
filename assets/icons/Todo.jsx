import Svg, { Path, Rect } from "react-native-svg";

const Todo = (props) => (
    <Svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width={props.width || 24}
        height={props.height || 24}
        color={props.color || "#000000"}
        fill="none"
        {...props}
    >
        {/* Tờ giấy chính */}
        <Rect
            x="4"
            y="2"
            width="16"
            height="20"
            rx="2"
            stroke="currentColor"
            strokeWidth={props.strokeWidth || 2}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        
        {/* Bút nhỏ ở góc */}
        <Path
            d="M16 6L18 4L20 6L18 8Z"
            stroke="currentColor"
            strokeWidth={props.strokeWidth || 2}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        
        {/* Đường kẻ ngang trong giấy */}
        <Path
            d="M8 8H14"
            stroke="currentColor"
            strokeWidth={props.strokeWidth || 2}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        
        <Path
            d="M8 12H16"
            stroke="currentColor"
            strokeWidth={props.strokeWidth || 2}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        
        <Path
            d="M8 16H12"
            stroke="currentColor"
            strokeWidth={props.strokeWidth || 2}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        
    </Svg>
);

export default Todo;
