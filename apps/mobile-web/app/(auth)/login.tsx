import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { loginUser } from '@/lib/directus';
import { useColorScheme } from '@/components/useColorScheme';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const bg = isDark ? '#121212' : '#FFFFFF';
  const textColor = isDark ? '#FFFFFF' : '#000000';
  const inputBg = isDark ? '#1E1E1E' : '#F5F5F5';
  const borderColor = isDark ? '#333333' : '#DDDDDD';
  const primaryColor = '#E85D7A';

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Completa todos los campos');
      return;
    }
    setLoading(true);
    const { user, error } = await loginUser(email, password);
    setLoading(false);
    if (error) {
      Alert.alert('Error', error);
      return;
    }
    // Redirigir según rol
    const role = user?.role || 'client';
    if (redirect) {
      router.replace(redirect as string);
    } else if (role === 'professional') {
      router.replace('/(pro)/online' as any);
    } else {
      router.replace('/(client)/map' as any);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: bg, justifyContent: 'center', padding: 24 }}
    >
      <View style={{ alignItems: 'center', marginBottom: 40 }}>
        <Text style={{ fontSize: 32, fontWeight: 'bold', color: primaryColor }}>Lookify</Text>
        <Text style={{ fontSize: 16, color: textColor, marginTop: 8, opacity: 0.7 }}>
          Inicia sesión para continuar
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
            autoComplete="password"
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
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" size="large" />
          ) : (
            <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>Iniciar sesión</Text>
          )}
        </TouchableOpacity>

        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          <Text style={{ color: textColor, opacity: 0.7 }}>¿No tienes cuenta?</Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
            <Text style={{ color: primaryColor, fontWeight: '600' }}>Regístrate</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}