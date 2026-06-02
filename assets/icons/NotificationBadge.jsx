import Svg, { Circle } from "react-native-svg";

const NotificationBadge = (props) => (
    <Svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} {...props}>
        <Circle
            cx="12"
            cy="12"
            r="10"
            fill={props.color || "#FF4444"}
            stroke="white"
            strokeWidth={props.strokeWidth || 2}
        />
    </Svg>
);

export default NotificationBadge;

