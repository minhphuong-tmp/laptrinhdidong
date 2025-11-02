import Svg, { Path, Rect } from "react-native-svg";

const Calendar = (props) => (
    <Svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} color="#000000" fill="none" {...props}>
        <Rect x="3" y="4" width="18" height="18" rx="2" ry="2" stroke="currentColor" strokeWidth={props.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M16 2V6" stroke="currentColor" strokeWidth={props.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M8 2V6" stroke="currentColor" strokeWidth={props.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M3 10H21" stroke="currentColor" strokeWidth={props.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
);

export default Calendar;

