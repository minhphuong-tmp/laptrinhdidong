import Svg, { Path } from 'react-native-svg';

const Close = ({ height, width, strokeWidth, color }) => (
    <Svg height={height} width={width} viewBox="0 0 24 24" fill="none">
        <Path
            d="M18 6L6 18M6 6L18 18"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </Svg>
);

export default Close;
