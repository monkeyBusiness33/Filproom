import { CapacitorConfig } from '@capacitor/cli';
import {KeyboardResize} from "@capacitor/keyboard";

const config: CapacitorConfig = {
  appId: 'io.fliproom.mobile',
  appName: 'Fliproom',
  webDir: 'www',
  bundledWebRuntime: false,
  plugins: {
    FirebaseAuthentication: {
      skipNativeAuth: false,
      providers: ["google.com", "apple.com"]
    },
    SplashScreen: {
      launchShowDuration: 50000, // use this to avoid white screen (splashscreen closing before app loads)
    },
    plugins: {
      Keyboard: {
        resize: KeyboardResize.None,
      },
    },
  }
};

export default config;
