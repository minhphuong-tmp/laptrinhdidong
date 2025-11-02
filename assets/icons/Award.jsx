import Svg, { Circle, Path } from "react-native-svg";

const Award = (props) => (
    <Svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} color="#000000" fill="none" {...props}>
        <Circle cx="12" cy="8" r="6" stroke="currentColor" strokeWidth={props.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M15.477 12.89L17 22L12 19L7 22L8.523 12.89" stroke="currentColor" strokeWidth={props.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
);

export default Award;

