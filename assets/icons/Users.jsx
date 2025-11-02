import Svg, { Path } from "react-native-svg";

const Users = (props) => (
    <Svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} color="#000000" fill="none" {...props}>
        <Path d="M16 21V19C16 17.9391 15.5786 16.9217 14.8284 16.1716C14.0783 15.4214 13.0609 15 12 15H5C3.93913 15 2.92172 15.4214 2.17157 16.1716C1.42143 16.9217 1 17.9391 1 19V21" stroke="currentColor" strokeWidth={props.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M8.5 11C10.7091 11 12.5 9.20914 12.5 7C12.5 4.79086 10.7091 3 8.5 3C6.29086 3 4.5 4.79086 4.5 7C4.5 9.20914 6.29086 11 8.5 11Z" stroke="currentColor" strokeWidth={props.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M20 21V19C19.9993 18.1137 19.7044 17.2528 19.1614 16.5523C18.6184 15.8519 17.8581 15.3516 17 15.13" stroke="currentColor" strokeWidth={props.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M15 3.13C15.8604 3.35031 16.623 3.85071 17.1676 4.55232C17.7122 5.25392 18.0078 6.11683 18.0078 7.005C18.0078 7.89317 17.7122 8.75608 17.1676 9.45768C16.623 10.1593 15.8604 10.6597 15 10.88" stroke="currentColor" strokeWidth={props.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
);

export default Users;

