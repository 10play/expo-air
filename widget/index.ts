import 'react-native/Libraries/Core/InitializeCore';
import { AppRegistry, LogBox } from 'react-native';
import { BubbleContent } from './BubbleContent';

// Suppress all LogBox warnings/errors in the widget — these are expected
// operational issues (e.g. WebSocket disconnect on airplane mode) and should
// never surface as red/yellow modals to the end user.
LogBox.ignoreAllLogs(true);

AppRegistry.registerComponent('ExpoAirBubble', () => BubbleContent);
