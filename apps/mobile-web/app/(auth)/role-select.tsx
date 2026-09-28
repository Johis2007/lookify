import { useState } from 'react';
import { View, Text, TouchableOpacity, KeyboardAvoidingView, Platform, Alert, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { logoutUser } from '@/lib/directus';
import { useColorScheme } from '@/components/useColorScheme';

const ROLES: { key: 'client' | 'professional'; label: string; desc: string; icon: string }[] = [
  { key: 'client', label: 'Cliente', desc: 'Busco profesionales de belleza cerca de mí', icon: '💅' },
  { key: 'professional', label: 'Profesional', desc: 'Ofrezco servicios de belleza a domicilio', icon: '✂️' },
];

export default function RoleSelectScreen() {
  const [selectedRole, setSelectedRole] = useState<'client' | 'professional' | null>(null);
  const [loading, setLoading] = useState(false);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const bg = isDark ? '#121212' : '#FFFFFF';
  const textColor = isDark ? '#FFFFFF' : '#000000';
  const cardBg = isDark ? '#1E1E1E' : '#F5F5F5';
  const borderColor = isDark ? '#333333' : '#DDDDDD';
  const primaryColor = '#E85D7A';

  const handleContinue = async () => {
    if (!selectedRole) {
      Alert.alert('Error', 'Selecciona un rol para continuar');
      return;
    }
    setLoading(true);
    try {
      // El usuario ya está logueado, solo guardamos el rol en el perfil
      // En producción se actualizaría el rol en Directus
      setLoading(false);
      if (selectedRole === 'professional') {
        router.replace('/(pro)/online' as any);
      } else {
        router.replace('/(client)/map' as any);
      }
    } catch {
      setLoading(false);
      Alert.alert('Error', 'No se pudo continuar');
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
          ¿Cómo quieres usar la app?
        </Text>
      </View>

      <View style={{ width: '100%', gap: 12 }}>
        {ROLES.map((role) => (
          <TouchableOpacity
            key={role.key}
            onPress={() => setSelectedRole(role.key)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              padding: 20,
              backgroundColor: cardBg,
              borderWidth: 2,
              borderColor: selectedRole === role.key ? primaryColor : borderColor,
              borderRadius: 16,
              gap: 16,
            }}
          >
            <Text style={{ fontSize: 40 }}>{role.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: '600', color: textColor }}>{role.label}</Text>
              <Text style={{ fontSize: 13, color: textColor, opacity: 0.7, marginTop: 2 }}>
                {role.desc}
              </Text>
            </View>
            {selectedRole === role.key && (
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: primaryColor,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 'bold' }}>✓</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={{
          backgroundColor: primaryColor,
          padding: 16,
          borderRadius: 12,
          alignItems: 'center',
          marginTop: 24,
          opacity: selectedRole && !loading ? 1 : 0.5,
        }}
        onPress={handleContinue}
        disabled={!selectedRole || loading}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" size="large" />
        ) : (
          <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>Continuar</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={async () => {
          await logoutUser();
          router.replace('/(auth)/login');
        }}
        style={{ marginTop: 16, alignItems: 'center' }}
      >
        <Text style={{ color: textColor, opacity: 0.7 }}>¿No es tu cuenta? Cerrar sesión</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}