import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false
  })
});

export const registerNativePush = async () => {
  if (!Device.isDevice) {
    throw new Error('Push requiere dispositivo físico');
  }

  const { status: currentStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = currentStatus;

  if (finalStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    throw new Error('Permiso de notificaciones denegado');
  }

  const tokenOut = await Notifications.getExpoPushTokenAsync();
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';

  return {
    platform,
    expoPushToken: tokenOut.data
  };
};
