import Svg, { Circle, Path } from "react-native-svg";

const Alarm = (props) => (
    <Svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} color="#000000" fill="none" {...props}>
        <Circle cx="12" cy="13" r="8" stroke="currentColor" strokeWidth={props.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M12 9V13L15 16" stroke="currentColor" strokeWidth={props.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M5 3L2 6" stroke="currentColor" strokeWidth={props.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M19 3L22 6" stroke="currentColor" strokeWidth={props.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
);

export default Alarm;


