import Svg, { Path } from "react-native-svg";

const Refresh = (props) => (
    <Svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} color="#000000" fill="none" {...props}>
        <Path d="M3 12A9 9 0 0 1 12 3A9 9 0 0 1 21 12A9 9 0 0 1 12 21A9 9 0 0 1 3 12Z" stroke="currentColor" strokeWidth={props.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M12 3V12L16.5 16.5" stroke="currentColor" strokeWidth={props.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
);

export default Refresh;


