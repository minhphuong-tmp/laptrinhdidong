import Svg, { Path } from 'react-native-svg';

const Check = ({ height, width, strokeWidth, color }) => (
    <Svg height={height} width={width} viewBox="0 0 24 24" fill="none">
        <Path
            d="M20 6L9 17L4 12"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </Svg>
);

export default Check;
