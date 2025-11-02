import Svg, { Path } from "react-native-svg";

const ArrowLeft = (props) => (
  <Svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} color="#000000" fill="none" {...props}>
    <Path d="M19 12H5" stroke="currentColor" strokeWidth={props.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M12 19L5 12L12 5" stroke="currentColor" strokeWidth={props.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export default ArrowLeft;