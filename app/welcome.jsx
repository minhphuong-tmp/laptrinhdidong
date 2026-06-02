
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Button from '../components/Button';
import ScreenWrapper from '../components/ScreenWrapper';
import { theme } from '../constants/theme';
import { hp, wp } from '../helpers/common';
import { signInWithMicrosoft } from '../services/authService';


const Welcome = () => {
  const router = useRouter();
  const [microsoftLoading, setMicrosoftLoading] = useState(false);

  const handleMicrosoftLogin = async () => {
    setMicrosoftLoading(true);
    try {
      const result = await signInWithMicrosoft();
      if (result.success) {
        // AuthContext sẽ tự động handle navigation
        console.log('Microsoft login successful');
      }
    } catch (error) {
      console.error('Microsoft login error:', error);
    } finally {
      setMicrosoftLoading(false);
    }
  };

  return (

    <ScreenWrapper bg="white">
      <StatusBar style="dark" />
      <View style={styles.container}>
        {/* CONTENT */}
        <View style={styles.content}>
          <Image
            style={styles.welcomeImage}
            resizeMode="contain"
            source={require('../assets/images/welcome.png')}
          />
          <View style={{ gap: 20 }}>
            <Text style={styles.title}>LinkUp!</Text>
            <Text style={styles.punchline}>
              Nơi để mà bạn có thể cùng nhau chia sẻ khoảnh khắc
            </Text>
          </View>
        </View>

        {/* FOOTER */}
        <View style={styles.footer}>
          <Button
            title="Bắt đầu"
            buttonStyle={{ marginHorizontal: wp(3) }}
            onPress={() => router.push('signUp')}
          />

          {/* Microsoft Login Button */}
          <Pressable
            style={[styles.microsoftButton, microsoftLoading && styles.microsoftButtonDisabled]}
            onPress={handleMicrosoftLogin}
            disabled={microsoftLoading}
          >
            {microsoftLoading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Text style={styles.microsoftIcon}>🔷</Text>
                <Text style={styles.microsoftButtonText}>Đăng nhập với Microsoft</Text>
              </>
            )}
          </Pressable>

          <View style={styles.bottomTextContainer}>
            <Text style={styles.loginText}>
              Đã có tài khoản !

            </Text>

            <Pressable onPress={() => router.push('login')}>

              <Text style={[styles.loginText, { color: theme.colors.primaryDark, fontWeight: theme.fonts.semiBold }]}>
                Đăng nhập
              </Text>
            </Pressable>


          </View>
        </View>
        {/* Close the container View above */}
      </View>
    </ScreenWrapper>


  );
};

export default Welcome;
const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'space-between',
    flex: 1,
    backgroundColor: 'white',
    paddingHorizontal: wp(4),
    paddingVertical: hp(4),
  },
  welcomeImage: {
    height: hp(40),
    width: wp(100),
    alignSelf: 'center',
    marginBottom: hp(8),
  },
  title: {
    color: theme.colors.text,
    fontSize: hp(4),
    textAlign: 'center',
    fontWeight: theme.fonts.extraBold,
  },
  punchline: {
    textAlign: 'center',
    paddingHorizontal: wp(10),
    fontSize: hp(1.7),
    color: theme.colors.text,
  },
  content: {
    alignItems: 'center',
  },
  footer: {
    gap: 25,
    width: '100%',

  },

  bottomTextContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
  },
  loginText: {
    color: theme.colors.text,
    fontSize: hp(1.8),
    textAlign: 'center',

  },
  microsoftButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00A4EF',
    paddingVertical: hp(1.8),
    paddingHorizontal: wp(5),
    borderRadius: theme.radius.md,
    marginHorizontal: wp(3),
    gap: wp(3),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  microsoftButtonDisabled: {
    opacity: 0.6,
  },
  microsoftIcon: {
    fontSize: wp(5),
  },
  microsoftButtonText: {
    color: '#FFFFFF',
    fontSize: hp(1.8),
    fontWeight: theme.fonts.semibold,
  },


});