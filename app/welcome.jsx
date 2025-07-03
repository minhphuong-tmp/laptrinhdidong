
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Button from '../components/Button';
import ScreenWrapper from '../components/ScreenWrapper';
import { theme } from '../constants/theme';
import { hp, wp } from '../helpers/common';


const Welcome = () => {
  const router = useRouter();
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


});