import { theme } from '../../constants/theme';
import Activity from './Activity';
import Alarm from './Alarm';
import ArrowLeft from './ArrowLeft';
import Award from './Award';
import Bell from './Bell';
import Bio from './Bio';
import Calendar from './Calendar';
import Call from './Call';
import Camera from './Camera';
import Chat from './Chat';
import Check from './Check';
import Close from './Close';
import Comment from './Comment';
import Delete from './Delete';
import DollarSign from './DollarSign';
import Edit from './Edit';
import FileText from './FileText';
import Fingerprint from './Fingerprint';
import Heart from './Heart';
import Home from './Home';
import Image from './Image';
import Location from './Location';
import Lock from './Lock';
import Logout from './logout';
import Mail from './Mail';
import Megaphone from './Megaphone';
import MessageCircle from './MessageCircle';
import Mic from './Mic';
import MicOff from './MicOff';
import NotificationBadge from './NotificationBadge';
import Phone from './Phone';
import Plus from './Plus';
import Refresh from './Refresh';
import Search from './Search';
import Send from './Send';
import Settings from './Settings';
import Share from './Share';
import Speaker from './Speaker';
import SpeakerOff from './SpeakerOff';
import Stats from './Stats';
import ThreeDotsCircle from './ThreeDotsCircle';
import ThreeDotsHorizontal from './ThreeDotsHorizontal';
import Todo from './Todo';
import User from './User';
import UserCheck from './UserCheck';
import UserPlus from './UserPlus';
import Users from './Users';
import Video from './Video';
const icons = {
  bio: Bio,
  chat: Chat,
  check: Check,
  close: Close,
  delete: Delete,
  home: Home,
  mail: Mail,
  lock: Lock,
  user: User,
  heart: Heart,
  plus: Plus,
  search: Search,
  location: Location,
  call: Call,
  camera: Camera,
  edit: Edit,
  arrowLeft: ArrowLeft,
  threeDotsCircle: ThreeDotsCircle,
  threeDotsHorizontal: ThreeDotsHorizontal,
  comment: Comment,
  share: Share,
  send: Send,
  logout: Logout,
  image: Image,
  video: Video,
  stats: Stats,
  todo: Todo,
  // New menu icons
  users: Users,
  activity: Activity,
  'file-text': FileText,
  bell: Bell,
  calendar: Calendar,
  award: Award,
  'dollar-sign': DollarSign,
  phone: Phone,
  // Notification badge
  'notification-badge': NotificationBadge,
  // Additional icons
  'arrow-left': ArrowLeft,
  megaphone: Megaphone,
  alarm: Alarm,
  refresh: Refresh,
  'user-check': UserCheck,
  'settings': Settings,
  'message-circle': MessageCircle,
  'fingerprint': Fingerprint,
  'user-plus': UserPlus,
  mic: Mic,
  micOff: MicOff,
  speaker: Speaker,
  speakerOff: SpeakerOff,
}

const Icon = ({ name, ...props }) => {
  const IconComponent = icons[name];
  if (!IconComponent) {
    console.warn(`Icon with name "${name}" does not exist.`);
    return null;
  }
  return (
    <IconComponent
      height={props.size || 24}
      width={props.size || 24}
      strokeWidth={props.strokeWidth || 1.9}
      color={theme.colors.textLight}
      {...props}
    />
  )
}

export default Icon;
