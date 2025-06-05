import Svg, { Circle, Path } from "react-native-svg";

const Chat = (props) => (
    <Svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width={props.width || 24}
        height={props.height || 24}
        color={props.color || "#000000"}
        fill="none"
        {...props}
    >
        {/* Bong bóng chat */}
        <Path
            d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
            stroke="currentColor"
            strokeWidth={props.strokeWidth || 2}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        {/* 3 dấu chấm bên trong */}
        <Circle cx="9" cy="11" r="1" fill="currentColor" />
        <Circle cx="12" cy="11" r="1" fill="currentColor" />
        <Circle cx="15" cy="11" r="1" fill="currentColor" />
    </Svg>
);

export default Chat;