import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

export default function LoginScreen() {
  const { login, verifyTwoFactor } = useAuth();
  // Set when the password was right and the account wants its 2FA code.
  const [challenge, setChallenge]   = useState(null);
  const [code, setCode]             = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword]     = useState('');
  const [loading, setLoading]       = useState(false);
  const [showPass, setShowPass]     = useState(false);

  const handleLogin = async () => {
    if (!identifier.trim() || !password.trim()) {
      Alert.alert('Missing fields', 'Please enter your username/email and password.');
      return;
    }
    try {
      setLoading(true);
      const result = await login(identifier.trim(), password);
      if (result?.twoFactorRequired) setChallenge(result.challenge);
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Login failed';
      Alert.alert('Login failed', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCode = async () => {
    if (!code.trim()) return;
    try {
      setLoading(true);
      await verifyTwoFactor(challenge, code.trim());
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'That code did not work';
      if (/expired/i.test(msg)) { setChallenge(null); setCode(''); }
      Alert.alert('Verification failed', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={['#0D0F14', '#13161E', '#1A1E2A']} style={styles.root}>
      {/* Edge-to-edge is on, so Android no longer honours adjustResize — the
          window keeps its full height behind the keyboard. Both platforms need
          an explicit behaviour or the centred card sits under the keyboard. */}
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          {/* Logo area */}
          <View style={styles.logoWrap}>
            <LinearGradient
              colors={['#6366F1', '#8B5CF6']}
              style={styles.logoBox}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            >
              <Text style={styles.logoIcon}>🏠</Text>
            </LinearGradient>
            <Text style={styles.appName}>NexorCRM</Text>
            <Text style={styles.tagline}>NexorCRM Platform</Text>
          </View>

          {/* Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{challenge ? 'Two-step verification' : 'Welcome back'}</Text>
            <Text style={styles.cardSubtitle}>
              {challenge ? 'Enter the 6-digit code from your authenticator app, or a recovery code.' : 'Sign in to continue'}
            </Text>

            {challenge ? (
              <>
                <Text style={styles.label}>Code</Text>
                <View style={styles.inputWrap}>
                  <Text style={styles.inputIcon}>🔑</Text>
                  <TextInput
                    style={styles.input}
                    value={code}
                    onChangeText={setCode}
                    placeholder="123456"
                    placeholderTextColor={colors.text.muted}
                    keyboardType="number-pad"
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="oneTimeCode"
                    autoFocus
                  />
                </View>
                <TouchableOpacity onPress={handleCode} disabled={loading} activeOpacity={0.85}>
                  <LinearGradient colors={['#6366F1', '#8B5CF6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.loginBtn}>
                    {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.loginBtnText}>Verify →</Text>}
                  </LinearGradient>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setChallenge(null); setCode(''); }} style={{ marginTop: spacing.md, alignItems: 'center' }}>
                  <Text style={styles.cardSubtitle}>← Back</Text>
                </TouchableOpacity>
              </>
            ) : (
            <>

            {/* Username / Email */}
            <Text style={styles.label}>Username / Email</Text>
            <View style={styles.inputWrap}>
              <Text style={styles.inputIcon}>👤</Text>
              <TextInput
                style={styles.input}
                value={identifier}
                onChangeText={setIdentifier}
                placeholder="username or email"
                placeholderTextColor={colors.text.muted}
                keyboardType="default"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {/* Password */}
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputWrap}>
              <Text style={styles.inputIcon}>🔒</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Enter your password"
                placeholderTextColor={colors.text.muted}
                secureTextEntry={!showPass}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowPass(v => !v)} style={styles.eyeBtn}>
                <Text style={styles.eyeText}>{showPass ? '🙈' : '👁️'}</Text>
              </TouchableOpacity>
            </View>

            {/* Login Button */}
            <TouchableOpacity onPress={handleLogin} disabled={loading} activeOpacity={0.85}>
              <LinearGradient
                colors={['#6366F1', '#8B5CF6']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.loginBtn}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.loginBtnText}>Sign In →</Text>
                }
              </LinearGradient>
            </TouchableOpacity>
            </>
            )}
          </View>

          <Text style={styles.footer}>© 2026 NexorCRM</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1 },
  flex:   { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.screenH },

  logoWrap: { alignItems: 'center', marginBottom: spacing.xl },
  logoBox: {
    width: 72, height: 72,
    borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.md,
    shadowColor: '#6366F1', shadowOpacity: 0.5,
    shadowRadius: 20, elevation: 12,
  },
  logoIcon:    { fontSize: 36 },
  appName:     { color: colors.text.primary, fontSize: typography.size['3xl'], fontWeight: typography.weight.bold },
  tagline:     { color: colors.text.muted, fontSize: typography.size.sm, marginTop: 4 },

  card: {
    backgroundColor: colors.bg.secondary,
    borderRadius: spacing.radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border.default,
    marginBottom: spacing.lg,
  },
  cardTitle:    { color: colors.text.primary, fontSize: typography.size.xl, fontWeight: typography.weight.bold, marginBottom: 4 },
  cardSubtitle: { color: colors.text.muted, fontSize: typography.size.sm, marginBottom: spacing.lg },

  label: {
    color: colors.text.secondary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    marginBottom: 6,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg.tertiary,
    borderRadius: spacing.radius.md,
    borderWidth: 1,
    borderColor: colors.border.default,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    height: 50,
  },
  inputIcon: { fontSize: 16, marginRight: spacing.sm },
  input: {
    flex: 1,
    color: colors.text.primary,
    fontSize: typography.size.base,
  },
  eyeBtn:  { padding: 4 },
  eyeText: { fontSize: 18 },

  loginBtn: {
    height: 52,
    borderRadius: spacing.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    shadowColor: '#6366F1', shadowOpacity: 0.4,
    shadowRadius: 16, elevation: 8,
  },
  loginBtnText: {
    color: '#fff',
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    letterSpacing: 0.5,
  },

  footer: {
    color: colors.text.muted,
    fontSize: typography.size.xs,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
