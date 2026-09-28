import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { registerUserDirectus } from '@/lib/directus';
import { useColorScheme } from '@/components/useColorScheme';

export default function RegisterScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const bg = isDark ? '#121212' : '#FFFFFF';
  const textColor = isDark ? '#FFFFFF' : '#000000';
  const inputBg = isDark ? '#1E1E1E' : '#F5F5F5';
  const borderColor = isDark ? '#333333' : '#DDDDDD';
  const primaryColor = '#E85D7A';

  const handleRegister = async () => {
    if (!email || !password || !confirmPassword) {
      Alert.alert('Error', 'Completa todos los campos');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Error', 'Las contraseñas no coinciden');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Error', 'La contraseña debe tener al menos 6 caracteres');
      return;
    }
    setLoading(true);
    const { error } = await registerUserDirectus(email, password);
    setLoading(false);
    if (error) {
      Alert.alert('Error', error);
      return;
    }
    // Ir a selección de rol
    router.replace('/(auth)/role-select');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: bg, justifyContent: 'center', padding: 24 }}
    >
      <View style={{ alignItems: 'center', marginBottom: 40 }}>
        <Text style={{ fontSize: 32, fontWeight: 'bold', color: primaryColor }}>Lookify</Text>
        <Text style={{ fontSize: 16, color: textColor, marginTop: 8, opacity: 0.7 }}>
          Crea tu cuenta
        </Text>
      </View>

      <View style={{ width: '100%', gap: 16 }}>
        <View>
          <Text style={{ color: textColor, marginBottom: 6, fontSize: 14 }}>Email</Text>
          <TextInput
            style={{
              backgroundColor: inputBg,
              borderWidth: 1,
              borderColor,
              borderRadius: 12,
              padding: 16,
              fontSize: 16,
              color: textColor,
            }}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            placeholder="tu@email.com"
            editable={!loading}
          />
        </View>

        <View>
          <Text style={{ color: textColor, marginBottom: 6, fontSize: 14 }}>Contraseña</Text>
          <TextInput
            style={{
              backgroundColor: inputBg,
              borderWidth: 1,
              borderColor,
              borderRadius: 12,
              padding: 16,
              fontSize: 16,
              color: textColor,
            }}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            placeholder="•••••••• (mín. 6)"
            editable={!loading}
          />
        </View>

        <View>
          <Text style={{ color: textColor, marginBottom: 6, fontSize: 14 }}>Confirmar contraseña</Text>
          <TextInput
            style={{
              backgroundColor: inputBg,
              borderWidth: 1,
              borderColor,
              borderRadius: 12,
              padding: 16,
              fontSize: 16,
              color: textColor,
            }}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            autoComplete="new-password"
            placeholder="••••••••"
            editable={!loading}
          />
        </View>

        <TouchableOpacity
          style={{
            backgroundColor: primaryColor,
            padding: 16,
            borderRadius: 12,
            alignItems: 'center',
            marginTop: 8,
            opacity: loading ? 0.7 : 1,
          }}
          onPress={handleRegister}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" size="large" />
          ) : (
            <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>Crear cuenta</Text>
          )}
        </TouchableOpacity>

        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          <Text style={{ color: textColor, opacity: 0.7 }}>¿Ya tienes cuenta?</Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/login')}>
            <Text style={{ color: primaryColor, fontWeight: '600' }}>Inicia sesión</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}